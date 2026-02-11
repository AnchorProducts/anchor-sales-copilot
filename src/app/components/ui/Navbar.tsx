import type { HTMLAttributes } from "react";
import { cn } from "@/app/components/ui/cn";

export function Navbar({ className, ...props }: HTMLAttributes<HTMLElement>) {
  return <header className={cn("ds-navbar", className)} {...props} />;
}

export function NavbarInner({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("ds-navbar-inner", className)} {...props} />;
}
