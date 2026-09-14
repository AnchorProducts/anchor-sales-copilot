"use client";

import { useState } from "react";
import { FilterChip, PhotoTile } from "@/app/components/showcase/ShowcaseBadges";
import {
  formatDay,
  photoCounts,
  type PhotoStatus,
  type ScheduleStop,
} from "@/lib/showcase/client";

/* ============================================================================
 * Every photo on the schedule, grouped by stop, most recent stop first.
 *
 * The keeper's answer to "what do we have, and what's still waiting?" without
 * opening stops one by one. Tapping a photo or a stop's heading opens the stop,
 * which is where photos are added and removed.
 * ==========================================================================*/

type Filter = "all" | PhotoStatus;

export default function PhotoGallery({
  stops,
  onOpen,
}: {
  stops: ScheduleStop[];
  onOpen: (id: string) => void;
}) {
  const [filter, setFilter] = useState<Filter>("all");

  const all = stops.flatMap((s) => s.photos);
  if (!all.length) {
    return (
      <p className="text-sm text-[var(--anchor-gray)]">
        No photos yet. Open a stop to add some.
      </p>
    );
  }

  const counts = photoCounts(all);
  const chips: { key: Filter; label: string; count: number }[] = [
    { key: "all", label: "All", count: all.length },
    { key: "published", label: "Live", count: counts.live },
    { key: "pending", label: "In review", count: counts.pending },
    { key: "declined", label: "Declined", count: counts.declined },
  ];

  const groups = [...stops]
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
    .map((stop) => ({
      stop,
      photos: stop.photos.filter((p) => filter === "all" || p.status === filter),
    }))
    .filter((g) => g.photos.length);

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {chips
          .filter((c) => c.key === "all" || c.count > 0)
          .map((c) => (
            <FilterChip key={c.key} active={filter === c.key} onClick={() => setFilter(c.key)}>
              {c.label} · {c.count}
            </FilterChip>
          ))}
      </div>

      {groups.map(({ stop, photos }) => (
        <div key={stop.id} className="mt-4">
          <button
            type="button"
            onClick={() => onOpen(stop.id)}
            className="flex w-full items-baseline justify-between gap-3 text-left"
          >
            <span className="min-w-0 truncate text-sm font-semibold text-[var(--anchor-deep)]">
              {stop.city} <span className="font-normal text-[var(--anchor-gray)]">· {stop.event}</span>
            </span>
            <span className="shrink-0 text-xs text-[var(--anchor-gray)]">{formatDay(stop.date)} ›</span>
          </button>
          <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {photos.map((photo) => (
              <PhotoTile key={photo.id} photo={photo} onClick={() => onOpen(stop.id)} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
