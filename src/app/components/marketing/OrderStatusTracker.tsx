"use client";

import {
  MARKETING_ORDER_PROGRESS,
  MARKETING_ORDER_CANCELLED,
  MARKETING_ORDER_DELAYED,
  marketingOrderProgressIndex,
} from "@/lib/marketingOrders";

// Horizontal stepper for a marketing order's status. Renders the linear
// progress path (new → processing → shipped → fulfilled); a cancelled order
// shows a single terminal banner instead.
export default function OrderStatusTracker({ status }: { status: string | null | undefined }) {
  const key = status || "new";

  // "delayed" details (projected ship date + reason) are rendered by the parent
  // via OrderDelayBanner; show a compact off-path banner here for safety.
  if (key === MARKETING_ORDER_DELAYED.key) {
    return (
      <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
        {MARKETING_ORDER_DELAYED.label} — {MARKETING_ORDER_DELAYED.description}
      </div>
    );
  }

  if (key === MARKETING_ORDER_CANCELLED.key) {
    return (
      <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
        {MARKETING_ORDER_CANCELLED.label} — {MARKETING_ORDER_CANCELLED.description}
      </div>
    );
  }

  const currentIndex = Math.max(0, marketingOrderProgressIndex(key));

  return (
    <ol className="flex items-start">
      {MARKETING_ORDER_PROGRESS.map((step, i) => {
        const done = i < currentIndex;
        const current = i === currentIndex;
        const isLast = i === MARKETING_ORDER_PROGRESS.length - 1;

        const dotClass = done
          ? "bg-[var(--anchor-green)] text-white"
          : current
          ? "bg-[var(--anchor-green)] text-white ring-4 ring-[var(--anchor-mint)]"
          : "bg-[var(--surface-strong)] text-[var(--anchor-gray)]";

        return (
          <li key={step.key} className="flex flex-1 flex-col items-center text-center">
            <div className="flex w-full items-center">
              {/* left connector (hidden for first) */}
              <div
                className={`h-0.5 flex-1 ${i === 0 ? "opacity-0" : done || current ? "bg-[var(--anchor-green)]" : "bg-[var(--border-default)]"}`}
              />
              <div
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${dotClass}`}
              >
                {done ? "✓" : i + 1}
              </div>
              {/* right connector (hidden for last) */}
              <div
                className={`h-0.5 flex-1 ${isLast ? "opacity-0" : done ? "bg-[var(--anchor-green)]" : "bg-[var(--border-default)]"}`}
              />
            </div>
            <div
              className={`mt-1.5 text-[11px] leading-tight ${
                done || current ? "font-semibold text-[var(--anchor-deep)]" : "text-[var(--anchor-gray)]"
              }`}
            >
              {step.label}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
