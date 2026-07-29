"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/app/components/ui/Card";
import Button from "@/app/components/ui/Button";

/* ============================================================================
 * Assign + delete, shared by consults (/api/leads/[id]) and Project Intakes
 * (/api/fm-intake/[id]). Both endpoints take the same PATCH shape
 * ({ assigned_rep_user_id }) and derive status from it, so one panel drives
 * both queues and they can't drift apart.
 *
 * There are only two states — unassigned ("New") and assigned to a person — so
 * this panel IS the status control. There is no separate status dropdown.
 * ==========================================================================*/

type Assignee = { id: string; name: string; email: string; role: string };

type Props = {
  /** Resource endpoint, e.g. `/api/leads/<id>`. PATCHed and DELETEd directly. */
  endpoint: string;
  assigneeId: string | null;
  /** What this record is called in confirmation copy: "consult", "project intake". */
  noun: string;
  /** Delete is admin-only; the caller decides, the API enforces it again. */
  canDelete: boolean;
  onSaved: (next: { assigned_rep_user_id: string | null; status: string }) => void;
  onDeleted: () => void;
};

export default function AssignmentPanel({
  endpoint,
  assigneeId,
  noun,
  canDelete,
  onSaved,
  onDeleted,
}: Props) {
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [choice, setChoice] = useState<string>(assigneeId ?? "");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Re-sync when the parent reloads the record under us.
  useEffect(() => setChoice(assigneeId ?? ""), [assigneeId]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const res = await fetch("/api/internal/assignees", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!alive) return;
      if (res.ok) setAssignees((json?.assignees ?? []) as Assignee[]);
      else setErr(json?.error || "Couldn't load the list of people.");
    })();
    return () => {
      alive = false;
    };
  }, []);

  const dirty = (assigneeId ?? "") !== choice;

  const save = useCallback(async () => {
    setSaving(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assigned_rep_user_id: choice || null }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setErr(json?.error || "That didn't save.");
        return;
      }
      const status = choice ? "assigned" : "new";
      setMsg(choice ? "Assigned." : "Unassigned — back in the New queue.");
      onSaved({ assigned_rep_user_id: choice || null, status });
    } finally {
      setSaving(false);
    }
  }, [choice, endpoint, onSaved]);

  const destroy = useCallback(async () => {
    setDeleting(true);
    setErr(null);
    try {
      const res = await fetch(endpoint, { method: "DELETE" });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setErr(json?.error || "That didn't delete.");
        setDeleting(false);
        setConfirming(false);
        return;
      }
      onDeleted();
    } catch {
      setErr("That didn't delete.");
      setDeleting(false);
      setConfirming(false);
    }
  }, [endpoint, onDeleted]);

  return (
    <Card className="p-5 sm:p-6">
      <div className="ds-caption mb-4">Assignment</div>

      <label className="block text-sm">
        <span className="font-semibold text-[var(--anchor-deep)]">Assigned to</span>
        <select
          value={choice}
          onChange={(e) => {
            setChoice(e.target.value);
            setMsg(null);
          }}
          className="mt-1.5 w-full rounded-xl border border-[var(--border-default)] bg-white px-3 py-2 text-sm"
        >
          <option value="">Unassigned (New)</option>
          {assignees.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
              {a.role === "admin" ? " · Admin" : ""}
            </option>
          ))}
        </select>
      </label>

      <p className="mt-2 text-xs text-[var(--anchor-gray)]">
        Picking someone marks this <strong>Assigned</strong>. Clearing it puts it back in{" "}
        <strong>New</strong>.
      </p>

      <div className="mt-4">
        <Button onClick={save} disabled={saving || !dirty} className="w-full">
          {saving ? "Saving…" : dirty ? "Save assignment" : "Saved"}
        </Button>
      </div>

      {msg && <div className="mt-3 text-xs text-[var(--anchor-green)]">{msg}</div>}
      {err && (
        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {err}
        </div>
      )}

      {canDelete && (
        <div className="mt-6 border-t border-[var(--border-default)] pt-5">
          <div className="ds-caption mb-2">Danger zone</div>
          {!confirming ? (
            <>
              <p className="mb-3 text-xs text-[var(--anchor-gray)]">
                Deleting removes this {noun} and every file uploaded with it. There is no undo.
              </p>
              <button
                type="button"
                onClick={() => setConfirming(true)}
                className="w-full rounded-xl border border-red-300 bg-white px-3 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50"
              >
                Delete this {noun}
              </button>
            </>
          ) : (
            <>
              <p className="mb-3 text-sm font-semibold text-red-700">
                Permanently delete this {noun} and its files?
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={destroy}
                  disabled={deleting}
                  className="rounded-xl bg-red-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-red-700 disabled:opacity-60"
                >
                  {deleting ? "Deleting…" : "Yes, delete"}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  disabled={deleting}
                  className="rounded-xl border border-[var(--border-default)] bg-white px-3 py-2 text-sm font-semibold text-[var(--anchor-deep)]"
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </Card>
  );
}
