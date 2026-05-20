"use client";

import { Fragment, useMemo, useState } from "react";

export type ScorecardUser = {
  id: string;
  full_name: string | null;
  email: string;
  manufacturer: string | null;
  conversationCount: number;
  leadCount: number;
  reports: Array<unknown>;
  events: {
    total7: number;
    total30: number;
    lastSeen: string | null;
  };
};

const DORMANT_DAYS = 14;

type SortKey =
  | "manufacturer"
  | "contacts"
  | "signed_up"
  | "active7"
  | "dormant"
  | "events30"
  | "leads"
  | "activation";

type SortDir = "asc" | "desc";

type Row = {
  manufacturer: string;
  contacts: number;
  signedUp: number;
  active7: number;
  dormant: number;
  events30: number;
  leads: number;
  activation: number; // % of signed-up users active in last 7d
  signupRate: number; // % of contacts who signed up
};

function statusFor(r: Row): { label: string; className: string } {
  if (r.signedUp === 0) {
    return { label: "Not signed up", className: "bg-black/5 text-black/55" };
  }
  if (r.activation >= 50 && r.events30 >= 20) {
    return { label: "Thriving", className: "bg-[var(--anchor-mint)]/60 text-[var(--anchor-deep)]" };
  }
  if (r.activation >= 20 || r.events30 >= 5) {
    return { label: "Moderate", className: "bg-amber-100 text-amber-900" };
  }
  return { label: "At risk", className: "bg-red-100 text-red-700" };
}

function daysSince(iso: string | null): number {
  if (!iso) return Infinity;
  return (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24);
}

export function OemScorecard({
  users,
  oemContactCounts,
  onDownloadUserPdf,
  onDownloadAllOems,
  onDownloadOemPdf,
}: {
  users: ScorecardUser[];
  oemContactCounts: Record<string, number>;
  onDownloadUserPdf?: (id: string) => void;
  onDownloadAllOems?: () => void;
  onDownloadOemPdf?: (oem: string) => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("activation");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [search, setSearch] = useState("");
  const [expandedOem, setExpandedOem] = useState<string | null>(null);

  // Map of OEM -> raw user list for the drill-down.
  const usersByOem = useMemo(() => {
    const m = new Map<string, ScorecardUser[]>();
    for (const u of users) {
      if (!u.manufacturer) continue;
      const list = m.get(u.manufacturer) ?? [];
      list.push(u);
      m.set(u.manufacturer, list);
    }
    return m;
  }, [users]);

  function topUsersFor(oem: string, n = 5): ScorecardUser[] {
    const list = usersByOem.get(oem) ?? [];
    return [...list]
      .sort((a, b) => b.events.total30 - a.events.total30)
      .slice(0, n);
  }

  const rows = useMemo<Row[]>(() => {
    const grouped = new Map<string, ScorecardUser[]>();
    for (const u of users) {
      if (!u.manufacturer) continue;
      const list = grouped.get(u.manufacturer) ?? [];
      list.push(u);
      grouped.set(u.manufacturer, list);
    }

    // Include OEMs with contacts but no signups too.
    const allOems = new Set<string>([
      ...grouped.keys(),
      ...Object.keys(oemContactCounts || {}),
    ]);

    return Array.from(allOems).map((mfr) => {
      const list = grouped.get(mfr) ?? [];
      const signedUp = list.length;
      const active7 = list.filter((u) => u.events.total7 > 0).length;
      const dormant = list.filter(
        (u) => daysSince(u.events.lastSeen) > DORMANT_DAYS
      ).length;
      const events30 = list.reduce((s, u) => s + u.events.total30, 0);
      const leads = list.reduce((s, u) => s + u.leadCount, 0);
      const contacts = oemContactCounts[mfr] ?? signedUp;
      const activation = signedUp > 0 ? Math.round((active7 / signedUp) * 100) : 0;
      const signupRate = contacts > 0 ? Math.round((signedUp / contacts) * 100) : 0;
      return { manufacturer: mfr, contacts, signedUp, active7, dormant, events30, leads, activation, signupRate };
    });
  }, [users, oemContactCounts]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q
      ? rows.filter((r) => r.manufacturer.toLowerCase().includes(q))
      : rows;
  }, [rows, search]);

  const sorted = useMemo(() => {
    const out = [...filtered];
    const compare = (a: Row, b: Row): number => {
      const av = a[sortKey === "manufacturer" ? "manufacturer" : sortKey === "signed_up" ? "signedUp" : sortKey];
      const bv = b[sortKey === "manufacturer" ? "manufacturer" : sortKey === "signed_up" ? "signedUp" : sortKey];
      if (typeof av === "string" && typeof bv === "string") {
        return av.localeCompare(bv);
      }
      return (av as number) - (bv as number);
    };
    out.sort((a, b) => (sortDir === "asc" ? compare(a, b) : compare(b, a)));
    return out;
  }, [filtered, sortKey, sortDir]);

  function setSort(k: SortKey) {
    if (sortKey === k) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(k);
      setSortDir(k === "manufacturer" ? "asc" : "desc");
    }
  }

  function SortHeader({ k, label, align = "left" }: { k: SortKey; label: string; align?: "left" | "right" }) {
    const active = sortKey === k;
    return (
      <button
        type="button"
        onClick={() => setSort(k)}
        className={
          "flex w-full items-center gap-1 text-[11px] font-semibold uppercase tracking-wide " +
          (active ? "text-[var(--anchor-deep)]" : "text-[var(--anchor-gray)] hover:text-[var(--anchor-deep)]") +
          (align === "right" ? " justify-end" : "")
        }
      >
        <span>{label}</span>
        <span aria-hidden className="text-[10px]">
          {active ? (sortDir === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </button>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-sm text-[var(--anchor-gray)]">
        No OEM data available.
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter OEMs…"
          className="ds-input w-full sm:w-64"
          aria-label="Filter OEMs"
        />
        <div className="flex flex-wrap items-center gap-3">
          <div className="text-[11px] text-[var(--anchor-gray)]">
            Sorted by {sortKey} ({sortDir === "asc" ? "↑" : "↓"}) · {sorted.length} OEM{sorted.length === 1 ? "" : "s"}
          </div>
          {onDownloadAllOems && (
            <button
              type="button"
              data-track-id="scorecard-download-all"
              onClick={onDownloadAllOems}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--anchor-green)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--anchor-green)] transition-colors hover:bg-[var(--anchor-green)] hover:text-white"
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Download all OEMs
            </button>
          )}
        </div>
      </div>

      <div className="-mx-4 overflow-x-auto sm:mx-0 sm:rounded-xl sm:border sm:border-[var(--border-default)]">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-[var(--surface-soft)]">
            <tr>
              <th className="px-3 py-2 text-left"><SortHeader k="manufacturer" label="OEM" /></th>
              <th className="px-3 py-2 text-right"><SortHeader k="contacts" label="Contacts" align="right" /></th>
              <th className="px-3 py-2 text-right"><SortHeader k="signed_up" label="Signed up" align="right" /></th>
              <th className="px-3 py-2 text-right"><SortHeader k="active7" label="Active 7d" align="right" /></th>
              <th className="px-3 py-2 text-right"><SortHeader k="dormant" label={`Dormant ${DORMANT_DAYS}d`} align="right" /></th>
              <th className="px-3 py-2 text-right"><SortHeader k="events30" label="Events 30d" align="right" /></th>
              <th className="px-3 py-2 text-right"><SortHeader k="leads" label="Leads" align="right" /></th>
              <th className="px-3 py-2 text-right"><SortHeader k="activation" label="Activation %" align="right" /></th>
              <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-[var(--anchor-gray)]">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--border-default)]">
            {sorted.map((r) => {
              const status = statusFor(r);
              const isOpen = expandedOem === r.manufacturer;
              const toggle = () =>
                setExpandedOem((cur) => (cur === r.manufacturer ? null : r.manufacturer));
              return (
                <Fragment key={r.manufacturer}>
                  <tr
                    onClick={toggle}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); }
                    }}
                    role="button"
                    tabIndex={0}
                    aria-expanded={isOpen}
                    data-track-id="scorecard-row-toggle"
                    className={
                      "cursor-pointer transition-colors " +
                      (isOpen ? "bg-[var(--surface-soft)]" : "hover:bg-[var(--surface-soft)]")
                    }
                  >
                    <td className="whitespace-nowrap px-3 py-2 font-semibold text-[var(--anchor-deep)]" title={r.manufacturer}>
                      <span className="flex items-center gap-2">
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden
                          className={`h-3.5 w-3.5 shrink-0 text-[var(--anchor-gray)] transition-transform ${isOpen ? "rotate-90" : ""}`}
                        >
                          <polyline points="9 6 15 12 9 18" />
                        </svg>
                        {r.manufacturer}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.contacts}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {r.signedUp}
                      {r.contacts > 0 && (
                        <span className="ml-1 text-[10px] text-[var(--anchor-gray)]">({r.signupRate}%)</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.active7}</td>
                    <td className={`px-3 py-2 text-right tabular-nums ${r.dormant > 0 ? "text-amber-700" : ""}`}>
                      {r.dormant}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.events30.toLocaleString()}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.leads}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">{r.activation}%</td>
                    <td className="px-3 py-2 text-right">
                      <span className={`inline-block whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold ${status.className}`}>
                        {status.label}
                      </span>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr className="bg-[var(--surface-soft)]">
                      <td colSpan={9} className="px-3 pb-4 pt-1">
                        <TopUsersBlock
                          oem={r.manufacturer}
                          users={topUsersFor(r.manufacturer)}
                          totalSignedUp={r.signedUp}
                          onDownloadUserPdf={onDownloadUserPdf}
                          onDownloadOemPdf={onDownloadOemPdf}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-2 text-[11px] text-[var(--anchor-gray)]">
        <span className="font-semibold">Status:</span> Thriving = ≥50% activation AND ≥20 events (30d) · Moderate = ≥20% activation OR ≥5 events · At risk = below both.
      </div>
    </div>
  );
}

function TopUsersBlock({
  oem,
  users,
  totalSignedUp,
  onDownloadUserPdf,
  onDownloadOemPdf,
}: {
  oem: string;
  users: ScorecardUser[];
  totalSignedUp: number;
  onDownloadUserPdf?: (id: string) => void;
  onDownloadOemPdf?: (oem: string) => void;
}) {
  return (
    <div className="rounded-xl border border-[var(--border-default)] bg-white p-3 sm:p-4">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-[var(--anchor-gray)]">
          Top users · last 30 days
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-[10px] text-[var(--anchor-gray)]">
            Showing top {users.length} of {totalSignedUp} signed up
          </div>
          {onDownloadOemPdf && (
            <button
              type="button"
              data-track-id="scorecard-row-pdf"
              onClick={(e) => {
                e.stopPropagation();
                onDownloadOemPdf(oem);
              }}
              className="inline-flex items-center gap-1 rounded-md border border-[var(--anchor-green)] bg-white px-2 py-1 text-[10px] font-semibold text-[var(--anchor-green)] hover:bg-[var(--anchor-green)] hover:text-white"
            >
              <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              Download {oem} PDF
            </button>
          )}
        </div>
      </div>
      {users.length === 0 ? (
        <p className="text-xs text-[var(--anchor-gray)]">
          Nobody from this OEM has signed up yet.
        </p>
      ) : (
        <ol className="space-y-1.5">
          {users.map((u, i) => (
            <li
              key={u.id}
              className="flex items-center gap-1.5 rounded-lg bg-[var(--surface-soft)] px-2 py-1.5 text-xs sm:gap-2 sm:px-2.5 sm:py-2"
            >
              <span className="w-4 shrink-0 text-center text-[10px] font-bold tabular-nums text-[var(--anchor-gray)]">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold text-[var(--anchor-deep)]" title={u.full_name || u.email}>
                  {u.full_name || u.email}
                </div>
                <div className="truncate text-[10px] text-[var(--anchor-gray)]" title={u.email}>
                  {u.email}
                </div>
              </div>
              <div className="shrink-0 whitespace-nowrap text-right">
                <div className="font-bold tabular-nums text-[var(--anchor-deep)]">
                  {u.events.total30.toLocaleString()}
                </div>
                <div className="text-[9px] uppercase tracking-wide text-[var(--anchor-gray)]">events</div>
              </div>
              {onDownloadUserPdf && (
                <button
                  type="button"
                  data-track-id="scorecard-user-pdf"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDownloadUserPdf(u.id);
                  }}
                  aria-label={`Download PDF for ${u.full_name || u.email}`}
                  className="shrink-0 rounded-md border border-[var(--anchor-green)] bg-white px-1.5 py-1 text-[10px] font-semibold text-[var(--anchor-green)] hover:bg-[var(--anchor-green)] hover:text-white sm:px-2"
                >
                  PDF
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
