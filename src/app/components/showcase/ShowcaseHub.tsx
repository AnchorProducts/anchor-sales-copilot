"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Button from "@/app/components/ui/Button";
import { Card } from "@/app/components/ui/Card";
import { Alert } from "@/app/components/ui/Alert";
import ShowcaseSubmitForm from "@/app/components/showcase/ShowcaseSubmitForm";
import MySubmissions from "@/app/components/showcase/MySubmissions";
import PhotoGallery from "@/app/components/showcase/PhotoGallery";
import StopEditor, { type Flash } from "@/app/components/showcase/StopEditor";
import { StopList } from "@/app/components/showcase/StopRow";
import { supabaseBrowser } from "@/lib/supabase/browser";
import {
  NO_ACCESS,
  needsPhotos,
  showcaseFetch,
  today,
  useRefetchOnFocus,
  type ScheduleStop,
  type Submission,
} from "@/lib/showcase/client";

/* ============================================================================
 * The mobile showcase, on one page.
 *
 * A landing page rather than tabs: the person driving the van opens it and sees
 * what's coming up, what's waiting on marketing, what still needs photos, and
 * every photo so far — and gets to any stop in one tap.
 *
 * WHO SEES WHAT is the website's call. Keepers (the Showcase flag, an admin, or
 * the marketing team) get the whole schedule; everyone else gets their own
 * stops. That rule lives on the website, and copying it here would drift, so
 * the page asks: load the schedule, and a 200 means keeper, a 403 means not.
 *
 * Adding always goes through marketing's review, keepers included. There's no
 * publish button anywhere in the App.
 * ==========================================================================*/

type View = { kind: "home" } | { kind: "add" } | { kind: "stop"; id: string };

type HubData = {
  access: "keeper" | "submitter" | "unknown" | "noaccess";
  stops: ScheduleStop[] | null;
  submissions: Submission[] | null;
  error: string | null;
};

type Stat = { label: string; value: number; target: string };

/** Past stops listed before "Show all". */
const PAST_SHOWN = 8;

/** Lists from the website, with `photos` always an array. */
function listOf<T>(value: unknown): T[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => ({
    ...item,
    photos: Array.isArray(item?.photos) ? item.photos : [],
  })) as T[];
}

export default function ShowcaseHub() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [data, setData] = useState<HubData | null>(null);
  const [view, setView] = useState<View>({ kind: "home" });
  const [flash, setFlash] = useState<Flash | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchHub = useCallback(async (): Promise<HubData> => {
    const schedule = await showcaseFetch<{ stops?: unknown }>(supabase, "/api/showcase/stops");
    if (schedule.ok) {
      return { access: "keeper", stops: listOf(schedule.data.stops), submissions: null, error: null };
    }
    if (schedule.status === 401) {
      return { access: "noaccess", stops: null, submissions: null, error: schedule.error };
    }

    const access = schedule.status === 403 ? "submitter" : "unknown";
    const mine = await showcaseFetch<{ submissions?: unknown }>(supabase, "/api/showcase/submit");
    if (mine.ok) {
      return { access, stops: null, submissions: listOf(mine.data.submissions), error: null };
    }
    return {
      access: mine.status === 401 ? "noaccess" : access,
      stops: null,
      submissions: null,
      error: mine.error,
    };
  }, [supabase]);

  // A failed reload (offline, a blip) keeps what's on screen and says so,
  // rather than wiping a keeper's schedule down to nothing.
  const apply = useCallback((next: HubData) => {
    setData((prev) =>
      next.access === "unknown" && prev && prev.access !== "noaccess"
        ? { ...prev, error: next.error }
        : next
    );
  }, []);

  useEffect(() => {
    let alive = true;
    void fetchHub().then((next) => {
      if (alive) apply(next);
    });
    return () => {
      alive = false;
    };
  }, [fetchHub, apply]);

  const reload = useCallback(async () => {
    setRefreshing(true);
    apply(await fetchHub());
    setRefreshing(false);
  }, [apply, fetchHub]);

  // Marketing's decisions don't notify anyone; coming back to the app is how
  // people find out.
  useRefetchOnFocus(
    useCallback(() => {
      void reload();
    }, [reload])
  );

  const go = useCallback((next: View) => {
    setView(next);
    setFlash(null);
    window.scrollTo({ top: 0 });
  }, []);

  const finish = useCallback(
    (result: Flash) => {
      setView({ kind: "home" });
      setFlash(result);
      window.scrollTo({ top: 0 });
      void reload();
    },
    [reload]
  );

  if (!data) return <div className="text-sm text-[var(--anchor-gray)]">Loading…</div>;

  if (data.access === "noaccess") {
    return (
      <Card className="p-5 text-sm text-[var(--anchor-deep)]">
        <div className="font-semibold">You don&rsquo;t have access to the showcase.</div>
        <p className="mt-1 text-[var(--anchor-gray)]">{NO_ACCESS}</p>
        <Button variant="secondary" className="mt-3" onClick={() => void reload()} disabled={refreshing}>
          Try again
        </Button>
      </Card>
    );
  }

  const keeper = data.access === "keeper";
  const stops = data.stops ?? [];
  const openStop = view.kind === "stop" && keeper ? (stops.find((s) => s.id === view.id) ?? null) : null;
  const day = today();

  return (
    <div className="grid gap-4">
      {/* Stays mounted so a half-filled stop survives a trip back to the page. */}
      <div hidden={view.kind !== "add"}>
        <div className="mb-3">
          <Button variant="ghost" className="!px-2" onClick={() => go({ kind: "home" })}>
            ← Back to showcase
          </Button>
        </div>
        <ShowcaseSubmitForm
          onFiled={() => finish({ tone: "success", text: "Sent to marketing for review." })}
          onCancel={() => go({ kind: "home" })}
        />
      </div>

      {openStop ? (
        <StopEditor
          key={openStop.id}
          stop={openStop}
          onBack={() => go({ kind: "home" })}
          onDone={finish}
          onChanged={reload}
        />
      ) : view.kind !== "add" ? (
        <>
          <Hero
            keeper={keeper}
            stats={keeper ? keeperStats(stops, day) : submitterStats(data.submissions ?? [])}
            refreshing={refreshing}
            onRefresh={() => void reload()}
            onAdd={() => go({ kind: "add" })}
          />

          {view.kind === "stop" && (
            <Alert tone="error">That stop is no longer on the schedule.</Alert>
          )}
          {flash && <Alert tone={flash.tone}>{flash.text}</Alert>}
          {data.error && <Alert tone="error">{data.error}</Alert>}

          {keeper ? (
            <KeeperHome stops={stops} day={day} onOpen={(id) => go({ kind: "stop", id })} />
          ) : (
            data.submissions && (
              <Section id="showcase-mine" title="Your stops" count={data.submissions.length}>
                <MySubmissions submissions={data.submissions} />
              </Section>
            )
          )}
        </>
      ) : null}
    </div>
  );
}

function keeperStats(stops: ScheduleStop[], day: string): Stat[] {
  const waiting =
    stops.filter((s) => s.status === "pending").length +
    stops.reduce((n, s) => n + s.photos.filter((p) => p.status === "pending").length, 0);
  return [
    { label: "Coming up", value: stops.filter((s) => s.date >= day).length, target: "showcase-upcoming" },
    { label: "Waiting on marketing", value: waiting, target: "showcase-waiting" },
    { label: "Need photos", value: stops.filter((s) => needsPhotos(s, day)).length, target: "showcase-needs-photos" },
  ];
}

function submitterStats(list: Submission[]): Stat[] {
  const count = (status: Submission["status"]) => list.filter((s) => s.status === status).length;
  return [
    { label: "Pending review", value: count("pending"), target: "showcase-mine" },
    { label: "On the site", value: count("published"), target: "showcase-mine" },
    { label: "Declined", value: count("declined"), target: "showcase-mine" },
  ];
}

function Hero({
  keeper,
  stats,
  refreshing,
  onRefresh,
  onAdd,
}: {
  keeper: boolean;
  stats: Stat[];
  refreshing: boolean;
  onRefresh: () => void;
  onAdd: () => void;
}) {
  return (
    <Card className="border-t-4 border-t-[var(--anchor-green)] p-5 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="ds-caption">Mobile showcase</div>
          <h1 className="mt-1 text-2xl">{keeper ? "Showcase stops" : "Your showcase stops"}</h1>
        </div>
        <Button variant="ghost" className="!px-3 !py-1 text-xs" onClick={onRefresh} disabled={refreshing}>
          {refreshing ? "Refreshing…" : "Refresh"}
        </Button>
      </div>
      <p className="mt-1 text-sm text-[var(--anchor-gray)]">
        {keeper
          ? "The van's whole schedule: add stops, fix details, and add photos. Marketing reviews anything new before it's on anchorp.com."
          : "Add a stop from the road with its photos. Marketing reviews it before it's on anchorp.com."}
      </p>

      <div className="mt-4 grid grid-cols-3 gap-2">
        {stats.map((stat) => (
          <button
            key={stat.label}
            type="button"
            onClick={() =>
              document.getElementById(stat.target)?.scrollIntoView({ behavior: "smooth", block: "start" })
            }
            className="rounded-xl border border-black/10 p-3 text-left transition hover:bg-[var(--surface-soft)]"
          >
            <span className="block text-2xl font-bold leading-none text-[var(--anchor-deep)]">
              {stat.value}
            </span>
            <span className="mt-1 block text-xs leading-snug text-[var(--anchor-gray)]">{stat.label}</span>
          </button>
        ))}
      </div>

      <Button className="mt-4" onClick={onAdd}>
        + Add a stop
      </Button>
    </Card>
  );
}

function KeeperHome({
  stops,
  day,
  onOpen,
}: {
  stops: ScheduleStop[];
  day: string;
  onOpen: (id: string) => void;
}) {
  const [showAllPast, setShowAllPast] = useState(false);

  // The API sends ascending dates: upcoming reads soonest first, past most recent first.
  const upcoming = stops.filter((s) => s.date >= day);
  const past = stops.filter((s) => s.date < day).reverse();
  const needing = past.filter((s) => needsPhotos(s, day));
  const waiting = stops.filter(
    (s) => s.status === "pending" || s.photos.some((p) => p.status === "pending")
  );
  const photoCount = stops.reduce((n, s) => n + s.photos.length, 0);

  return (
    <>
      {needing.length > 0 && (
        <Section
          id="showcase-needs-photos"
          title="Needs photos"
          count={needing.length}
          note="These happened and are on the site, but nothing's been added from the day."
        >
          <StopList stops={needing} day={day} onOpen={onOpen} />
        </Section>
      )}

      <Section id="showcase-upcoming" title="Coming up" count={upcoming.length}>
        <StopList
          stops={upcoming}
          day={day}
          onOpen={onOpen}
          empty="Nothing booked yet. Add a stop to put it in front of marketing."
        />
      </Section>

      {waiting.length > 0 && (
        <Section
          id="showcase-waiting"
          title="Waiting on marketing"
          count={waiting.length}
          note="Pending stops, and stops with photos in review. Nothing here needs you."
        >
          <StopList stops={waiting} day={day} onOpen={onOpen} />
        </Section>
      )}

      <Section id="showcase-photos" title="Photos" count={photoCount}>
        <PhotoGallery stops={stops} onOpen={onOpen} />
      </Section>

      <Section id="showcase-past" title="Past stops" count={past.length}>
        <StopList
          stops={showAllPast ? past : past.slice(0, PAST_SHOWN)}
          day={day}
          onOpen={onOpen}
          empty="No past stops yet."
        />
        {past.length > PAST_SHOWN && (
          <Button
            variant="ghost"
            className="mt-3 !px-3 !py-1 text-xs"
            onClick={() => setShowAllPast((v) => !v)}
          >
            {showAllPast ? "Show fewer" : `Show all ${past.length}`}
          </Button>
        )}
      </Section>
    </>
  );
}

function Section({
  id,
  title,
  count,
  note,
  children,
}: {
  id: string;
  title: string;
  count?: number;
  note?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24">
      <Card className="p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-black">
          {title}
          {count !== undefined && (
            <span className="ml-1.5 font-normal text-[var(--anchor-gray)]">{count}</span>
          )}
        </h2>
        {note && <p className="mt-1 text-xs text-[var(--anchor-gray)]">{note}</p>}
        <div className="mt-3">{children}</div>
      </Card>
    </section>
  );
}
