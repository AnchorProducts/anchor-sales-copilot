"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { SITE_LIVE_KEY } from "@/lib/flags/siteLive";

/* ============================================================================
 * Client-side read of the "Site live" flag.
 *
 * admin_tools is readable by any authenticated user (migration 000033), so this
 * is a direct query — no extra API hop. Starts false and stays false until a
 * row explicitly says otherwise, so a surface never flashes into view while the
 * flag is still loading.
 * ==========================================================================*/
export function useSiteLive(): { live: boolean; ready: boolean } {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [live, setLive] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await supabase
          .from("admin_tools")
          .select("active")
          .eq("key", SITE_LIVE_KEY)
          .maybeSingle();
        if (!alive) return;
        setLive((data as { active?: boolean } | null)?.active === true);
      } catch {
        /* stay dark */
      } finally {
        if (alive) setReady(true);
      }
    })();
    return () => { alive = false; };
  }, [supabase]);

  return { live, ready };
}
