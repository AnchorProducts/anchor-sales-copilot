import type { HTMLAttributes } from "react";
import { cn } from "@/app/components/ui/cn";

type ModalProps = HTMLAttributes<HTMLDivElement> & {
  open: boolean;
};

export default function Modal({ open, className, children, ...props }: ModalProps) {
  if (!open) return null;

  return (
    <div className="ds-modal-overlay" role="dialog" aria-modal="true">
      <div className={cn("ds-modal", className)} {...props}>
        {children}
      </div>
    </div>
  );
}
