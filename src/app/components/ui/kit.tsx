"use client";

// The app's Apple-style building blocks: SF Symbols-like line icons (use these
// instead of emoji), an iOS segmented control, a capsule stepper, pill buttons
// and elevated surfaces. Styling hooks (.mo-surface, the --mo-* fills) live in
// globals.css.

import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { cn } from "@/app/components/ui/cn";

const PATHS: Record<string, string> = {
  box: "M3.5 7.6 12 3.2l8.5 4.4v8.8L12 20.8l-8.5-4.4z M3.5 7.6 12 12l8.5-4.4 M12 12v8.8 M7.8 5.4l8.4 4.4",
  shirt: "M8.5 3.5 4 6l-1.5 4.5 3 1.2V20.5h13v-8.8l3-1.2L20 6l-4.5-2.5c-.6 1.7-2 2.8-3.5 2.8S9.1 5.2 8.5 3.5z",
  doc: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z M14 3v5h5 M9 13h6 M9 17h6",
  display: "M3 4.5h18v10.5H3z M12 15v4.5 M8 20h8",
  star: "M12 3.6l2.6 5.2 5.8.9-4.2 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.2-4.1 5.8-.9z",
  building: "M3.5 20.5V10l5 3v-3l5 3V6.5l7 2.8v11.2z M2.5 20.5h19 M7 17h2 M11.5 17h2 M16 17h2",
  person: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4.5 20.5a7.5 7.5 0 0 1 15 0",
  bag: "M5 8h14l-1.1 12.1a1 1 0 0 1-1 .9H7.1a1 1 0 0 1-1-.9z M9 8V6.5a3 3 0 0 1 6 0V8",
  plus: "M12 5v14 M5 12h14",
  minus: "M5.5 12h13",
  xmark: "M6.5 6.5l11 11 M17.5 6.5l-11 11",
  chevronLeft: "M14.5 18l-6-6 6-6",
  chevronRight: "M9.5 18l6-6-6-6",
  chevronDown: "M6 9.5l6 6 6-6",
  check: "M5 12.5l4.5 4.5L19 7.5",
  download: "M12 4v11 M7.5 11l4.5 4.5 4.5-4.5 M5 20h14",
  upload: "M12 16V4.5 M7.5 9 12 4.5 16.5 9 M5 20h14",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3A4 4 0 0 0 13 5.3l-1 1 M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  message: "M4.5 5.5h15a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H9l-4.5 3.5V6.5a1 1 0 0 1 1-1z",
  flag: "M5.5 21V4 M5.5 4.5h11.5l-2.2 4 2.2 4H5.5",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M12 7.5V12l3 2",
  print: "M7 9V3.5h10V9 M7 17H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2 M7 14h10v6.5H7z",
  list: "M9 6h11 M9 12h11 M9 18h11 M4.5 6h.01 M4.5 12h.01 M4.5 18h.01",
  sun: "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M12 2.5v2 M12 19.5v2 M4.6 4.6l1.4 1.4 M18 18l1.4 1.4 M2.5 12h2 M19.5 12h2 M4.6 19.4 6 18 M18 6l1.4-1.4",
  moon: "M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z",
  gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z",
  paperclip: "M20 11.5l-8.2 8.2a5 5 0 0 1-7.1-7.1l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7l-8.5 8.5a1.7 1.7 0 0 1-2.4-2.4l7.8-7.8",
  camera: "M3.5 8.5a2 2 0 0 1 2-2h2l1.5-2h6l1.5 2h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z M12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z",
  warning: "M10.3 4.2 2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0z M12 9.5v4 M12 17h.01",
  thumbsUp: "M7 10.5v10 M7 10.5l4-7.5a2 2 0 0 1 3 1.9l-.6 3.6H19a2 2 0 0 1 2 2.3l-1.2 7a2 2 0 0 1-2 1.7H7 M7 20.5H4.5a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1H7",
  thumbsDown: "M17 13.5v-10 M17 13.5l-4 7.5a2 2 0 0 1-3-1.9l.6-3.6H5a2 2 0 0 1-2-2.3l1.2-7a2 2 0 0 1 2-1.7H17 M17 3.5h2.5a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H17",
  hammer: "M14.5 5.5 18.5 9.5 M13 7l-9.2 9.2a1.8 1.8 0 0 0 2.5 2.5L15.5 9.5 M11.5 3.5l3-1 6 6-1 3z",
  truck: "M2.5 6.5h11v9h-11z M13.5 9.5h4l3 3v3h-7 M6 18.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z M17 18.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z",
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, className, strokeWidth = 1.8 }: { name: IconName; className?: string; strokeWidth?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={cn("h-5 w-5 shrink-0", className)}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

export function Surface({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mo-surface", className)} {...props} />;
}

// iOS segmented control: a gray track with a raised white thumb.
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  full = false,
  size = "md",
  ariaLabel,
  tone = "green",
}: {
  options: { value: T; label: ReactNode }[];
  value: T | null;
  onChange: (v: T) => void;
  full?: boolean;
  size?: "sm" | "md";
  ariaLabel?: string;
  tone?: "green" | "violet";
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className={cn("rounded-[10px] bg-[var(--mo-fill)] p-[2px]", full ? "flex w-full" : "inline-flex")}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cn(
              "rounded-[8px] font-medium transition-all duration-200",
              full ? "min-w-0 flex-1 truncate" : "whitespace-nowrap",
              size === "sm" ? "px-2 py-[5px] text-[12px]" : "px-3.5 py-1.5 text-[13px]",
              on
                ? cn(
                    "bg-[var(--mo-card)] shadow-[0_1px_3px_rgba(0,0,0,0.12),0_1px_1px_rgba(0,0,0,0.04)]",
                    tone === "violet" ? "text-violet-700" : "text-black"
                  )
                : "text-[var(--anchor-gray)] hover:text-black"
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// A capsule quantity stepper.
export function Stepper({
  value,
  onChange,
  label,
  max = 100000,
  min = 0,
}: {
  value: number;
  onChange: (n: number) => void;
  label: string;
  max?: number;
  min?: number;
}) {
  return (
    <div className="inline-flex h-8 items-center rounded-full bg-[var(--mo-fill)]">
      <button
        type="button"
        aria-label={`One fewer ${label}`}
        onClick={() => onChange(value - 1)}
        disabled={value <= min}
        className="flex h-8 w-8 items-center justify-center rounded-full text-black transition hover:bg-black/5 disabled:opacity-30"
      >
        <Icon name="minus" className="h-4 w-4" strokeWidth={2.2} />
      </button>
      <input
        type="number"
        min={min}
        max={max}
        inputMode="numeric"
        value={value}
        aria-label={`How many ${label}`}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-8 w-9 min-w-0 bg-transparent text-center text-[14px] font-semibold tabular-nums text-black outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
      />
      <button
        type="button"
        aria-label={`One more ${label}`}
        onClick={() => onChange(value + 1)}
        disabled={value >= max}
        className="flex h-8 w-8 items-center justify-center rounded-full text-black transition hover:bg-black/5 disabled:opacity-30"
      >
        <Icon name="plus" className="h-4 w-4" strokeWidth={2.2} />
      </button>
    </div>
  );
}

type PillProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "filled" | "tinted" | "gray" | "violet" | "plain";
  size?: "sm" | "md" | "lg";
};

export function Pill({ variant = "filled", size = "md", className, type, ...props }: PillProps) {
  return (
    <button
      type={type ?? "button"}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-full font-semibold transition active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40",
        size === "sm" && "h-8 px-3.5 text-[13px]",
        size === "md" && "h-10 px-5 text-[15px]",
        size === "lg" && "h-12 px-6 text-[16px]",
        variant === "filled" && "bg-[var(--anchor-green)] text-white hover:brightness-110",
        variant === "violet" && "bg-violet-600 text-white hover:brightness-110",
        variant === "tinted" && "bg-[var(--anchor-green)]/12 text-[var(--anchor-green)] hover:bg-[var(--anchor-green)]/18",
        variant === "gray" && "bg-[var(--mo-fill)] text-black hover:bg-[var(--mo-fill-strong)]",
        variant === "plain" && "text-[var(--anchor-green)] hover:opacity-70",
        className
      )}
      {...props}
    />
  );
}

// Section heading inside a surface: Apple's semibold title over gray subtext.
export function SectionTitle({ title, hint, right }: { title: ReactNode; hint?: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-[19px] font-semibold leading-tight tracking-[-0.02em] text-black">{title}</h2>
        {hint && <p className="mt-1 text-[13px] leading-snug text-[var(--anchor-gray)]">{hint}</p>}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}
