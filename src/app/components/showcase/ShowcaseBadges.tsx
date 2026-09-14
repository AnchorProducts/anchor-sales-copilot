import type { ReactNode } from "react";
import type { ScheduleStop, StopStatus } from "@/lib/showcase/client";

const TONES = {
  green: "bg-[#e6f4ea] text-[#1e6b3a]",
  red: "bg-[#fdecea] text-[#8a2c22]",
  amber: "bg-[#fdf3e2] text-[#8a6d3b]",
  gray: "bg-[var(--surface-strong)] text-[var(--anchor-deep)]",
};

export function Badge({ tone, children }: { tone: keyof typeof TONES; children: ReactNode }) {
  return (
    <span
      className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: StopStatus }) {
  if (status === "published") return <Badge tone="green">On the site</Badge>;
  if (status === "declined") return <Badge tone="red">Declined</Badge>;
  return <Badge tone="amber">Pending review</Badge>;
}

export function PhotoBadge({ stop, past }: { stop: ScheduleStop; past: boolean }) {
  if (stop.photo === "published") return <Badge tone="green">Photo live</Badge>;
  if (stop.photo === "waiting") return <Badge tone="amber">Photo awaiting review</Badge>;
  // An upcoming stop can't have a photo yet, so "none" only means something once it's happened.
  return past ? <Badge tone="gray">No photo</Badge> : null;
}

/* Shown in full, never behind a tap — the reason is the only way the person
 * learns what to fix. */
export function ReviewNote({ note }: { note: string }) {
  return (
    <span className="mt-2 block rounded-lg bg-[var(--surface-strong)] p-2 text-sm text-[var(--anchor-deep)]">
      <span className="font-semibold">Marketing said: </span>
      {note}
    </span>
  );
}
