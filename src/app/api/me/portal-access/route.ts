import { NextResponse } from "next/server";
import { getPortalAccess, isAdminRole, isMarketingAllowed, isInternalDeploy } from "@/lib/portalAccess";
import { isSiteLive } from "@/lib/flags/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================================
 * GET /api/me/portal-access — the signed-in user's portal level + team.
 *
 * Lets client surfaces (dashboard tiles, nav) decide what to show without
 * re-deriving the role model in the browser. Purely advisory: every protected
 * route re-checks server-side, so tampering with the response buys nothing.
 * ==========================================================================*/
export async function GET() {
  const access = await getPortalAccess();
  if (!access) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // While the feature set is dark, report no portal capabilities at all — the
  // tiles this drives must not appear for anyone.
  const live = await isSiteLive();

  // Mirrors requireMarketingUser(): the shared invite row must agree, because
  // the mkt_* tables are gated on is_marketing() in the database.
  const marketing =
    live && access.fromInvite && isMarketingAllowed(access.level, access.team) && isInternalDeploy();

  return NextResponse.json({
    level: access.level,
    team: access.team,
    appRole: access.appRole,
    isAdmin: live && isAdminRole(access.level),
    marketing,
    siteLive: live,
  });
}
