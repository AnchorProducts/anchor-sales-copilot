"use client";

import { useEffect, useMemo, useState } from "react";

/* ============================================================================
 * Who may use one restricted tool.
 *
 * The audience switches beside this decide whether the tool exists for internal
 * or external reps at all. This decides which named people on that side of the
 * app actually get it. Both gates must pass, and the API routes re-check.
 *
 * Saves on every change, optimistically, and rolls back on failure — the same
 * behaviour as the notification assignments screen.
 * ==========================================================================*/

type UserRow = { id: string; full_name: string | null; email: string | null; role: string | null };

function userLabel(u: UserRow): string {
  return (u.full_name && u.full_name.trim()) || u.email || u.id.slice(0, 8);
}

export default function ToolAccessPicker({
  toolKey,
  label,
}: {
  toolKey: string;
  label: string;
}) {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [assigned, setAssigned] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/admin/tool-access", {
          cache: "no-store",
          credentials: "include",
        });
        const json = await res.json().catch(() => null);
        if (!alive) return;
        if (!res.ok) {
          setError(json?.error || "Failed to load.");
          return;
        }
        setUsers(json.users || []);
        setAssigned(json.assignments?.[toolKey] || []);
      } catch {
        if (alive) setError("Failed to load.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [toolKey]);

  const assignedSet = useMemo(() => new Set(assigned), [assigned]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return users;
    return users.filter(
      (u) =>
        (u.full_name || "").toLowerCase().includes(q) ||
        (u.email || "").toLowerCase().includes(q)
    );
  }, [users, query]);

  async function save(next: string[]) {
    const prev = assigned;
    setAssigned(next); // optimistic
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/tool-access", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ tool_key: toolKey, user_ids: next }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json?.error || "Failed to save.");
      }
    } catch (e) {
      setAssigned(prev);
      setError(e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  function toggleUser(id: string) {
    void save(assignedSet.has(id) ? assigned.filter((x) => x !== id) : [...assigned, id]);
  }

  const assignedUsers = users.filter((u) => assignedSet.has(u.id));

  return (
    <div className="mt-3 border-t border-black/10 pt-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--anchor-gray)]">
          Who can use it
          {saving && <span className="ml-2 font-normal normal-case">Saving…</span>}
        </div>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="text-sm font-semibold text-[var(--anchor-green)] hover:text-[var(--anchor-deep)]"
        >
          {open ? "Done" : "Assign people"}
        </button>
      </div>

      {loading ? (
        <div className="mt-2 text-sm text-[var(--anchor-gray)]">Loading…</div>
      ) : (
        <>
          {/* Nobody assigned is a real state worth calling out: the tool is
              switched on but invisible to every person in the company. */}
          {assignedUsers.length === 0 ? (
            <div className="mt-2 text-sm text-[#8a6d3b]">
              Nobody yet — {label} is hidden from everyone until you assign someone.
            </div>
          ) : (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {assignedUsers.map((u) => (
                <span
                  key={u.id}
                  className="inline-flex items-center gap-1.5 rounded-full bg-[var(--anchor-mint)] px-2.5 py-1 text-xs font-semibold text-[var(--anchor-deep)]"
                >
                  {userLabel(u)}
                  <button
                    type="button"
                    onClick={() => toggleUser(u.id)}
                    aria-label={`Remove ${userLabel(u)}`}
                    className="text-[var(--anchor-deep)]/60 transition hover:text-[var(--anchor-deep)]"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          {open && (
            <div className="mt-3 rounded-xl border border-black/10 p-2">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search people…"
                className="h-9 w-full rounded-lg border border-[var(--border-default)] bg-white px-3 text-sm outline-none focus:border-[var(--anchor-green)]"
              />
              <ul className="mt-2 max-h-56 overflow-y-auto">
                {visible.length === 0 ? (
                  <li className="px-2 py-2 text-sm text-[var(--anchor-gray)]">No matches.</li>
                ) : (
                  visible.map((u) => (
                    <li key={u.id}>
                      <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-[var(--surface-strong)]">
                        <input
                          type="checkbox"
                          checked={assignedSet.has(u.id)}
                          onChange={() => toggleUser(u.id)}
                          className="h-4 w-4"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-semibold text-[var(--anchor-deep)]">
                            {userLabel(u)}
                          </span>
                          {u.email && (
                            <span className="block truncate text-xs text-[var(--anchor-gray)]">{u.email}</span>
                          )}
                        </span>
                      </label>
                    </li>
                  ))
                )}
              </ul>
            </div>
          )}
        </>
      )}

      {error && <div className="mt-2 text-xs text-red-600">{error}</div>}
    </div>
  );
}
