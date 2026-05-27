"use client";

import {
  buildUserAnalyticsSummary,
  eventLabel,
  shortEventLabel,
  type ChartUser,
  type LabeledValue,
  type UserAnalyticsSummary,
} from "@/lib/analytics/userAnalyticsSummary";

export { buildUserAnalyticsSummary, eventLabel, shortEventLabel };
export type { ChartUser, LabeledValue, UserAnalyticsSummary };

// Round up to a clean axis number.
function niceCeil(n: number): number {
  if (n <= 5) return 5;
  if (n <= 10) return 10;
  const pow = Math.pow(10, Math.floor(Math.log10(n)));
  const f = n / pow;
  const nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return nf * pow;
}

export function UserAnalyticsCharts({ summary }: { summary: UserAnalyticsSummary }) {
  const { stats, series, byType, topUsers } = summary;

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile label="Users" value={stats.users} />
        <StatTile label="Active users" value={stats.active} />
        <StatTile label="Total events" value={stats.events} />
        <StatTile label="Inactive users" value={stats.inactive} accentBad={stats.inactive > 0} />
      </div>

      <div className="rounded-3xl border border-[var(--border-default)] bg-white p-4 shadow-sm sm:p-6">
        <div className="mb-3 sm:mb-4">
          <h3 className="text-base font-bold text-[var(--anchor-deep)] sm:text-lg">Daily activity</h3>
          <p className="text-xs text-[var(--anchor-gray)]">Events per day across these users.</p>
        </div>
        <DailyAreaChart data={series} />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:gap-5">
        <div className="rounded-3xl border border-[var(--border-default)] bg-white p-4 shadow-sm sm:p-6">
          <div className="mb-3 sm:mb-4">
            <h3 className="text-base font-bold text-[var(--anchor-deep)] sm:text-lg">Activity by type</h3>
            <p className="text-xs text-[var(--anchor-gray)]">What these users do most.</p>
          </div>
          <Bars rows={byType} emptyLabel="No activity yet." />
        </div>
        <div className="rounded-3xl border border-[var(--border-default)] bg-white p-4 shadow-sm sm:p-6">
          <div className="mb-3 sm:mb-4">
            <h3 className="text-base font-bold text-[var(--anchor-deep)] sm:text-lg">Most active users</h3>
            <p className="text-xs text-[var(--anchor-gray)]">Top users by events.</p>
          </div>
          <Bars rows={topUsers} emptyLabel="No active users yet." />
        </div>
      </div>
    </div>
  );
}

function StatTile({ label, value, accentBad }: { label: string; value: number; accentBad?: boolean }) {
  return (
    <div className="rounded-3xl border border-[var(--border-default)] bg-white p-4 shadow-sm sm:p-5">
      <div className="text-[11px] font-semibold uppercase tracking-widest text-[var(--anchor-gray)]">{label}</div>
      <div className="mt-1.5 text-3xl font-bold tabular-nums text-[var(--anchor-deep)] sm:text-4xl">
        {value.toLocaleString()}
      </div>
      {accentBad && (
        <div className="mt-2 inline-block rounded-full bg-red-100 px-2.5 py-1 text-[11px] font-bold text-red-700">
          Needs attention
        </div>
      )}
    </div>
  );
}

function Bars({ rows, emptyLabel }: { rows: LabeledValue[]; emptyLabel: string }) {
  const niceMax = niceCeil(Math.max(1, ...rows.map((r) => r.count)));
  if (rows.length === 0) {
    return <div className="flex h-32 items-center justify-center text-sm text-[var(--anchor-gray)]">{emptyLabel}</div>;
  }
  return (
    <ul className="space-y-3.5">
      {rows.map((r, i) => (
        <li key={`${r.label}-${i}`}>
          <div className="mb-1.5 flex items-baseline gap-2">
            <span className="truncate text-sm font-bold text-[var(--anchor-deep)]" title={r.label}>{r.label}</span>
            <span className="rounded-full bg-[var(--anchor-mint)]/60 px-2 py-0.5 text-[11px] font-bold text-[var(--anchor-deep)]">
              {r.count.toLocaleString()}
            </span>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-[var(--surface-strong)]">
            <div
              className="h-full rounded-full"
              style={{ width: `${(r.count / niceMax) * 100}%`, background: "linear-gradient(90deg, var(--anchor-green) 0%, #a8e96d 100%)" }}
              aria-label={`${r.label}: ${r.count}`}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function DailyAreaChart({ data }: { data: LabeledValue[] }) {
  const W = 720;
  const H = 180;
  const max = niceCeil(Math.max(1, ...data.map((d) => d.count)));
  const n = data.length;
  const x = (i: number) => (n <= 1 ? 0 : (i / (n - 1)) * W);
  const y = (c: number) => H - (c / max) * (H - 8) - 4;

  const linePts = data.map((d, i) => `${x(i).toFixed(1)},${y(d.count).toFixed(1)}`).join(" ");
  const areaPts = `0,${H} ${linePts} ${W},${H}`;

  const total = data.reduce((s, d) => s + d.count, 0);
  if (total === 0) {
    return <div className="flex h-40 items-center justify-center text-sm text-[var(--anchor-gray)]">No activity in this window.</div>;
  }

  const labelEvery = Math.max(1, Math.floor(n / 6));

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-44 w-full" role="img" aria-label="Daily events">
        <defs>
          <linearGradient id="ua-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--anchor-green)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--anchor-green)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={areaPts} fill="url(#ua-area)" />
        <polyline points={linePts} fill="none" stroke="var(--anchor-green)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="mt-2 flex justify-between text-[10px] tabular-nums text-[var(--anchor-gray)]">
        {data.map((d, i) => (i % labelEvery === 0 || i === n - 1 ? <span key={`${d.label}-${i}`}>{d.label}</span> : null))}
      </div>
    </div>
  );
}
