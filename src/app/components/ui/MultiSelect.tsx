"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/app/components/ui/cn";

type Section = { heading: string; options: string[]; comingSoon?: boolean };

type Props = {
  options: string[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  className?: string;
  sections?: Section[];
};

export function MultiSelect({ options, value, onChange, placeholder = "Select…", className, sections }: Props) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const ref = useRef<HTMLDivElement>(null);
  // After closing the sheet via Done/X/backdrop, briefly swallow any synthetic
  // click that iOS Safari fires on whatever lands under the touch point — that
  // ghost click was reopening the trigger immediately after close.
  const suppressReopenUntilRef = useRef(0);

  function toggleSection(heading: string) {
    setExpanded((prev) => ({ ...prev, [heading]: !prev[heading] }));
  }

  function close() {
    setOpen(false);
    suppressReopenUntilRef.current = Date.now() + 400;
  }

  function onTriggerClick() {
    if (Date.now() < suppressReopenUntilRef.current) return;
    setOpen((o) => !o);
  }

  // Close on outside click (desktop)
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) close();
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
        onClick={onTriggerClick}
        style={{ touchAction: "manipulation" }}
        // Grid with a minmax(0,1fr) label track + auto chevron track keeps the
        // trigger pinned to its wrapper width and truncates the selected label.
        // This is more robust than flex+min-width:0, which iOS Safari can ignore
        // for form controls (letting the box grow past its card on long labels).
        className="ds-select grid min-h-[44px] w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 px-3 py-2 text-left"
      >
        <span className={cn("min-w-0 truncate text-sm leading-snug", value.length === 0 && "text-black/40")}>
          {triggerLabel}
        </span>
        <span className="text-[10px] text-black/40">{open ? "▴" : "▾"}</span>
      </button>

      {open && (
        <>
          {/* Mobile backdrop */}
          <button
            type="button"
            aria-label="Close"
            onClick={close}
            style={{ touchAction: "manipulation" }}
            className="fixed inset-0 z-[110] cursor-default bg-black/30 sm:hidden"
          />

          {/* Panel — bottom sheet on mobile, absolute dropdown on sm+ */}
          <div
            className={cn(
              // Mobile: fixed bottom sheet
              "fixed inset-x-0 bottom-0 z-[120] rounded-t-2xl bg-white shadow-xl",
              // Desktop: absolute dropdown
              "sm:absolute sm:inset-x-auto sm:bottom-auto sm:top-full sm:mt-1 sm:w-full sm:rounded-xl sm:shadow-lg",
            )}
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            {/* Mobile header */}
            <div className="flex items-center justify-between border-b border-black/10 px-4 sm:hidden">
              <span className="text-sm font-semibold text-black">
                {value.length > 0 ? `${value.length} selected` : "Select options"}
              </span>
              <button
                type="button"
                onClick={close}
                style={{ touchAction: "manipulation" }}
                aria-label="Close"
                className="-mr-3 flex h-12 min-w-[80px] items-center justify-end px-3 text-base font-semibold text-[var(--anchor-green)] active:opacity-60"
              >
                Done
              </button>
            </div>

            {/* Options list */}
            <div className="max-h-[55vh] overflow-y-auto sm:max-h-64">
              {sections && sections.length > 0
                ? sections.map((section) => {
                    const selectedCount = section.options.filter((o) => value.includes(o)).length;
                    const isOpen = expanded[section.heading] ?? false;
                    return (
                      <div key={section.heading} className="border-b border-black/5 last:border-b-0">
                        <button
                          type="button"
                          onClick={() => toggleSection(section.heading)}
                          className="flex w-full items-center justify-between gap-2 bg-[var(--surface-soft)] px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--anchor-deep)] hover:bg-[var(--surface-soft)]/80 sm:px-3 sm:py-2"
                          aria-expanded={isOpen}
                        >
                          <span className="flex items-center gap-2 truncate">
                            <span className="truncate">{section.heading}</span>
                            {section.comingSoon && (
                              <span className="rounded-full bg-black/10 px-2 py-0.5 text-[10px] font-semibold uppercase text-black/50">
                                Coming soon
                              </span>
                            )}
                            {selectedCount > 0 && (
                              <span className="inline-flex items-center rounded-full bg-[var(--anchor-green)] px-2 py-0.5 text-[10px] font-bold text-white">
                                {selectedCount}
                              </span>
                            )}
                          </span>
                          <span className="shrink-0 text-[10px] text-black/40">{isOpen ? "▴" : "▾"}</span>
                        </button>
                        {isOpen &&
                          section.options.map((opt) => (
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
                              <span className="min-w-0 break-words">{opt}</span>
                            </label>
                          ))}
                      </div>
                    );
                  })
                : options.map((opt) => (
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
                      <span className="min-w-0 break-words">{opt}</span>
                    </label>
                  ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
