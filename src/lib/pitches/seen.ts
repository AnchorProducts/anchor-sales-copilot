"use client";

import { useEffect, useState } from "react";

/* ============================================================================
 * "New activity on my pitches" badge (§5.3).
 *
 * Deliberately client-local: the badge only needs to answer "has anything
 * happened since I last looked at this page?", and the spec adds no read-receipt
 * table. We store the timestamp of the newest thing the user has seen in
 * localStorage and compare it to the newest decision / info_request on the
 * server. No schema, no extra writes.
 * ==========================================================================*/

const KEY = "anchor.pitches.seenAt";

/** Kinds that are worth interrupting the submitter for. */
const NOTABLE = new Set(["decision", "info_request"]);

type MinimalPitch = { id: string; reviewed_at?: string | null };
type MinimalComment = { kind: string; created_at: string };

/** The newest moment worth badging across a user's pitches. */
export function newestActivityAt(
  pitches: MinimalPitch[],
  threads: Record<string, MinimalComment[]>
): string | null {
  let newest = 0;
  const consider = (iso: string | null | undefined) => {
    if (!iso) return;
    const t = Date.parse(iso);
    if (!Number.isNaN(t) && t > newest) newest = t;
  };

  for (const p of pitches) {
    consider(p.reviewed_at);
    for (const c of threads[p.id] ?? []) {
      if (NOTABLE.has(c.kind)) consider(c.created_at);
    }
  }
  return newest ? new Date(newest).toISOString() : null;
}

export function markPitchesSeen(iso: string) {
  try {
    const prev = window.localStorage.getItem(KEY);
    // Never move the marker backwards.
    if (prev && Date.parse(prev) >= Date.parse(iso)) return;
    window.localStorage.setItem(KEY, iso);
    window.dispatchEvent(new Event("anchor:pitches-seen"));
  } catch {
    /* storage unavailable (private mode) — the badge just stays on */
  }
}

function readSeen(): number {
  try {
    const raw = window.localStorage.getItem(KEY);
    const t = raw ? Date.parse(raw) : 0;
    return Number.isNaN(t) ? 0 : t;
  } catch {
    return 0;
  }
}

/** True when marketing has decided or asked something the user hasn't seen.
 *  Polls lightly, like the marketing-order unread badge. Pass `enabled=false`
 *  (e.g. while the "Site live" flag is off) to skip polling entirely. */
export function usePitchBadge(enabled = true, pollMs = 60000): boolean {
  const [hasNew, setHasNew] = useState(false);

  useEffect(() => {
    if (!enabled) { setHasNew(false); return; }
    let alive = true;

    async function check() {
      try {
        const res = await fetch("/api/pitches", { cache: "no-store", credentials: "include" });
        if (!res.ok || !alive) return;
        const json = await res.json().catch(() => null);
        const newest = newestActivityAt(
          (json?.pitches ?? []) as MinimalPitch[],
          (json?.threads ?? {}) as Record<string, MinimalComment[]>
        );
        if (!alive) return;
        setHasNew(Boolean(newest) && Date.parse(newest!) > readSeen());
      } catch {
        /* best-effort */
      }
    }

    void check();
    const timer = setInterval(check, pollMs);
    const onSeen = () => setHasNew(false);
    window.addEventListener("anchor:pitches-seen", onSeen);
    return () => {
      alive = false;
      clearInterval(timer);
      window.removeEventListener("anchor:pitches-seen", onSeen);
    };
  }, [enabled, pollMs]);

  return hasNew;
}
