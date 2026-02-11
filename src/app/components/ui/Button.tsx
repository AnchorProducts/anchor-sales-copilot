import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/app/components/ui/cn";

type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
};

export default function Button({ variant = "primary", className, type, ...props }: ButtonProps) {
  return (
    <button
      type={type ?? "button"}
      className={cn("ds-btn", `ds-btn-${variant}`, className)}
      {...props}
    />
  );
}
