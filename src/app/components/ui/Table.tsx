import type { HTMLAttributes, TableHTMLAttributes } from "react";
import { cn } from "@/app/components/ui/cn";

export function TableWrapper({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("ds-table-wrap", className)} {...props} />;
}

export function Table({ className, ...props }: TableHTMLAttributes<HTMLTableElement>) {
  return <table className={cn("ds-table", className)} {...props} />;
}
