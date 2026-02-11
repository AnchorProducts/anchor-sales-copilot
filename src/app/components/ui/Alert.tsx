import type { HTMLAttributes } from "react";
import { cn } from "@/app/components/ui/cn";

type Tone = "neutral" | "success" | "error";

type AlertProps = HTMLAttributes<HTMLDivElement> & {
  tone?: Tone;
};

export function Alert({ tone = "neutral", className, ...props }: AlertProps) {
  return <div className={cn("ds-alert", `ds-alert-${tone}`, className)} {...props} />;
}

export function Toast({ tone = "neutral", className, ...props }: AlertProps) {
  return <div className={cn("ds-toast", `ds-alert-${tone}`, className)} {...props} />;
}
