"use client";

import { Fragment, useState } from "react";
import { Card } from "@/app/components/ui/Card";
import type {
  MatrixCell,
  MatrixGroup,
  MatrixRow,
} from "@/lib/analytics/oemMatrixPdf";

const ALL_GROUPS: Array<{ key: MatrixGroup; label: string; tint: string }> = [
  { key: "sales", label: "OEM Sales Reps", tint: "bg-[#dbeafe]" },
  { key: "tech", label: "OEM Tech Reps", tint: "bg-[var(--anchor-mint)]/50" },
  { key: "consultant", label: "Consultants", tint: "bg-[#ede9fe]" },
];

// Sub-columns within each group. `title` is the CEO's full column wording.
const METRICS: Array<{ key: keyof MatrixCell; short: string; title: string }> = [
  { key: "downloaded", short: "Down", title: "Signed up (downloaded)" },
  { key: "notDownloaded", short: "Not", title: "Have not signed up" },
  { key: "uses", short: "Uses", title: "Uses (events in the selected window)" },
  { key: "notReporting", short: "No proj", title: "Signed up but no lead/report in the selected window" },
  { key: "leads", short: "Leads", title: "Leads submitted in the selected window" },
  { key: "reports", short: "Reps", title: "Reports submitted in the selected window" },
];

export function OemMatrixTable({
  rows,
  totals,
  groups,
}: {
  rows: MatrixRow[];
  totals: Record<MatrixGroup, MatrixCell>;
  /** Which group columns to show. Defaults to all three. */
  groups?: MatrixGroup[];
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const GROUPS = groups
    ? ALL_GROUPS.filter((g) => groups.includes(g.key))
    : ALL_GROUPS;

  if (rows.length === 0) {
    return (
      <Card className="p-5 text-sm text-[var(--anchor-gray)]">
        No manufacturers match these filters.
      </Card>
    );
  }

  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full min-w-[1320px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-[var(--border-default)]">
            <th
              rowSpan={2}
              className="sticky left-0 z-10 bg-white px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--anchor-gray)]"
            >
              Manufacturer
            </th>
            {GROUPS.map((g) => (
              <th
                key={g.key}
                colSpan={METRICS.length}
                className={`border-l border-[var(--border-default)] px-3 py-2 text-center text-xs font-bold text-[var(--anchor-deep)] ${g.tint}`}
              >
                {g.label}
              </th>
            ))}
          </tr>
          <tr className="border-b border-[var(--border-default)] bg-[var(--surface-soft)]">
            {GROUPS.map((g) =>
              METRICS.map((m, i) => (
                <th
                  key={`${g.key}-${m.key}`}
                  title={m.title}
                  className={
                    "px-2 py-1.5 text-right text-[10px] font-semibold uppercase tracking-wide text-[var(--anchor-gray)] " +
                    (i === 0 ? "border-l border-[var(--border-default)]" : "")
                  }
                >
                  {m.short}
                </th>
              ))
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const open = expanded === row.manufacturer;
            return (
              <Fragment key={row.manufacturer}>
                <tr
                  onClick={() => setExpanded(open ? null : row.manufacturer)}
                  className={"cursor-pointer border-b border-[var(--border-default)] transition-colors " + (open ? "bg-[var(--surface-soft)]" : "bg-white hover:bg-[var(--surface-soft)]")}
                >
                  <td className="sticky left-0 z-10 whitespace-nowrap bg-inherit px-3 py-2 font-semibold text-[var(--anchor-deep)]">
                    <span className="inline-flex items-center gap-1.5">
                      <svg viewBox="0 0 24 24" className={`h-3.5 w-3.5 text-[var(--anchor-gray)] transition-transform ${open ? "rotate-90" : ""}`} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <polyline points="9 6 15 12 9 18" />
                      </svg>
                      {row.manufacturer}
                    </span>
                  </td>
                  {GROUPS.map((g) =>
                    METRICS.map((m, i) => (
                      <td
                        key={`${g.key}-${m.key}`}
                        className={
                          "px-2 py-2 text-right tabular-nums " +
                          (i === 0 ? "border-l border-[var(--border-default)] " : "") +
                          (m.key === "notReporting" && (row.groups[g.key][m.key] as number) > 0 ? "text-amber-700" : "")
                        }
                      >
                        {(row.groups[g.key][m.key] as number).toLocaleString()}
                      </td>
                    ))
                  )}
                </tr>
                {open && (
                  <tr className="border-b border-[var(--border-default)] bg-[var(--surface-soft)]">
                    <td colSpan={1 + GROUPS.length * METRICS.length} className="px-3 py-3">
                      <div className="grid gap-3 lg:grid-cols-3">
                        {GROUPS.map((g) => (
                          <PeopleList key={g.key} title={g.label} cell={row.groups[g.key]} />
                        ))}
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-[var(--border-default)] bg-[var(--surface-soft)] font-semibold">
            <td className="sticky left-0 z-10 bg-[var(--surface-soft)] px-3 py-2 text-[var(--anchor-deep)]">Total</td>
            {GROUPS.map((g) =>
              METRICS.map((m, i) => (
                <td
                  key={`t-${g.key}-${m.key}`}
                  className={"px-2 py-2 text-right tabular-nums " + (i === 0 ? "border-l border-[var(--border-default)]" : "")}
                >
                  {(totals[g.key][m.key] as number).toLocaleString()}
                </td>
              ))
            )}
          </tr>
        </tfoot>
      </table>
    </Card>
  );
}

function PeopleList({ title, cell }: { title: string; cell: MatrixCell }) {
  return (
    <div className="rounded-xl border border-[var(--border-default)] bg-white p-3">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wide text-[var(--anchor-deep)]">{title}</span>
        <span className="text-[10px] text-[var(--anchor-gray)]">
          {cell.downloaded}/{cell.downloaded + cell.notDownloaded} signed up
        </span>
      </div>
      {cell.people.length === 0 ? (
        <p className="text-xs text-[var(--anchor-gray)]">No one here.</p>
      ) : (
        <ul className="space-y-1">
          {cell.people.map((p, i) => (
            <li key={`${p.email || p.name}-${i}`} className="flex items-center justify-between gap-2 rounded-md bg-[var(--surface-soft)] px-2 py-1 text-xs">
              <span className="min-w-0 flex-1 truncate" title={p.email || undefined}>
                {p.name}
                {!p.signedUp && <span className="ml-1 text-[10px] text-[var(--anchor-gray)]">· not signed up</span>}
              </span>
              <span className="shrink-0 tabular-nums text-[var(--anchor-gray)]">{p.uses} uses</span>
              <span className="shrink-0 tabular-nums font-semibold text-[var(--anchor-deep)]">{p.leads}L · {p.reports}R</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
