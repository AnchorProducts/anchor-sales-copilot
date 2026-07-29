import "server-only";
import { cache } from "react";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { SITE_LIVE_KEY } from "@/lib/flags/siteLive";

/* ============================================================================
 * Server-side read of the "Site live" flag.
 *
 * Fails CLOSED: a missing row, a missing table, or a read error all mean the
 * feature set stays dark. Cached per request so several guards in one request
 * cost a single round trip.
 * ==========================================================================*/
export const isSiteLive = cache(async function isSiteLive(): Promise<boolean> {
  try {
    const { data, error } = await supabaseAdmin
      .from("admin_tools")
      .select("active")
      .eq("key", SITE_LIVE_KEY)
      .maybeSingle();
    if (error) return false;
    return (data as { active?: boolean } | null)?.active === true;
  } catch {
    return false;
  }
});
