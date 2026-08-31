"use client";

import { useEffect, type HTMLAttributes } from "react";
import { cn } from "@/app/components/ui/cn";

type ModalProps = HTMLAttributes<HTMLDivElement> & {
  open: boolean;
  // Optional: when given, the modal closes on Escape and on a click outside the
  // panel — the two ways people expect to leave a dialog. Callers that must not
  // be dismissed by accident simply don't pass it and keep their own close
  // button as the only way out.
  onClose?: () => void;
};

export default function Modal({ open, onClose, className, children, ...props }: ModalProps) {
  // While a dialog is up, the page behind it shouldn't scroll away underneath —
  // and the floating app chrome shouldn't sit on top of it. The mobile dock
  // (z-index 100) and help button (z-90) both outrank .ds-modal-overlay (z-60),
  // so they drew over every modal in the app on a phone. Raising the overlay
  // instead would jump it over the sheets MultiSelect opens at z-110/120, which
  // have to stay on top when one is used inside a dialog. Marking the body is
  // what lets globals.css stand the chrome down for exactly as long as a dialog
  // is open. Counted, so closing one of two stacked dialogs doesn't bring the
  // dock back over the other.
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const depth = Number(document.body.dataset.modalOpen || 0) + 1;
    document.body.dataset.modalOpen = String(depth);
    return () => {
      document.body.style.overflow = previousOverflow;
      const next = Number(document.body.dataset.modalOpen || 1) - 1;
      if (next > 0) document.body.dataset.modalOpen = String(next);
      else delete document.body.dataset.modalOpen;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !onClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="ds-modal-overlay"
      role="dialog"
      aria-modal="true"
      // Only a click that both starts and ends on the overlay itself closes it,
      // so dragging a text selection out of the panel doesn't dismiss the work.
      onMouseDown={(e) => {
        if (onClose && e.target === e.currentTarget) onClose();
      }}
    >
      <div className={cn("ds-modal", className)} {...props}>
        {children}
      </div>
    </div>
  );
}
