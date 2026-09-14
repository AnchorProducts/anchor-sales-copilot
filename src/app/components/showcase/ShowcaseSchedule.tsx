"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Button from "@/app/components/ui/Button";
import { Card } from "@/app/components/ui/Card";
import { Alert } from "@/app/components/ui/Alert";
import { Badge, PhotoBadge, ReviewNote, StatusBadge } from "@/app/components/showcase/ShowcaseBadges";
import StopEditor, { type Flash } from "@/app/components/showcase/StopEditor";
import { supabaseBrowser } from "@/lib/supabase/browser";
import {
  formatDay,
  showcaseFetch,
  today,
  useRefetchOnFocus,
  type ScheduleStop,
} from "@/lib/showcase/client";

/* ============================================================================
 * The whole schedule, for keepers — pending and declined stops included, which
 * the public page never shows.
 *
 * There is no "add" here and no publish anywhere: new stops go through File a
 * stop and marketing's review, and publishing happens on the website.
 * ==========================================================================*/

type Filter = "all" | "pending" | "photo";

export default function ShowcaseSchedule({
  active,
  refreshKey,
  onForbidden,
}: {
  active: boolean;
  refreshKey: number;
  onForbidden: () => void;
}) {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [stops, setStops] = useState<ScheduleStop[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [editing, setEditing] = useState<ScheduleStop | null>(null);
  const [flash, setFlash] = useState<Flash | null>(null);

  const fetchStops = useCallback(
    () => showcaseFetch<{ stops?: ScheduleStop[] }>(supabase, "/api/showcase/stops"),
    [supabase]
  );

  const apply = useCallback(
    (result: Awaited<ReturnType<typeof fetchStops>>) => {
      if (!result.ok) {
        if (result.status === 403) return onForbidden();
        setError(result.error);
        return;
      }
      setError(null);
      setStops(Array.isArray(result.data.stops) ? result.data.stops : []);
    },
    [onForbidden]
  );

  const load = useCallback(async () => {
    setRefreshing(true);
    apply(await fetchStops());
    setRefreshing(false);
  }, [apply, fetchStops]);

  // State is set when the request settles, never synchronously inside the effect.
  useEffect(() => {
    if (!active) return;
    let alive = true;
    void fetchStops().then((result) => {
      if (alive) apply(result);
    });
    return () => {
      alive = false;
    };
  }, [active, refreshKey, fetchStops, apply]);

  useRefetchOnFocus(
    useCallback(() => {
      if (active) void load();
    }, [active, load])
  );

  const now = today();
  const needsPhoto = useCallback(
    (s: ScheduleStop) => s.date < now && s.status === "published" && s.photo === "none",
    [now]
  );

  const all = useMemo(() => stops ?? [], [stops]);
  const counts = useMemo(
    () => ({
      pending: all.filter((s) => s.status === "pending").length,
      photo: all.filter(needsPhoto).length,
    }),
    [all, needsPhoto]
  );
  const visible = all.filter((s) =>
    filter === "pending" ? s.status === "pending" : filter === "photo" ? needsPhoto(s) : true
  );
  // The API sends ascending dates: upcoming reads soonest first, past most recent first.
  const upcoming = visible.filter((s) => s.date >= now);
  const past = visible.filter((s) => s.date < now).reverse();

  function open(stop: ScheduleStop) {
    setFlash(null);
    setEditing(stop);
    window.scrollTo({ top: 0 });
  }

  function close(result: Flash | null) {
    setEditing(null);
    setFlash(result);
    if (result) void load();
    window.scrollTo({ top: 0 });
  }

  if (editing) {
    return (
      <StopEditor
        key={editing.id}
        stop={editing}
        onBack={() => close(null)}
        onDone={(result) => close(result)}
      />
    );
  }

  const chips: { key: Filter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "pending", label: `Pending${counts.pending ? ` · ${counts.pending}` : ""}` },
    { key: "photo", label: `Needs a photo${counts.photo ? ` · ${counts.photo}` : ""}` },
  ];

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-black">Schedule</div>
        <Button
          variant="ghost"
          className="!px-3 !py-1 text-xs"
          onClick={() => void load()}
          disabled={refreshing}
        >
          {refreshing ? "Refreshing…" : "Refresh"}
        </Button>
      </div>
      <p className="mt-1 text-sm text-[var(--anchor-gray)]">
        Tap a stop to fix it or add its photo. Publishing happens on anchorp.com.
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        {chips.map((c) => (
          <button
            key={c.key}
            type="button"
            onClick={() => setFilter(c.key)}
            aria-pressed={filter === c.key}
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
              filter === c.key
                ? "border-[var(--anchor-deep)] bg-[var(--anchor-deep)] text-white"
                : "border-black/15 text-[var(--anchor-deep)] hover:bg-[var(--surface-soft)]"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {flash && (
        <Alert tone={flash.tone} className="mt-3">
          {flash.text}
        </Alert>
      )}
      {error && <Alert tone="error" className="mt-3">{error}</Alert>}

      {stops === null ? (
        !error && <div className="mt-3 text-sm text-[var(--anchor-gray)]">Loading…</div>
      ) : visible.length === 0 ? (
        <div className="mt-4 text-sm text-[var(--anchor-gray)]">
          {filter === "all" ? "No stops on the schedule yet." : "Nothing matches that filter."}
        </div>
      ) : (
        <>
          <StopSection title="Upcoming" stops={upcoming} past={false} onOpen={open} />
          <StopSection title="Past" stops={past} past onOpen={open} />
        </>
      )}
    </Card>
  );
}

function StopSection({
  title,
  stops,
  past,
  onOpen,
}: {
  title: string;
  stops: ScheduleStop[];
  past: boolean;
  onOpen: (stop: ScheduleStop) => void;
}) {
  if (stops.length === 0) return null;
  return (
    <section className="mt-5">
      <div className="ds-caption">{title}</div>
      <ul className="mt-2 grid gap-2">
        {stops.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => onOpen(s)}
              className="flex w-full items-start gap-3 rounded-xl border border-black/10 p-3 text-left transition hover:bg-[var(--surface-soft)]"
            >
              {s.photo === "published" && s.photoUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={s.photoUrl}
                  alt=""
                  className="h-14 w-14 shrink-0 rounded-lg object-cover"
                  loading="lazy"
                />
              )}
              <span className="block min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-[var(--anchor-deep)]">{s.city}</span>
                  <StatusBadge status={s.status} />
                  {s.requested && <Badge tone="gray">Requested</Badge>}
                  <PhotoBadge stop={s} past={past} />
                </span>
                <span className="mt-0.5 block text-sm text-[var(--anchor-gray)]">
                  {s.event} · {formatDay(s.date)}
                </span>
                {s.mine && (
                  <span className="mt-0.5 block text-xs text-[var(--anchor-gray)]">Filed by you</span>
                )}
                {s.reviewNote && <ReviewNote note={s.reviewNote} />}
              </span>
              <span aria-hidden className="self-center text-lg text-[var(--anchor-gray)]">
                ›
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
