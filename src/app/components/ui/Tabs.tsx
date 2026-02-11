import type { ButtonHTMLAttributes, HTMLAttributes } from "react";
import { cn } from "@/app/components/ui/cn";

export function Tabs({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("ds-tabs", className)} {...props} />;
}

type TabButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  active?: boolean;
};

export function TabButton({ active, className, type, ...props }: TabButtonProps) {
  return (
    <button
      type={type ?? "button"}
      className={cn("ds-tab", active && "is-active", className)}
      {...props}
    />
  );
}
