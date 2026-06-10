"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/app/components/ui/Card";

type Tool = { key: string; label: string; description: string };
type UserRow = { id: string; full_name: string | null; email: string | null; role: string | null };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function userLabel(u: UserRow): string {
  return (u.full_name && u.full_name.trim()) || u.email || u.id.slice(0, 8);
}

// Small add-an-email control (its own input state). Validates before calling back.
function EmailAdder({ onAdd }: { onAdd: (email: string) => void }) {
  const [input, setInput] = useState("");
  const [err, setErr] = useState<string | null>(null);
  function add() {
    const v = input.trim().toLowerCase();
    setErr(null);
    if (!v) return;
    if (!EMAIL_RE.test(v)) { setErr("Not a valid email."); return; }
    onAdd(v);
    setInput("");
  }
  return (
    <div>
      <div className="flex gap-2">
        <input
          type="email"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder="+ Add email…"
          className="h-9 w-full max-w-xs rounded-xl border border-[var(--border-default)] bg-white px-3 text-sm outline-none focus:border-[var(--anchor-green)] sm:w-56"
        />
        <button
          type="button"
          onClick={add}
          className="h-9 shrink-0 rounded-xl border border-[var(--anchor-green)] bg-[var(--anchor-green)] px-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--anchor-deep)]"
        >
          Add
        </button>
      </div>
      {err && <div className="mt-1 text-xs text-red-600">{err}</div>}
    </div>
  );
}

// The single place to configure who gets notified for each event. Per tool you
// can assign app users (email + push) and/or add raw email addresses (email
// only). Saves on every change.
export default function ToolNotificationAssignments() {
  const [tools, setTools] = useState<Tool[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [assignments, setAssignments] = useState<Record<string, string[]>>({});
  const [toolEmails, setToolEmails] = useState<Record<string, string[]>>({});
  const [pushConfigured, setPushConfigured] = useState<boolean | null>(null);
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
        setToolEmails(json.toolEmails || {});
        setPushConfigured(Boolean(json.pushConfigured));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  function flash() {
    setMsg("Saved.");
    setTimeout(() => setMsg(null), 1500);
  }

  async function saveUsers(toolKey: string, userIds: string[]) {
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
      setAssignments((p) => ({ ...p, [toolKey]: prev }));
      const json = await res.json().catch(() => null);
      setErr(json?.error || "Save failed.");
    } else flash();
  }

  async function saveEmails(toolKey: string, emails: string[]) {
    const prev = toolEmails[toolKey] || [];
    setToolEmails((p) => ({ ...p, [toolKey]: emails })); // optimistic
    setErr(null);
    setMsg(null);
    const res = await fetch("/api/admin/notification-tools", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ tool_key: toolKey, emails }),
    });
    if (!res.ok) {
      setToolEmails((p) => ({ ...p, [toolKey]: prev }));
      const json = await res.json().catch(() => null);
      setErr(json?.error || "Save failed.");
    } else flash();
  }

  function addUser(toolKey: string, userId: string) {
    if (!userId) return;
    const current = assignments[toolKey] || [];
    if (current.includes(userId)) return;
    saveUsers(toolKey, [...current, userId]);
  }
  function removeUser(toolKey: string, userId: string) {
    saveUsers(toolKey, (assignments[toolKey] || []).filter((id) => id !== userId));
  }
  function addEmail(toolKey: string, email: string) {
    const current = toolEmails[toolKey] || [];
    if (current.includes(email)) return;
    saveEmails(toolKey, [...current, email]);
  }
  function removeEmail(toolKey: string, email: string) {
    saveEmails(toolKey, (toolEmails[toolKey] || []).filter((e) => e !== email));
  }

  return (
    <Card className="p-5 sm:p-6">

      {pushConfigured === false && (
        <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-[#7c4a00]">
          ⚠️ Push isn’t configured on this deployment (no VAPID keys). Assignments still save and
          emails still send, but no push goes out from here. Set <code>VAPID_PUBLIC_KEY</code>,{" "}
          <code>VAPID_PRIVATE_KEY</code>, and <code>VAPID_SUBJECT</code> on every deployment that
          handles form submissions (including the external rep app), then redeploy. Check any
          deployment at <code>/api/push/status</code>.
        </div>
      )}
      {err && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{err}</div>}
      {msg && <div className="mb-3 rounded-lg bg-[var(--anchor-mint)]/40 px-3 py-2 text-xs text-[var(--anchor-deep)]">{msg}</div>}

      {loading ? (
        <div className="text-[12px] text-[var(--anchor-gray)]">Loading…</div>
      ) : (
        <div className="grid gap-3">
          {tools.map((tool) => {
            const assigned = assignments[tool.key] || [];
            const emails = toolEmails[tool.key] || [];
            const unassigned = users.filter((u) => !assigned.includes(u.id));
            return (
              <div key={tool.key} className="rounded-xl border border-[var(--border-default)] p-3">
                <div className="text-sm font-semibold text-[var(--anchor-deep)]">{tool.label}</div>
                <div className="text-[11px] text-[var(--anchor-gray)]">{tool.description}</div>

                {/* Users (email + push) */}
                <div className="mt-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--anchor-gray)]">
                  Users (email + push)
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  {assigned.length === 0 && (
                    <span className="text-[11px] text-[var(--anchor-gray)]">No one assigned.</span>
                  )}
                  {assigned.map((uid) => {
                    const u = usersById.get(uid);
                    return (
                      <span key={uid} className="inline-flex items-center gap-1.5 rounded-full bg-[var(--anchor-mint)]/50 px-2.5 py-1 text-xs text-[var(--anchor-deep)]">
                        <span className="max-w-[200px] truncate" title={u ? userLabel(u) : uid}>
                          {u ? userLabel(u) : uid.slice(0, 8)}
                        </span>
                        <button type="button" onClick={() => removeUser(tool.key, uid)} aria-label="Remove" className="text-[var(--anchor-deep)]/60 hover:text-red-600">✕</button>
                      </span>
                    );
                  })}
                </div>
                <div className="mt-1.5">
                  <select
                    value=""
                    onChange={(e) => { addUser(tool.key, e.target.value); e.target.value = ""; }}
                    className="h-9 w-full max-w-xs rounded-xl border border-[var(--border-default)] bg-white px-3 text-sm outline-none focus:border-[var(--anchor-green)] sm:w-56"
                  >
                    <option value="">+ Add user…</option>
                    {unassigned.map((u) => (
                      <option key={u.id} value={u.id}>{userLabel(u)}{u.role ? ` (${u.role})` : ""}</option>
                    ))}
                  </select>
                </div>

                {/* Raw emails (email only) */}
                <div className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-[var(--anchor-gray)]">
                  Emails (email only)
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  {emails.length === 0 && (
                    <span className="text-[11px] text-[var(--anchor-gray)]">None.</span>
                  )}
                  {emails.map((email) => (
                    <span key={email} className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-soft)] px-2.5 py-1 text-xs text-[var(--anchor-deep)]">
                      <span className="max-w-[220px] truncate" title={email}>{email}</span>
                      <button type="button" onClick={() => removeEmail(tool.key, email)} aria-label="Remove" className="text-[var(--anchor-deep)]/60 hover:text-red-600">✕</button>
                    </span>
                  ))}
                </div>
                <div className="mt-1.5">
                  <EmailAdder onAdd={(email) => addEmail(tool.key, email)} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
