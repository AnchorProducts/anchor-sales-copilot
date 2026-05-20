"use client";

import { useMemo } from "react";

export type DonutUser = {
  manufacturer: string | null;
  leadCount: number;
  events: { total7: number; total30: number };
};

type StatusKey = "thriving" | "moderate" | "atRisk" | "notSignedUp";

const STATUS_META: Record<StatusKey, { label: string; color: string }> = {
  thriving: { label: "Thriving", color: "#a8e96d" },
  moderate: { label: "Moderate", color: "#11500F" },
  atRisk: { label: "At risk", color: "#f59e0b" },
  notSignedUp: { label: "Not signed up", color: "#cbd5e1" },
};

function statusFor(
  signedUp: number,
  active7: number,
  events30: number
): StatusKey {
  if (signedUp === 0) return "notSignedUp";
  const activation = signedUp > 0 ? (active7 / signedUp) * 100 : 0;
  if (activation >= 50 && events30 >= 20) return "thriving";
  if (activation >= 20 || events30 >= 5) return "moderate";
  return "atRisk";
}

export function OemStatusDonut({
  users,
  oemContactCounts,
}: {
  users: DonutUser[];
  oemContactCounts: Record<string, number>;
}) {
  const counts = useMemo(() => {
    const groups = new Map<string, DonutUser[]>();
    for (const u of users) {
      if (!u.manufacturer) continue;
      const list = groups.get(u.manufacturer) ?? [];
      list.push(u);
      groups.set(u.manufacturer, list);
    }

    const allOems = new Set<string>([
      ...groups.keys(),
      ...Object.keys(oemContactCounts || {}),
    ]);

    const out: Record<StatusKey, number> = {
      thriving: 0,
      moderate: 0,
      atRisk: 0,
      notSignedUp: 0,
    };

    for (const oem of allOems) {
      const list = groups.get(oem) ?? [];
      const signedUp = list.length;
      const active7 = list.filter((u) => u.events.total7 > 0).length;
      const events30 = list.reduce((s, u) => s + u.events.total30, 0);
      out[statusFor(signedUp, active7, events30)] += 1;
    }
    return out;
  }, [users, oemContactCounts]);

  const total = Object.values(counts).reduce((s, v) => s + v, 0);
  const order: StatusKey[] = ["thriving", "moderate", "atRisk", "notSignedUp"];
  const segments = order
    .map((k) => ({ key: k, count: counts[k] }))
    .filter((s) => s.count > 0);

  if (total === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-sm text-[var(--anchor-gray)]">
        No OEMs to chart.
      </div>
    );
  }

  // SVG geometry. Donut with outer radius 80 and stroke width that makes the
  // hole take up most of the inside. We compute strokeDasharray segments along
  // a full circle (radius 64) to avoid path math.
  const size = 200;
  const cx = size / 2;
  const cy = size / 2;
  const r = 70;
  const circumference = 2 * Math.PI * r;
  let offsetSoFar = 0;

  return (
    <div>
      <div className="flex items-center justify-center">
        <svg
          width={size}
          height={size}
          viewBox={`0 0 ${size} ${size}`}
          role="img"
          aria-label="OEM status breakdown"
        >
          {/* background ring */}
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke="var(--surface-strong)"
            strokeWidth={28}
          />
          {segments.map((seg) => {
            const segLen = (seg.count / total) * circumference;
            const dashArray = `${segLen} ${circumference - segLen}`;
            const dashOffset = -offsetSoFar;
            offsetSoFar += segLen;
            return (
              <circle
                key={seg.key}
                cx={cx}
                cy={cy}
                r={r}
                fill="none"
                stroke={STATUS_META[seg.key].color}
                strokeWidth={28}
                strokeDasharray={dashArray}
                strokeDashoffset={dashOffset}
                strokeLinecap="butt"
                transform={`rotate(-90 ${cx} ${cy})`}
              />
            );
          })}

          {/* Center label */}
          <text
            x={cx}
            y={cy - 6}
            textAnchor="middle"
            fill="var(--anchor-gray)"
            style={{ fontSize: "11px", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase" }}
          >
            Total OEMs
          </text>
          <text
            x={cx}
            y={cy + 18}
            textAnchor="middle"
            fill="var(--anchor-deep)"
            style={{ fontSize: "32px", fontWeight: 700 }}
          >
            {total}
          </text>
        </svg>
      </div>

      {/* Legend pills */}
      <ul className="mt-4 grid grid-cols-2 gap-2 text-xs">
        {order.map((k) => {
          const c = counts[k];
          const pct = total > 0 ? Math.round((c / total) * 100) : 0;
          const dimmed = c === 0;
          return (
            <li
              key={k}
              className={
                "flex items-center justify-between gap-2 rounded-full bg-[var(--surface-soft)] px-3 py-1.5 " +
                (dimmed ? "opacity-40" : "")
              }
            >
              <div className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: STATUS_META[k].color }}
                />
                <span className="font-semibold text-[var(--anchor-deep)]">
                  {STATUS_META[k].label}
                </span>
              </div>
              <span className="shrink-0 text-[var(--anchor-gray)] tabular-nums">
                {c} · {pct}%
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
