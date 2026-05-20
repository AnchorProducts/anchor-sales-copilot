"use client";

import { useMemo, useState } from "react";

export type BarChartUser = {
  manufacturer: string | null;
  events: { total30: number };
};

type TopN = 5 | 7 | 10;

export function TopOemsBarChart({ users }: { users: BarChartUser[] }) {
  const [topN, setTopN] = useState<TopN>(5);

  const rows = useMemo(() => {
    const groups = new Map<string, number>();
    for (const u of users) {
      if (!u.manufacturer) continue;
      groups.set(u.manufacturer, (groups.get(u.manufacturer) ?? 0) + u.events.total30);
    }
    return Array.from(groups.entries())
      .filter(([, count]) => count > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, topN)
      .map(([oem, count]) => ({ oem, count }));
  }, [users, topN]);

  const max = Math.max(1, ...rows.map((r) => r.count));
  // Round the chart max up to a nice axis tick so the bars don't fill the
  // whole width and the axis labels read clean (e.g., 100/200/300/400).
  const niceMax = niceCeil(max);
  const tickCount = 5;
  const ticks = Array.from({ length: tickCount }, (_, i) =>
    Math.round((niceMax / (tickCount - 1)) * i)
  );

  if (rows.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-[var(--anchor-gray)]">
        No OEM activity yet.
      </div>
    );
  }

  return (
    <div>
      {/* Top-N picker */}
      <div className="mb-4 flex justify-end">
        <div className="inline-flex rounded-full border border-[var(--border-default)] bg-white p-0.5">
          {([5, 7, 10] as const).map((n) => {
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
      </div>

      {/* Bars */}
      <ul className="space-y-4">
        {rows.map((r) => {
          const widthPct = (r.count / niceMax) * 100;
          return (
            <li key={r.oem}>
              <div className="mb-1.5 flex items-baseline gap-2">
                <span className="truncate text-sm font-bold text-[var(--anchor-deep)]" title={r.oem}>
                  {r.oem}
                </span>
                <span className="rounded-full bg-[var(--anchor-mint)]/60 px-2 py-0.5 text-[11px] font-bold text-[var(--anchor-deep)]">
                  {r.count.toLocaleString()}
                </span>
              </div>
              <div className="h-3.5 w-full overflow-hidden rounded-full bg-[var(--surface-strong)]">
                <div
                  className="h-full rounded-full transition-all"
                  style={{
                    width: `${widthPct}%`,
                    background: "linear-gradient(90deg, var(--anchor-green) 0%, #a8e96d 100%)",
                  }}
                  aria-label={`${r.oem}: ${r.count} events`}
                />
              </div>
            </li>
          );
        })}
      </ul>

      {/* X-axis ticks */}
      <div className="mt-3 flex justify-between text-[10px] tabular-nums text-[var(--anchor-gray)]">
        {ticks.map((t) => (
          <span key={t}>{t.toLocaleString()}</span>
        ))}
      </div>
    </div>
  );
}

// Round up to a clean number for axis ticks.
function niceCeil(n: number): number {
  if (n <= 5) return 5;
  if (n <= 10) return 10;
  const pow = Math.pow(10, Math.floor(Math.log10(n)));
  const f = n / pow;
  let nf: number;
  if (f <= 1) nf = 1;
  else if (f <= 2) nf = 2;
  else if (f <= 5) nf = 5;
  else nf = 10;
  return nf * pow;
}
