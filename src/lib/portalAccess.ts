import "server-only";
import { cache } from "react";
import { supabaseRoute } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isSiteLive } from "@/lib/flags/server";
import {
  isAdminRole,
  isMarketingAllowed,
  isRoleAllowed,
  type PortalLevel,
  type PortalTeam,
} from "@/lib/portalRoles";

export { isAdminRole, isMarketingAllowed, isRoleAllowed };

/* ============================================================================
 * Portal access — server side. The bridge between THIS app's role model and the
 * portal's level+team model, over the shared Supabase project.
 *
 * The two surfaces do not share a user population:
 *   - The portal authorizes from `portal_invites` (an admin-managed
 *     authorized-emails allow-list): level 'admin' | 'internal', plus a team.
 *   - This app authorizes logins from `profiles.role`: 'admin' | 'anchor_rep' |
 *     'external_rep'. External reps have no portal representation at all.
 *
 * So the portal level/team is resolved as an OVERLAY, never as a replacement:
 *   1. Look for a `portal_invites` row matching the signed-in email
 *      (case-insensitive). If present, it wins — this is the same row the
 *      portal's own admin manages, so edits in either surface apply to both.
 *   2. Otherwise fall back to the app's own role, so no existing app user loses
 *      access just because they were never added to the portal's list:
 *        admin        → level 'admin'
 *        anchor_rep   → level 'internal'
 *        external_rep → no portal level (external reps are not portal users)
 *
 * Everything fails CLOSED: no session, or no resolvable level, means no access.
 * ==========================================================================*/

/** How an app role maps onto a portal level when there is no invite row. */
function levelFromAppRole(appRole: string | null): PortalLevel | null {
  switch (appRole) {
    case "admin":
      return "admin";
    case "anchor_rep":
      return "internal";
    default:
      // external_rep (and anything unrecognized) is not a portal user.
      return null;
  }
}

export type PortalAccess = {
  userId: string;
  email: string | null;
  /** Portal access level from portal_invites.role, or derived from profiles.role. */
  level: PortalLevel | null;
  /** Portal team from portal_invites.team. Null unless explicitly assigned. */
  team: PortalTeam | null;
  /** This app's own role: 'admin' | 'anchor_rep' | 'external_rep'. */
  appRole: string | null;
  /** True when the level/team came from a portal_invites row rather than the fallback. */
  fromInvite: boolean;
};

/** Verified session + resolved portal level/team, or null if not signed in.
 *  Does NOT enforce the allow-list — callers do that with isRoleAllowed() /
 *  isMarketingAllowed() so they can tell "not logged in" from "no access".
 *  Cached per request so repeated guards cost one round trip. */
export const getPortalAccess = cache(async function getPortalAccess(): Promise<PortalAccess | null> {
  const supabase = await supabaseRoute();
  const { data: auth, error } = await supabase.auth.getUser();
  if (error || !auth?.user) return null;

  const user = auth.user;
  const email = user.email?.toLowerCase() ?? null;

  // The app's own role, and the shared invite row, in parallel. Both use the
  // service role: portal_invites is service-role-only for writes and the app
  // has no self-read policy on it, and profiles is read here for the fallback.
  const [profileRes, inviteRes] = await Promise.all([
    supabaseAdmin.from("profiles").select("role").eq("id", user.id).maybeSingle(),
    // Matched on the lowercased email, the same way the portal writes and reads
    // it. (Not ilike — `_` is a LIKE wildcard and is legal in an address.)
    email
      ? supabaseAdmin.from("portal_invites").select("role, team").eq("email", email).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const appRole = String((profileRes.data as { role?: string } | null)?.role || "") || null;
  const invite = (inviteRes as { data: { role?: string; team?: string } | null }).data;

  const inviteLevel = (invite?.role?.toLowerCase() as PortalLevel | undefined) ?? null;
  const fromInvite = isRoleAllowed(inviteLevel);

  return {
    userId: user.id,
    email,
    level: fromInvite ? inviteLevel : levelFromAppRole(appRole),
    team: fromInvite ? ((invite?.team?.toLowerCase() as PortalTeam | undefined) ?? null) : null,
    appRole,
    fromInvite,
  };
});

/** True on the internal deploy. This repo ships twice (internal app + external
 *  sales copilot); portal-parity surfaces exist only on the internal one. */
export function isInternalDeploy(): boolean {
  return process.env.NEXT_PUBLIC_APP_MODE === "internal";
}

/** Any authorized internal user (admin or internal level). Null if not.
 *
 *  Like the other two guards below, this also fails closed while the "Site
 *  live" flag is off. Every surface built for the portal reconciliation goes
 *  through one of these three, so the kill switch is enforced here rather than
 *  repeated in each route — a new route cannot forget it. */
export async function requireInternalUser(): Promise<PortalAccess | null> {
  if (!(await isSiteLive())) return null;
  const access = await getPortalAccess();
  if (!access || !isRoleAllowed(access.level)) return null;
  return access;
}

/** Marketing Hub: admin level OR the marketing team. Null if not.
 *
 *  Deliberately stricter than the other guards: the level/team must come from a
 *  real portal_invites row, not the profiles.role fallback. The shared mkt_*
 *  tables are read through RLS gated on public.is_marketing(), which is defined
 *  as portal_role() = 'admin' OR portal_team() = 'marketing' — both read from
 *  portal_invites. So requiring `fromInvite` here makes this guard exactly
 *  equivalent to what the database will allow, and an app admin who was never
 *  added to the shared list gets a closed door instead of an empty board.
 *  (The fix is self-serve: add yourself in Admin → Portal Access.)
 *
 *  Also fails closed on the external deploy, which must never render the hub. */
export async function requireMarketingUser(): Promise<PortalAccess | null> {
  return (await marketingAccessDenial()) === null ? await getPortalAccess() : null;
}

/** Why the Marketing Hub is closed, or null when it's open.
 *
 *  requireMarketingUser() collapses four very different causes into one null,
 *  which made "you're not on the list" the only message a caller could show —
 *  actively misleading for an admin who IS on the list but is hitting the
 *  external build. Routes surface this as a `reason` so the UI can say which. */
export type MarketingDenial =
  | "not_live"
  | "not_signed_in"
  | "not_internal_deploy"
  | "not_marketing";

export async function marketingAccessDenial(): Promise<MarketingDenial | null> {
  if (!(await isSiteLive())) return "not_live";
  const access = await getPortalAccess();
  if (!access) return "not_signed_in";
  // Checked before the list check: on the external build nobody qualifies, and
  // reporting "not on the list" there would send people to fix the wrong thing.
  if (!isInternalDeploy()) return "not_internal_deploy";
  if (!access.fromInvite) return "not_marketing";
  if (!isMarketingAllowed(access.level, access.team)) return "not_marketing";
  return null;
}

/** Admin only — the authorized-users manager and library maintenance. */
export async function requireAdminUser(): Promise<PortalAccess | null> {
  if (!(await isSiteLive())) return null;
  const access = await getPortalAccess();
  if (!access || !isAdminRole(access.level)) return null;
  return access;
}
