"use client";

import { useEffect, useRef, useState } from "react";
import type { MatrixGroup } from "@/lib/analytics/oemMatrixCore";

export const DAY_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 1, label: "Last 24 hours" },
  { value: 7, label: "Last 7 days" },
  { value: 14, label: "Last 14 days" },
  { value: 30, label: "Last 30 days" },
];

export function dayLabel(days: number): string {
  return DAY_OPTIONS.find((d) => d.value === days)?.label ?? `Last ${days} days`;
}

const GROUP_OPTIONS: Array<{ value: MatrixGroup; label: string }> = [
  { value: "sales", label: "Sales reps" },
  { value: "tech", label: "Tech reps" },
  { value: "consultant", label: "Consultants" },
];

function toggle<T>(arr: T[], v: T): T[] {
  return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
}

export function MatrixFilterMenu({
  manufacturers,
  selectedManufacturers,
  onManufacturers,
  selectedGroups,
  onGroups,
  days,
  onDays,
}: {
  manufacturers: string[];
  selectedManufacturers: string[];
  onManufacturers: (v: string[]) => void;
  selectedGroups: MatrixGroup[];
  onGroups: (v: MatrixGroup[]) => void;
  days: number;
  onDays: (v: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click or Escape.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Empty selection = "all", so only badge an explicit narrowing.
  const activeCount = selectedManufacturers.length + selectedGroups.length;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-[var(--border-default)] bg-white px-3 text-sm font-semibold text-[var(--anchor-deep)] transition-colors hover:bg-[var(--surface-soft)]"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
        </svg>
        Filters
        <span className="ml-0.5 whitespace-nowrap rounded-full bg-[var(--surface-soft)] px-2 py-0.5 text-[11px] font-semibold tabular-nums text-[var(--anchor-gray)]">
          {dayLabel(days)}
        </span>
        {activeCount > 0 && (
          <span className="rounded-full bg-[var(--anchor-green)] px-1.5 text-[11px] font-bold tabular-nums text-white">
            {activeCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 z-20 mt-2 w-[min(18rem,calc(100vw-2rem))] rounded-xl border border-[var(--border-default)] bg-white p-3 shadow-lg sm:left-auto sm:right-0 sm:w-72">
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--anchor-gray)]">Time</span>
              <select
                value={days}
                onChange={(e) => onDays(Number(e.target.value))}
                className="ds-input h-9 w-full"
              >
                {DAY_OPTIONS.map((d) => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            </label>

            <fieldset className="flex flex-col gap-1.5">
              <legend className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--anchor-gray)]">Type</legend>
              {GROUP_OPTIONS.map((g) => (
                <label key={g.value} className="flex items-center gap-2 text-sm text-[var(--anchor-deep)]">
                  <input
                    type="checkbox"
                    checked={selectedGroups.includes(g.value)}
                    onChange={() => onGroups(toggle(selectedGroups, g.value))}
                    className="h-4 w-4 accent-[var(--anchor-green)]"
                  />
                  {g.label}
                </label>
              ))}
            </fieldset>

            <fieldset className="flex flex-col gap-1.5">
              <legend className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--anchor-gray)]">
                Manufacturer
                {selectedManufacturers.length > 0 && (
                  <span className="ml-1 normal-case text-[var(--anchor-green)]">({selectedManufacturers.length})</span>
                )}
              </legend>
              <div className="max-h-44 overflow-y-auto pr-1">
                {manufacturers.length === 0 ? (
                  <p className="text-xs text-[var(--anchor-gray)]">No manufacturers.</p>
                ) : (
                  manufacturers.map((m) => (
                    <label key={m} className="flex items-center gap-2 py-0.5 text-sm text-[var(--anchor-deep)]">
                      <input
                        type="checkbox"
                        checked={selectedManufacturers.includes(m)}
                        onChange={() => onManufacturers(toggle(selectedManufacturers, m))}
                        className="h-4 w-4 accent-[var(--anchor-green)]"
                      />
                      {m}
                    </label>
                  ))
                )}
              </div>
            </fieldset>

            {activeCount > 0 && (
              <button
                type="button"
                onClick={() => { onManufacturers([]); onGroups([]); }}
                className="self-start text-xs font-semibold text-[var(--anchor-green)] hover:underline"
              >
                Clear filters
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
