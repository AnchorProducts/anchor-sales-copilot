"use client";

import { US_STATES } from "@/lib/sales/states";
import { Select } from "@/app/components/ui/Field";

// Pick one or more US states. Selected states show as removable chips; the
// dropdown only lists states not already chosen. Used wherever a user/profile
// can cover multiple territories (and therefore multiple sales reps).
export default function StateMultiSelect({
  value,
  onChange,
  placeholder = "Add a state…",
  disabled,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const selected = value.map((s) => String(s || "").trim().toUpperCase()).filter(Boolean);
  const remaining = US_STATES.filter((s) => !selected.includes(s));

  function add(state: string) {
    const s = state.trim().toUpperCase();
    if (s && !selected.includes(s)) onChange([...selected, s]);
  }
  function remove(state: string) {
    onChange(selected.filter((s) => s !== state));
  }

  return (
    <div className="grid gap-2">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((s) => (
            <span
              key={s}
              className="inline-flex items-center gap-1 rounded-full bg-[var(--anchor-mint)]/60 px-2.5 py-1 text-xs font-semibold text-[var(--anchor-deep)]"
            >
              {s}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => remove(s)}
                  aria-label={`Remove ${s}`}
                  className="leading-none text-[var(--anchor-deep)]/70 transition hover:text-[var(--anchor-deep)]"
                >
                  ×
                </button>
              )}
            </span>
          ))}
        </div>
      )}
      {!disabled && remaining.length > 0 && (
        <Select
          value=""
          onChange={(e) => {
            add(e.target.value);
            e.currentTarget.value = "";
          }}
          className="h-11 px-3 text-sm"
        >
          <option value="">{placeholder}</option>
          {remaining.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
      )}
    </div>
  );
}
