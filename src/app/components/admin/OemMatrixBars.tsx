"use client";

// Per-manufacturer horizontal stacked bars, segmented by the CEO's three
// groups: sales reps, tech reps, consultants. One instance per metric.

export type GroupVals = { sales: number; tech: number; consultant: number };
export type MatrixBarRow = { manufacturer: string; vals: GroupVals };

const SEGMENTS = [
  { key: "sales", label: "Sales reps", color: "#3b82f6" },
  { key: "tech", label: "Tech reps", color: "var(--anchor-green)" },
  { key: "consultant", label: "Consultants", color: "#8b5cf6" },
] as const;

export function OemMatrixBars({
  data,
  valueSuffix = "",
}: {
  data: MatrixBarRow[];
  valueSuffix?: string;
}) {
  const rows = data
    .map((d) => ({ ...d, total: d.vals.sales + d.vals.tech + d.vals.consultant }))
    .sort((a, b) => b.total - a.total);
  const max = Math.max(1, ...rows.map((r) => r.total));

  if (rows.length === 0 || rows.every((r) => r.total === 0)) {
    return (
      <div className="flex h-24 items-center justify-center text-xs text-[var(--anchor-gray)]">
        No data yet.
      </div>
    );
  }

  return (
    <div>
      {/* Legend */}
      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1">
        {SEGMENTS.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5 text-[11px] text-[var(--anchor-gray)]">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: s.color }} />
            {s.label}
          </span>
        ))}
      </div>

      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.manufacturer} className="flex items-center gap-2">
            <span className="w-16 shrink-0 truncate text-xs font-semibold text-[var(--anchor-deep)] sm:w-24" title={r.manufacturer}>
              {r.manufacturer}
            </span>
            <div className="flex h-5 flex-1 overflow-hidden rounded bg-[var(--surface-soft)]">
              {SEGMENTS.map((s) => {
                const v = r.vals[s.key];
                if (v <= 0) return null;
                return (
                  <div
                    key={s.key}
                    className="h-full"
                    style={{ width: `${(v / max) * 100}%`, backgroundColor: s.color }}
                    title={`${s.label}: ${v.toLocaleString()}${valueSuffix}`}
                  />
                );
              })}
            </div>
            <span className="w-12 shrink-0 text-right text-xs font-bold tabular-nums text-[var(--anchor-deep)]">
              {r.total.toLocaleString()}{valueSuffix}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
