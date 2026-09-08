"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

/* ============================================================================
 * The signed-in user's per-tool grants.
 *
 * tool_user_access lets a user read their own rows (migration 20260908_000001),
 * so this is a direct query rather than an API hop — the dashboard already
 * reads admin_tools the same way. Starts empty and stays empty until a row says
 * otherwise, so a restricted tile never flashes into view while loading.
 *
 * Advisory only. The page and the API routes re-check server-side.
 * ==========================================================================*/
export function useToolAccess(): { grants: Set<string>; ready: boolean } {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [grants, setGrants] = useState<Set<string>>(() => new Set());
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data } = await supabase.from("tool_user_access").select("tool_key");
        if (!alive) return;
        setGrants(new Set(((data || []) as { tool_key: string }[]).map((r) => r.tool_key)));
      } catch {
        /* stay closed — the tile simply doesn't appear */
      } finally {
        if (alive) setReady(true);
      }
    })();
    return () => { alive = false; };
  }, [supabase]);

  return { grants, ready };
}
