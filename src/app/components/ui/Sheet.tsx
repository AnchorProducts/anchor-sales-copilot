"use client";

import { type ReactNode } from "react";
import { cn } from "@/app/components/ui/cn";
import { useDialogBody, useDialogEscape } from "@/app/components/ui/useDialogBody";

// A bottom sheet on phones, an ordinary centered dialog from `sm` up.
//
// Modal is the right shape for a form you sit down to fill in. It's the wrong
// shape for the quick, one-handed choices an app makes constantly — filter this
// list, pick a series, act on the row you just tapped. Those want to come up
// from the bottom edge, under the thumb, over content you can still see, and go
// away with a tap outside. That's what this is.
//
// It shares Modal's body handling (page lock + the mark that stands the
// floating app chrome down), so the two can't disagree about what a dialog does
// to the page behind it.
export default function Sheet({
  open,
  onClose,
  title,
  // Sticky at the foot of the sheet, clear of the phone's home indicator — the
  // "Done"/"Clear" row that shouldn't scroll away with the content.
  footer,
  className,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  footer?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  useDialogBody(open);
  useDialogEscape(open, onClose);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-black/45 backdrop-blur-[2px] sm:items-center sm:p-3"
      role="dialog"
      aria-modal="true"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={cn(
          "flex max-h-[85vh] w-full flex-col rounded-t-2xl border border-[var(--border-default)] bg-[var(--surface-card)] shadow-[0_-8px_30px_rgba(0,0,0,0.18)]",
          "sm:max-h-[85vh] sm:w-[min(100%,32rem)] sm:rounded-2xl sm:shadow-[var(--shadow-lg)]",
          className
        )}
      >
        {/* The grab handle says "this came up from the bottom and goes back
            down" before anyone reads the title. Decorative only — the real
            dismissals are the backdrop, Escape, and the close button. */}
        <div className="flex justify-center pt-2 sm:hidden" aria-hidden>
          <div className="h-1 w-10 rounded-full bg-black/15" />
        </div>

        {title && (
          <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-3">
            <h2 className="text-sm font-bold text-[var(--anchor-deep)]">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="-mr-1 flex h-8 w-8 items-center justify-center rounded-full text-[var(--anchor-gray)] transition hover:bg-[var(--surface-soft)]"
            >
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="h-4 w-4" aria-hidden>
                <path d="M5 5l10 10M15 5L5 15" />
              </svg>
            </button>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">{children}</div>

        {footer && (
          <div className="border-t border-[var(--border-default)] px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:pb-3">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}
