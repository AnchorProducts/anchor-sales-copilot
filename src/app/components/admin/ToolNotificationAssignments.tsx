"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/app/components/ui/Card";

type Tool = { key: string; label: string; description: string };
type UserRow = { id: string; full_name: string | null; email: string | null; role: string | null };

function userLabel(u: UserRow): string {
  return (u.full_name && u.full_name.trim()) || u.email || u.id.slice(0, 8);
}

// Admin control: for each notifiable "tool" (event), choose which users get a
// push notification. Saves per-tool on every change. Users still have to enable
// notifications on their own device (Settings → Notifications) to actually
// receive them.
export default function ToolNotificationAssignments() {
  const [tools, setTools] = useState<Tool[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [assignments, setAssignments] = useState<Record<string, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const usersById = useMemo(() => {
    const m = new Map<string, UserRow>();
    for (const u of users) m.set(u.id, u);
    return m;
  }, [users]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/admin/notification-tools", { cache: "no-store", credentials: "include" });
        const json = await res.json().catch(() => null);
        if (!alive) return;
        if (!res.ok) {
          setErr(json?.error || "Failed to load.");
          return;
        }
        setTools(json.tools || []);
        setUsers(json.users || []);
        setAssignments(json.assignments || {});
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  async function save(toolKey: string, userIds: string[]) {
    const prev = assignments[toolKey] || [];
    setAssignments((p) => ({ ...p, [toolKey]: userIds })); // optimistic
    setErr(null);
    setMsg(null);
    const res = await fetch("/api/admin/notification-tools", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ tool_key: toolKey, user_ids: userIds }),
    });
    if (!res.ok) {
      setAssignments((p) => ({ ...p, [toolKey]: prev })); // rollback
      const json = await res.json().catch(() => null);
      setErr(json?.error || "Save failed.");
    } else {
      setMsg("Saved.");
      setTimeout(() => setMsg(null), 1500);
    }
  }

  function addUser(toolKey: string, userId: string) {
    if (!userId) return;
    const current = assignments[toolKey] || [];
    if (current.includes(userId)) return;
    save(toolKey, [...current, userId]);
  }

  function removeUser(toolKey: string, userId: string) {
    const current = assignments[toolKey] || [];
    save(toolKey, current.filter((id) => id !== userId));
  }

  return (
    <Card className="p-5 sm:p-6">
      <div className="mb-3">
        <h2 className="text-base font-bold text-[var(--anchor-deep)] sm:text-lg">Tool notifications</h2>
        <p className="mt-0.5 text-xs text-[var(--anchor-gray)]">
          Choose which users get a push notification for each event. Users also have to turn on
          notifications on their device under Settings → Notifications.
        </p>
      </div>

      {err && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{err}</div>}
      {msg && <div className="mb-3 rounded-lg bg-[var(--anchor-mint)]/40 px-3 py-2 text-xs text-[var(--anchor-deep)]">{msg}</div>}

      {loading ? (
        <div className="text-[12px] text-[var(--anchor-gray)]">Loading…</div>
      ) : (
        <div className="grid gap-3">
          {tools.map((tool) => {
            const assigned = assignments[tool.key] || [];
            const unassigned = users.filter((u) => !assigned.includes(u.id));
            return (
              <div key={tool.key} className="rounded-xl border border-[var(--border-default)] p-3">
                <div className="text-sm font-semibold text-[var(--anchor-deep)]">{tool.label}</div>
                <div className="text-[11px] text-[var(--anchor-gray)]">{tool.description}</div>

                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  {assigned.length === 0 && (
                    <span className="text-[11px] text-[var(--anchor-gray)]">No one assigned.</span>
                  )}
                  {assigned.map((uid) => {
                    const u = usersById.get(uid);
                    return (
                      <span
                        key={uid}
                        className="inline-flex items-center gap-1.5 rounded-full bg-[var(--anchor-mint)]/50 px-2.5 py-1 text-xs text-[var(--anchor-deep)]"
                      >
                        <span className="max-w-[200px] truncate" title={u ? userLabel(u) : uid}>
                          {u ? userLabel(u) : uid.slice(0, 8)}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeUser(tool.key, uid)}
                          aria-label="Remove"
                          className="text-[var(--anchor-deep)]/60 hover:text-red-600"
                        >
                          ✕
                        </button>
                      </span>
                    );
                  })}
                </div>

                <div className="mt-2">
                  <select
                    value=""
                    onChange={(e) => { addUser(tool.key, e.target.value); e.target.value = ""; }}
                    className="h-9 w-full max-w-xs rounded-xl border border-[var(--border-default)] bg-white px-3 text-sm outline-none focus:border-[var(--anchor-green)] sm:w-auto"
                  >
                    <option value="">+ Add user…</option>
                    {unassigned.map((u) => (
                      <option key={u.id} value={u.id}>
                        {userLabel(u)}{u.role ? ` (${u.role})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
