import type { ReactNode } from "react";
import type { PhotoStatus, StopPhoto, StopStatus } from "@/lib/showcase/client";

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

export function PhotoStatusBadge({ status }: { status: PhotoStatus }) {
  if (status === "published") return <Badge tone="green">Live</Badge>;
  if (status === "declined") return <Badge tone="red">Declined</Badge>;
  return <Badge tone="amber">In review</Badge>;
}

/** A square photo with its review status on it. A button when `onClick` is given. */
export function PhotoTile({ photo, onClick }: { photo: StopPhoto; onClick?: () => void }) {
  const body = (
    <span className="relative block aspect-square overflow-hidden rounded-lg bg-[var(--surface-strong)]">
      {photo.url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={photo.url} alt="" loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center px-1 text-center text-[10px] text-[var(--anchor-gray)]">
          No preview
        </span>
      )}
      <span className="absolute bottom-1 left-1">
        <PhotoStatusBadge status={photo.status} />
      </span>
    </span>
  );
  if (!onClick) return body;
  return (
    <button type="button" onClick={onClick} className="block w-full text-left">
      {body}
    </button>
  );
}

export function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
        active
          ? "border-[var(--anchor-deep)] bg-[var(--anchor-deep)] text-white"
          : "border-black/15 text-[var(--anchor-deep)] hover:bg-[var(--surface-soft)]"
      }`}
    >
      {children}
    </button>
  );
}

/* Shown in full, never behind a tap — the reason is the only way the person
 * learns what to fix. */
export function ReviewNote({ note, label = "Marketing said" }: { note: string; label?: string }) {
  return (
    <span className="mt-2 block rounded-lg bg-[var(--surface-strong)] p-2 text-sm text-[var(--anchor-deep)]">
      <span className="font-semibold">{label}: </span>
      {note}
    </span>
  );
}
