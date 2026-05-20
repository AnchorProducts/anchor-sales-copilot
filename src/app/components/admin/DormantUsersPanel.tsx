"use client";

import { useMemo, useState } from "react";

export type DormantUser = {
  id: string;
  full_name: string | null;
  email: string;
  manufacturer: string | null;
  role: string | null;
  created_at: string | null;
  lastSeen: string | null;
};

const DORMANT_DAYS = 14;

function daysSinceMs(iso: string | null): number {
  if (!iso) return Infinity;
  return (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24);
}

function fmtAbsoluteShort(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

function fmtRecency(days: number): { label: string; tone: "warn" | "bad" | "muted" } {
  if (!isFinite(days)) return { label: "Never used", tone: "bad" };
  if (days < 30) return { label: `${Math.round(days)}d ago`, tone: "warn" };
  if (days < 60) return { label: `${Math.round(days)}d ago`, tone: "bad" };
  if (days < 365) return { label: `${Math.round(days / 30)}mo ago`, tone: "bad" };
  return { label: `${Math.round(days / 365)}y ago`, tone: "bad" };
}

export function DormantUsersPanel({
  users,
  onDownloadPdf,
}: {
  users: DormantUser[];
  onDownloadPdf?: (id: string) => void;
}) {
  const [oemFilter, setOemFilter] = useState<string>("all");
  const [includeNeverUsed, setIncludeNeverUsed] = useState(true);

  // All dormant: lastSeen null (never used) OR older than threshold.
  const dormant = useMemo(() => {
    return users
      .map((u) => ({ ...u, daysSince: daysSinceMs(u.lastSeen) }))
      .filter((u) => {
        if (u.daysSince === Infinity) return includeNeverUsed;
        return u.daysSince > DORMANT_DAYS;
      })
      .sort((a, b) => b.daysSince - a.daysSince);
  }, [users, includeNeverUsed]);

  const oems = useMemo(() => {
    const set = new Set<string>();
    for (const u of dormant) if (u.manufacturer) set.add(u.manufacturer);
    return Array.from(set).sort();
  }, [dormant]);

  const filtered = useMemo(() => {
    if (oemFilter === "all") return dormant;
    if (oemFilter === "none") return dormant.filter((u) => !u.manufacturer);
    return dormant.filter((u) => u.manufacturer === oemFilter);
  }, [dormant, oemFilter]);

  const neverUsedCount = dormant.filter((u) => !isFinite(u.daysSince)).length;

  if (users.length === 0) {
    return (
      <div className="px-6 py-8 text-center text-sm text-[var(--anchor-gray)]">
        No users loaded yet.
      </div>
    );
  }

  return (
    <div>
      {/* Controls + summary */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-2xl font-bold tabular-nums text-[var(--anchor-deep)]">
            {filtered.length}
          </span>
          <span className="text-xs text-[var(--anchor-gray)] sm:text-sm">
            users haven&rsquo;t used the app in {DORMANT_DAYS}+ days
          </span>
          {neverUsedCount > 0 && (
            <span className="whitespace-nowrap rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">
              {neverUsedCount} never used
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 sm:flex-nowrap">
          <select
            value={oemFilter}
            onChange={(e) => setOemFilter(e.target.value)}
            className="w-full rounded-full border border-[var(--border-default)] bg-white px-3 py-1.5 text-xs font-semibold sm:w-auto"
            aria-label="Filter by OEM"
          >
            <option value="all">All OEMs ({dormant.length})</option>
            <option value="none">No OEM tag</option>
            {oems.map((o) => {
              const c = dormant.filter((u) => u.manufacturer === o).length;
              return (
                <option key={o} value={o}>{o} ({c})</option>
              );
            })}
          </select>
          <label className="flex shrink-0 items-center gap-1.5 text-xs text-[var(--anchor-gray)]">
            <input
              type="checkbox"
              checked={includeNeverUsed}
              onChange={(e) => setIncludeNeverUsed(e.target.checked)}
              className="h-3.5 w-3.5"
            />
            Include never-used
          </label>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[var(--border-default)] p-8 text-center text-sm text-[var(--anchor-gray)]">
          Nobody dormant in this slice. Everyone&rsquo;s been active.
        </div>
      ) : (
        <ul className="divide-y divide-[var(--border-default)] rounded-xl border border-[var(--border-default)]">
          {filtered.map((u) => {
            const rec = fmtRecency(u.daysSince);
            return (
              <li key={u.id} className="flex flex-col items-start gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="truncate text-sm font-semibold text-[var(--anchor-deep)]" title={u.full_name || u.email}>
                      {u.full_name || u.email}
                    </span>
                    {u.manufacturer && (
                      <span className="rounded-full bg-[var(--surface-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--anchor-deep)]">
                        {u.manufacturer}
                      </span>
                    )}
                  </div>
                  <div className="truncate text-xs text-[var(--anchor-gray)]" title={u.email}>
                    {u.email} {u.created_at && `· signed up ${fmtAbsoluteShort(u.created_at)}`}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span
                    className={
                      "whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold " +
                      (rec.tone === "warn"
                        ? "bg-amber-100 text-amber-900"
                        : rec.tone === "bad"
                        ? "bg-red-100 text-red-700"
                        : "bg-black/5 text-black/55")
                    }
                  >
                    Last seen {rec.label}
                  </span>
                  {onDownloadPdf && (
                    <button
                      type="button"
                      data-track-id="dormant-user-pdf"
                      onClick={() => onDownloadPdf(u.id)}
                      className="shrink-0 rounded-lg border border-[var(--anchor-green)] bg-white px-3 py-1 text-xs font-semibold text-[var(--anchor-green)] hover:bg-[var(--anchor-green)] hover:text-white"
                    >
                      PDF
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
