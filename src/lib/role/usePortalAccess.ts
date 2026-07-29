"use client";

import { useEffect, useState } from "react";

/* ============================================================================
 * The signed-in user's portal level + team, for client surfaces that need to
 * decide what to render (dashboard tiles, nav entries).
 *
 * Advisory only — every protected page and route re-checks server-side.
 * ==========================================================================*/

export type PortalAccessInfo = {
  level: string | null;
  team: string | null;
  appRole: string | null;
  isAdmin: boolean;
  /** May use the Marketing Hub (and the database agrees). */
  marketing: boolean;
};

const EMPTY: PortalAccessInfo = {
  level: null,
  team: null,
  appRole: null,
  isAdmin: false,
  marketing: false,
};

export function usePortalAccess(): { access: PortalAccessInfo; ready: boolean } {
  const [access, setAccess] = useState<PortalAccessInfo>(EMPTY);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/me/portal-access", { cache: "no-store", credentials: "include" });
        if (!alive) return;
        if (res.ok) {
          const json = (await res.json().catch(() => null)) as PortalAccessInfo | null;
          if (alive && json) setAccess({ ...EMPTY, ...json });
        }
      } catch {
        /* stay closed — tiles simply don't appear */
      } finally {
        if (alive) setReady(true);
      }
    })();
    return () => { alive = false; };
  }, []);

  return { access, ready };
}
