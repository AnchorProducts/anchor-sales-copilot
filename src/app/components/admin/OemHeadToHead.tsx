"use client";

import { useEffect, useMemo, useState } from "react";

export type CompareUser = {
  id: string;
  full_name: string | null;
  email: string;
  manufacturer: string | null;
  leadCount: number;
  events: {
    total7: number;
    total30: number;
    lastSeen: string | null;
  };
};

type TopUser = CompareUser;

type OemMetrics = {
  manufacturer: string;
  contacts: number;
  signedUp: number;
  active7: number;
  active30: number;
  events30: number;
  leads: number;
  activation: number; // % of signed-up users active 7d
};

function buildMetrics(
  oem: string,
  users: CompareUser[],
  contactCount: number
): OemMetrics {
  const signedUp = users.length;
  const active7 = users.filter((u) => u.events.total7 > 0).length;
  const active30 = users.filter((u) => u.events.total30 > 0).length;
  const events30 = users.reduce((s, u) => s + u.events.total30, 0);
  const leads = users.reduce((s, u) => s + u.leadCount, 0);
  const activation = signedUp > 0 ? Math.round((active7 / signedUp) * 100) : 0;
  return {
    manufacturer: oem,
    contacts: contactCount || signedUp,
    signedUp,
    active7,
    active30,
    events30,
    leads,
    activation,
  };
}

function summarize(a: OemMetrics, b: OemMetrics): string {
  if (a.manufacturer === b.manufacturer) return "Pick a different OEM to compare.";
  const ratio = (n: number, d: number) => (d === 0 ? (n === 0 ? 1 : Infinity) : n / d);

  // Activity ratio (events 30d).
  const aOverB = ratio(a.events30, b.events30);
  const bOverA = ratio(b.events30, a.events30);

  if (a.events30 === 0 && b.events30 === 0) {
    return `Neither ${a.manufacturer} nor ${b.manufacturer} have any activity in the last 30 days.`;
  }
  if (a.events30 === 0) {
    return `${a.manufacturer} has no activity in the last 30 days; ${b.manufacturer} logged ${b.events30.toLocaleString()} events.`;
  }
  if (b.events30 === 0) {
    return `${b.manufacturer} has no activity in the last 30 days; ${a.manufacturer} logged ${a.events30.toLocaleString()} events.`;
  }

  const [winner, loser, mult] =
    aOverB >= bOverA ? [a, b, aOverB] : [b, a, bOverA];
  const rounded = mult >= 10 ? Math.round(mult) : Math.round(mult * 10) / 10;
  if (rounded < 1.15) {
    return `${a.manufacturer} and ${b.manufacturer} have roughly equal activity over the last 30 days.`;
  }
  return `${winner.manufacturer} has ${rounded}× more activity than ${loser.manufacturer} over the last 30 days.`;
}

export function OemHeadToHead({
  users,
  oemContactCounts,
  onDownloadUserPdf,
  onDownloadOemPdf,
}: {
  users: CompareUser[];
  oemContactCounts: Record<string, number>;
  onDownloadUserPdf?: (id: string) => void;
  onDownloadOemPdf?: (oem: string) => void;
}) {
  // Build a list of all OEMs that have either contacts or signed-up users.
  const oemsList = useMemo(() => {
    const set = new Set<string>(Object.keys(oemContactCounts));
    for (const u of users) if (u.manufacturer) set.add(u.manufacturer);
    return Array.from(set).sort();
  }, [users, oemContactCounts]);

  // Group users per OEM for fast lookup.
  const usersByOem = useMemo(() => {
    const m = new Map<string, CompareUser[]>();
    for (const u of users) {
      if (!u.manufacturer) continue;
      const list = m.get(u.manufacturer) ?? [];
      list.push(u);
      m.set(u.manufacturer, list);
    }
    return m;
  }, [users]);

  // Default A/B: top 2 OEMs by 30d events.
  const [a, setA] = useState<string>("");
  const [b, setB] = useState<string>("");

  // Top-users drilldown options.
  const [showTopUsers, setShowTopUsers] = useState<boolean>(false);
  const [topN, setTopN] = useState<3 | 5 | 10>(5);

  function topUsersFor(oem: string): TopUser[] {
    const list = usersByOem.get(oem) ?? [];
    return [...list]
      .sort((x, y) => y.events.total30 - x.events.total30)
      .slice(0, topN);
  }

  useEffect(() => {
    if (a && b) return;
    const ranked = oemsList
      .map((o) => {
        const list = usersByOem.get(o) ?? [];
        return { o, events30: list.reduce((s, u) => s + u.events.total30, 0) };
      })
      .sort((x, y) => y.events30 - x.events30);
    if (!a && ranked[0]) setA(ranked[0].o);
    if (!b && ranked[1]) setB(ranked[1].o);
    else if (!b && ranked[0] && ranked[0].o !== a) setB(ranked[0].o);
  }, [oemsList, usersByOem, a, b]);

  if (oemsList.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-[var(--border-default)] p-8 text-center text-sm text-[var(--anchor-gray)]">
        No OEMs available to compare yet.
      </div>
    );
  }

  const metricsA = a ? buildMetrics(a, usersByOem.get(a) ?? [], oemContactCounts[a] ?? 0) : null;
  const metricsB = b ? buildMetrics(b, usersByOem.get(b) ?? [], oemContactCounts[b] ?? 0) : null;

  return (
    <div>
      {/* Pickers */}
      <div className="mb-5 grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
        <OemSelect label="OEM A" value={a} options={oemsList} onChange={setA} />
        <div className="hidden text-center text-xs font-bold uppercase tracking-widest text-[var(--anchor-gray)] sm:block">
          vs
        </div>
        <OemSelect label="OEM B" value={b} options={oemsList} onChange={setB} />
      </div>

      {/* Top-users toggle */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setShowTopUsers((v) => !v)}
          aria-pressed={showTopUsers}
          data-track-id="head-to-head-show-top-users"
          className={
            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition " +
            (showTopUsers
              ? "border-[var(--anchor-deep)] bg-[var(--anchor-deep)] text-white"
              : "border-[var(--border-default)] bg-white text-[var(--anchor-gray)] hover:text-[var(--anchor-deep)]")
          }
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
          </svg>
          {showTopUsers ? "Hide top users" : "Show top users"}
        </button>
        {showTopUsers && (
          <div className="inline-flex rounded-full border border-[var(--border-default)] bg-white p-0.5">
            {([3, 5, 10] as const).map((n) => {
              const active = topN === n;
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => setTopN(n)}
                  className={
                    "rounded-full px-3 py-1 text-xs font-semibold transition " +
                    (active
                      ? "bg-[var(--anchor-deep)] text-white shadow-sm"
                      : "text-[var(--anchor-gray)] hover:text-[var(--anchor-deep)]")
                  }
                >
                  Top {n}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Side-by-side cards */}
      {metricsA && metricsB && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
            <SideCard
              metrics={metricsA}
              other={metricsB}
              accent="left"
              topUsers={showTopUsers ? topUsersFor(a) : null}
              onDownloadUserPdf={onDownloadUserPdf}
              onDownloadOemPdf={onDownloadOemPdf}
            />
            <SideCard
              metrics={metricsB}
              other={metricsA}
              accent="right"
              topUsers={showTopUsers ? topUsersFor(b) : null}
              onDownloadUserPdf={onDownloadUserPdf}
              onDownloadOemPdf={onDownloadOemPdf}
            />
          </div>

          {/* Summary sentence */}
          <div className="mt-4 rounded-xl border border-[var(--border-default)] bg-[var(--surface-soft)] px-4 py-3 text-center text-sm font-semibold text-[var(--anchor-deep)] sm:text-base">
            {summarize(metricsA, metricsB)}
          </div>
        </>
      )}
    </div>
  );
}

function OemSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--anchor-gray)]">
        {label}
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-[var(--border-default)] bg-white px-3 py-2 text-sm font-semibold text-[var(--anchor-deep)] shadow-sm outline-none transition focus:border-[var(--anchor-green)]"
      >
        {options.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}

function SideCard({
  metrics,
  other,
  accent,
  topUsers,
  onDownloadUserPdf,
  onDownloadOemPdf,
}: {
  metrics: OemMetrics;
  other: OemMetrics;
  accent: "left" | "right";
  topUsers: TopUser[] | null;
  onDownloadUserPdf?: (id: string) => void;
  onDownloadOemPdf?: (oem: string) => void;
}) {
  const accentColor = accent === "left" ? "var(--anchor-deep)" : "var(--anchor-green)";

  return (
    <div
      className="rounded-2xl border border-[var(--border-default)] bg-white p-4 shadow-sm sm:p-5"
      style={{ borderTop: `4px solid ${accentColor}` }}
    >
      {/* Header */}
      <div className="mb-3 flex items-start justify-between gap-3 sm:mb-4">
        <div className="min-w-0">
          <h4 className="truncate text-base font-bold tracking-tight text-[var(--anchor-deep)] sm:text-xl" title={metrics.manufacturer}>
            {metrics.manufacturer}
          </h4>
          <p className="mt-0.5 text-[11px] text-[var(--anchor-gray)] sm:text-xs">
            {metrics.contacts} contact{metrics.contacts === 1 ? "" : "s"} on file
          </p>
        </div>
        {onDownloadOemPdf && (
          <button
            type="button"
            data-track-id="head-to-head-oem-pdf"
            onClick={() => onDownloadOemPdf(metrics.manufacturer)}
            aria-label={`Download PDF for ${metrics.manufacturer}`}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-[var(--anchor-green)] bg-white px-2 py-1 text-[10px] font-semibold text-[var(--anchor-green)] hover:bg-[var(--anchor-green)] hover:text-white sm:px-2.5 sm:py-1.5 sm:text-xs"
          >
            <svg viewBox="0 0 24 24" className="h-3 w-3 sm:h-3.5 sm:w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            PDF
          </button>
        )}
      </div>

      {/* Big number: events 30d */}
      <div className="mb-3 sm:mb-4">
        <div className="text-[10px] font-semibold uppercase tracking-widest text-[var(--anchor-gray)]">
          Events in last 30 days
        </div>
        <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="text-3xl font-bold tabular-nums text-[var(--anchor-deep)] sm:text-5xl">
            {metrics.events30.toLocaleString()}
          </span>
          <Delta value={metrics.events30} other={other.events30} />
        </div>
      </div>

      {/* Metric grid */}
      <dl className="grid grid-cols-2 gap-2 sm:gap-3">
        <MetricCell label="Signed up" value={metrics.signedUp} hint={`of ${metrics.contacts}`} />
        <MetricCell label="Active 7d" value={metrics.active7} hint={`of ${metrics.signedUp} signed up`} />
        <MetricCell label="Leads" value={metrics.leads} />
        <MetricCell label="Activation" value={metrics.activation} suffix="%" />
      </dl>

      {/* Top users drilldown */}
      {topUsers && (
        <div className="mt-4 border-t border-[var(--border-default)] pt-3 sm:mt-5 sm:pt-4">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-[var(--anchor-gray)]">
            Top users · last 30 days
          </div>
          {topUsers.length === 0 ? (
            <p className="text-xs text-[var(--anchor-gray)]">No signed-up users at this OEM.</p>
          ) : (
            <ol className="space-y-1.5">
              {topUsers.map((u, i) => (
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
                      data-track-id="head-to-head-user-pdf"
                      onClick={() => onDownloadUserPdf(u.id)}
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
      )}
    </div>
  );
}

function MetricCell({
  label,
  value,
  hint,
  suffix,
}: {
  label: string;
  value: number;
  hint?: string;
  suffix?: string;
}) {
  return (
    <div className="min-w-0 rounded-xl bg-[var(--surface-soft)] px-2.5 py-2 sm:px-4 sm:py-2.5">
      <div className="truncate text-[10px] font-semibold uppercase tracking-wide text-[var(--anchor-gray)]">
        {label}
      </div>
      <div className="mt-0.5">
        <span className="text-lg font-bold tabular-nums text-[var(--anchor-deep)] sm:text-2xl">
          {value.toLocaleString()}{suffix ?? ""}
        </span>
      </div>
      {hint && (
        <div className="truncate text-[10px] text-[var(--anchor-gray)]">{hint}</div>
      )}
    </div>
  );
}

function Delta({ value, other }: { value: number; other: number }) {
  if (other === 0 && value === 0) return null;
  if (other === 0) {
    return (
      <span className="rounded-full bg-[var(--anchor-mint)]/60 px-2 py-0.5 text-[10px] font-semibold text-[var(--anchor-deep)]">
        only OEM with activity
      </span>
    );
  }
  const diff = value - other;
  if (diff === 0) {
    return (
      <span className="rounded-full bg-black/5 px-2 py-0.5 text-[10px] font-semibold text-black/55">
        tied
      </span>
    );
  }
  const pct = Math.round((Math.abs(diff) / other) * 100);
  return (
    <span
      className={
        "rounded-full px-2 py-0.5 text-[10px] font-semibold " +
        (diff > 0
          ? "bg-[var(--anchor-mint)]/60 text-[var(--anchor-deep)]"
          : "bg-red-100 text-red-700")
      }
    >
      {diff > 0 ? "+" : "−"}{pct}% vs other
    </span>
  );
}
