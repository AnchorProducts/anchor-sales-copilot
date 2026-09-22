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
      <div className="rounded-[14px] bg-amber-500/10 px-3.5 py-2.5 text-[13px] font-medium text-amber-800">
        {MARKETING_ORDER_DELAYED.label} · {MARKETING_ORDER_DELAYED.description}
      </div>
    );
  }

  if (key === MARKETING_ORDER_CANCELLED.key) {
    return (
      <div className="rounded-[14px] bg-red-500/10 px-3.5 py-2.5 text-[13px] font-medium text-red-700">
        {MARKETING_ORDER_CANCELLED.label} · {MARKETING_ORDER_CANCELLED.description}
      </div>
    );
  }

  const currentIndex = Math.max(0, marketingOrderProgressIndex(key));

  // A segmented progress bar with the step names under it, the way Apple shows
  // an order's progress.
  return (
    <div>
      <div className="flex gap-1.5" aria-hidden>
        {MARKETING_ORDER_PROGRESS.map((step, i) => (
          <div
            key={step.key}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              i <= currentIndex ? "bg-[var(--anchor-green)]" : "bg-[rgba(118,118,128,0.18)]"
            }`}
          />
        ))}
      </div>
      <ol className="mt-2 grid text-[12px]" style={{ gridTemplateColumns: `repeat(${MARKETING_ORDER_PROGRESS.length}, minmax(0, 1fr))` }}>
        {MARKETING_ORDER_PROGRESS.map((step, i) => (
          <li
            key={step.key}
            aria-current={i === currentIndex ? "step" : undefined}
            className={`truncate ${
              i === currentIndex
                ? "font-semibold text-black"
                : i < currentIndex
                  ? "text-[var(--anchor-deep)]"
                  : "text-[var(--anchor-gray)]"
            }`}
          >
            {step.label}
          </li>
        ))}
      </ol>
    </div>
  );
}
