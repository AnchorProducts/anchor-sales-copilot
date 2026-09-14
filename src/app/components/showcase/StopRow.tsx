import { Badge, ReviewNote, StatusBadge } from "@/app/components/showcase/ShowcaseBadges";
import {
  coverUrl,
  formatDay,
  needsPhotos,
  photoSummary,
  type ScheduleStop,
} from "@/lib/showcase/client";

/* One stop on the keeper's landing page: its picture (or its date, when it has
 * none yet), what it is, and where it stands. The whole row opens the stop. */

export function StopList({
  stops,
  day,
  onOpen,
  empty,
}: {
  stops: ScheduleStop[];
  day: string;
  onOpen: (id: string) => void;
  empty?: string;
}) {
  if (!stops.length) {
    return empty ? <p className="text-sm text-[var(--anchor-gray)]">{empty}</p> : null;
  }
  return (
    <ul className="grid gap-2">
      {stops.map((stop) => (
        <li key={stop.id}>
          <StopRow stop={stop} day={day} onOpen={onOpen} />
        </li>
      ))}
    </ul>
  );
}

function StopRow({
  stop,
  day,
  onOpen,
}: {
  stop: ScheduleStop;
  day: string;
  onOpen: (id: string) => void;
}) {
  const cover = coverUrl(stop.photos);
  return (
    <button
      type="button"
      onClick={() => onOpen(stop.id)}
      className="flex w-full items-start gap-3 rounded-xl border border-black/10 p-3 text-left transition hover:bg-[var(--surface-soft)]"
    >
      <span className="block h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-[var(--surface-strong)]">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <DateFace ymd={stop.date} />
        )}
      </span>

      <span className="block min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="text-sm font-semibold text-[var(--anchor-deep)]">{stop.city}</span>
          <StatusBadge status={stop.status} />
          {stop.requested && <Badge tone="gray">Requested</Badge>}
          {needsPhotos(stop, day) && <Badge tone="amber">Needs photos</Badge>}
        </span>
        <span className="mt-0.5 block text-sm text-[var(--anchor-gray)]">
          {stop.event} · {formatDay(stop.date)}
        </span>
        <span className="mt-0.5 block text-xs text-[var(--anchor-gray)]">
          {photoSummary(stop.photos)}
          {stop.mine ? " · Filed by you" : ""}
        </span>
        {stop.status === "declined" && stop.reviewNote && <ReviewNote note={stop.reviewNote} />}
      </span>

      <span aria-hidden className="self-center text-lg text-[var(--anchor-gray)]">
        ›
      </span>
    </button>
  );
}

/** A calendar-leaf stand-in for a stop with no picture yet. */
function DateFace({ ymd }: { ymd: string }) {
  const [y, m, d] = ymd.split("-").map(Number);
  const month = y && m ? new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "short" }) : "";
  return (
    <span className="flex h-full w-full flex-col items-center justify-center leading-none text-[var(--anchor-deep)]">
      <span className="text-[10px] font-bold uppercase tracking-wide text-[var(--anchor-gray)]">
        {month}
      </span>
      <span className="mt-1 text-lg font-bold">{d || ""}</span>
    </span>
  );
}
