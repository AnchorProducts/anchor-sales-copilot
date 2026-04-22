"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/app/components/ui/cn";

type Props = {
  options: string[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  className?: string;
};

export function MultiSelect({ options, value, onChange, placeholder = "Select…", className }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click (desktop)
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  // Lock body scroll when bottom sheet is open on mobile
  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  function toggle(opt: string) {
    onChange(value.includes(opt) ? value.filter((v) => v !== opt) : [...value, opt]);
  }

  const triggerLabel =
    value.length === 0
      ? placeholder
      : value.length <= 2
        ? value.join(", ")
        : `${value.length} selected`;

  return (
    <div ref={ref} className={cn("relative", className)}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="ds-select flex min-h-[44px] w-full items-center justify-between px-3 py-2 text-left"
      >
        <span className={cn("truncate text-sm leading-snug", value.length === 0 && "text-black/40")}>
          {triggerLabel}
        </span>
        <span className="ml-2 shrink-0 text-[10px] text-black/40">{open ? "▴" : "▾"}</span>
      </button>

      {open && (
        <>
          {/* Mobile backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/30 sm:hidden"
            onClick={() => setOpen(false)}
          />

          {/* Panel — bottom sheet on mobile, absolute dropdown on sm+ */}
          <div
            className={cn(
              // Mobile: fixed bottom sheet
              "fixed inset-x-0 bottom-0 z-50 rounded-t-2xl bg-white shadow-xl",
              // Desktop: absolute dropdown
              "sm:absolute sm:inset-x-auto sm:bottom-auto sm:top-full sm:mt-1 sm:w-full sm:rounded-xl sm:shadow-lg",
            )}
          >
            {/* Mobile header */}
            <div className="flex items-center justify-between border-b border-black/10 px-4 py-3 sm:hidden">
              <span className="text-sm font-semibold text-black">
                {value.length > 0 ? `${value.length} selected` : "Select options"}
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-sm font-semibold text-[var(--anchor-green)]"
              >
                Done
              </button>
            </div>

            {/* Options list */}
            <div className="max-h-[55vh] overflow-y-auto sm:max-h-64">
              {options.map((opt) => (
                <label
                  key={opt}
                  className="flex cursor-pointer items-center gap-3 px-4 py-3 text-sm hover:bg-[var(--surface-soft)] sm:px-3 sm:py-2"
                >
                  <input
                    type="checkbox"
                    checked={value.includes(opt)}
                    onChange={() => toggle(opt)}
                    className="h-4 w-4 shrink-0"
                  />
                  <span>{opt}</span>
                </label>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
