"use client";

import { useCallback, useEffect, useState } from "react";
import { marketingOrderStatusLabel } from "@/lib/marketingOrders";

type ActivityEntry = {
  id: string;
  from_status: string | null;
  to_status: string | null;
  note: string;
  admin_id: string | null;
  admin_name: string | null;
  admin_email: string | null;
  created_at: string;
};

function formatStamp(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

// Per-order activity log shown on the admin marketing-orders console. It's the
// shared, attributed history of who did what and when — so admins don't redo
// work already underway. Phase-change entries are written by the status PATCH;
// this component also lets an admin log a standalone note ("I've got this").
export default function MarketingOrderActivity({
  orderId,
  onLogged,
}: {
  orderId: string;
  onLogged?: () => void;
}) {
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(
    async (opts?: { quiet?: boolean }) => {
      if (!opts?.quiet) setLoading(true);
      try {
        const res = await fetch(`/api/marketing-orders/${orderId}/activity`, { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          setError(json?.error || "Failed to load activity.");
          return;
        }
        setError(null);
        setEntries(json?.entries || []);
      } catch (e) {
        setError((e as Error)?.message || "Failed to load activity.");
      } finally {
        if (!opts?.quiet) setLoading(false);
      }
    },
    [orderId]
  );

  useEffect(() => {
    load();
  }, [load]);

  async function addNote() {
    const note = draft.trim();
    if (!note) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/marketing-orders/${orderId}/activity`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setSaveError(json?.error || "Failed to add note.");
        return;
      }
      setDraft("");
      await load({ quiet: true });
      onLogged?.();
    } catch (e) {
      setSaveError((e as Error)?.message || "Failed to add note.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-soft)] p-3">
      <div className="max-h-72 space-y-3 overflow-y-auto pr-1">
        {loading ? (
          <div className="text-sm text-[var(--anchor-gray)]">Loading activity…</div>
        ) : error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</div>
        ) : entries.length === 0 ? (
          <div className="text-sm text-[var(--anchor-gray)]">
            No activity logged yet. Changing this order&rsquo;s phase records what was done here.
          </div>
        ) : (
          entries.map((e) => {
            const who = e.admin_name || e.admin_email || "Admin";
            const moved = e.to_status && e.from_status !== e.to_status;
            return (
              <div
                key={e.id}
                className="rounded-lg border border-[var(--border-default)] bg-white p-2.5"
              >
                {moved && (
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--anchor-deep)]">
                    {marketingOrderStatusLabel(e.from_status)} → {marketingOrderStatusLabel(e.to_status)}
                  </div>
                )}
                <div className="whitespace-pre-line text-sm text-black">{e.note}</div>
                <div className="mt-1 text-[11px] text-[var(--anchor-gray)]">
                  {who} · {formatStamp(e.created_at)}
                </div>
              </div>
            );
          })
        )}
      </div>

      <div className="mt-3 border-t border-[var(--border-default)] pt-3">
        <textarea
          value={draft}
          onChange={(ev) => setDraft(ev.target.value)}
          onKeyDown={(ev) => {
            if (ev.key === "Enter" && (ev.metaKey || ev.ctrlKey)) {
              ev.preventDefault();
              void addNote();
            }
          }}
          rows={2}
          placeholder="Log what you're doing — e.g. 'Claiming this, calling the vendor now.'"
          className="w-full resize-y rounded-lg border border-[var(--border-default)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--anchor-green)]"
        />
        {saveError && <div className="mt-2 text-xs text-red-600">{saveError}</div>}
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[11px] text-[var(--anchor-gray)]">⌘/Ctrl + Enter to log</span>
          <button
            type="button"
            onClick={() => void addNote()}
            disabled={saving || !draft.trim()}
            className="inline-flex h-9 items-center rounded-lg bg-[var(--anchor-deep)] px-4 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Logging…" : "Log note"}
          </button>
        </div>
      </div>
    </div>
  );
}
