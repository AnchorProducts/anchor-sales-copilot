"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Button from "@/app/components/ui/Button";
import { Card } from "@/app/components/ui/Card";
import { Alert } from "@/app/components/ui/Alert";
import { ReviewNote, StatusBadge } from "@/app/components/showcase/ShowcaseBadges";
import { supabaseBrowser } from "@/lib/supabase/browser";
import {
  formatDay,
  showcaseFetch,
  useRefetchOnFocus,
  type Submission,
} from "@/lib/showcase/client";

/* ============================================================================
 * What I've filed, and what came of it.
 *
 * Read-only on purpose, for everyone: a filed stop can't be edited or removed
 * from here. If it's wrong, file it again and marketing declines the old one.
 *
 * Known gap (website side): when marketing declines only the PHOTO on a stop
 * that's already live, the stop still reads "On the site" here. Only the
 * keeper's Schedule shows the photo back to missing, with the reason.
 * ==========================================================================*/

export default function MySubmissions({
  active,
  refreshKey,
  flash,
}: {
  active: boolean;
  refreshKey: number;
  flash: string | null;
}) {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [submissions, setSubmissions] = useState<Submission[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchList = useCallback(
    () => showcaseFetch<{ submissions?: Submission[] }>(supabase, "/api/showcase/submit"),
    [supabase]
  );

  const apply = useCallback((result: Awaited<ReturnType<typeof fetchList>>) => {
    if (!result.ok) {
      setError(result.error); // the last good list stays on screen under the error
      return;
    }
    setError(null);
    setSubmissions(Array.isArray(result.data.submissions) ? result.data.submissions : []);
  }, []);

  const load = useCallback(async () => {
    setRefreshing(true);
    apply(await fetchList());
    setRefreshing(false);
  }, [apply, fetchList]);

  // On opening the tab, and again after each filing (refreshKey). State is set
  // when the request settles, never synchronously inside the effect.
  useEffect(() => {
    if (!active) return;
    let alive = true;
    void fetchList().then((result) => {
      if (alive) apply(result);
    });
    return () => {
      alive = false;
    };
  }, [active, refreshKey, fetchList, apply]);

  useRefetchOnFocus(
    useCallback(() => {
      if (active) void load();
    }, [active, load])
  );

  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm font-semibold text-black">What you&rsquo;ve filed</div>
        <Button
          variant="ghost"
          className="!px-3 !py-1 text-xs"
          onClick={() => void load()}
          disabled={refreshing}
        >
          {refreshing ? "Refreshing…" : "Refresh"}
        </Button>
      </div>

      {flash && <Alert tone="success" className="mt-3">{flash}</Alert>}
      {error && <Alert tone="error" className="mt-3">{error}</Alert>}

      {submissions === null ? (
        !error && <div className="mt-3 text-sm text-[var(--anchor-gray)]">Loading…</div>
      ) : submissions.length === 0 ? (
        <div className="mt-3 text-sm text-[var(--anchor-gray)]">
          Nothing yet. Stops you file show up here with their status.
        </div>
      ) : (
        <ul className="mt-3 grid gap-2">
          {submissions.map((s) => (
            <li key={s.id} className="rounded-xl border border-black/10 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-[var(--anchor-deep)]">{s.city}</span>
                <StatusBadge status={s.status} />
              </div>
              <div className="mt-0.5 text-sm text-[var(--anchor-gray)]">
                {s.event} · {formatDay(s.date)}
              </div>
              {s.note && <div className="mt-1 text-sm text-[var(--anchor-gray)]">{s.note}</div>}
              {s.status === "declined" && s.reviewNote && <ReviewNote note={s.reviewNote} />}
            </li>
          ))}
        </ul>
      )}

      <p className="mt-4 text-xs text-[var(--anchor-gray)]">
        You can&rsquo;t change a stop after filing it. If something&rsquo;s wrong, file it again and
        marketing will decline the old one.
      </p>
    </Card>
  );
}
