"use client";

import { type HTMLAttributes } from "react";
import { cn } from "@/app/components/ui/cn";
import { useDialogBody, useDialogEscape } from "@/app/components/ui/useDialogBody";

type ModalProps = HTMLAttributes<HTMLDivElement> & {
  open: boolean;
  // Optional: when given, the modal closes on Escape and on a click outside the
  // panel — the two ways people expect to leave a dialog. Callers that must not
  // be dismissed by accident simply don't pass it and keep their own close
  // button as the only way out.
  onClose?: () => void;
};

export default function Modal({ open, onClose, className, children, ...props }: ModalProps) {
  useDialogBody(open);
  useDialogEscape(open, onClose);

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
