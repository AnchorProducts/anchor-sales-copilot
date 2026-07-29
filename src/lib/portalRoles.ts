/* ============================================================================
 * Portal role logic — framework-free.
 *
 * Ported verbatim from the Anchor Internal Portal (anchorp-website
 * src/lib/portalRoles.ts) so a user means the same thing in both surfaces.
 * Pure helpers with NO next/headers or server-only imports, so they are safe to
 * import from anywhere — server components, route handlers, and client code.
 *
 * A user has a LEVEL and an optional TEAM, both stored on their `portal_invites`
 * row (the admin-managed authorized-emails list, shared with the portal):
 *   - level: 'admin' | 'internal'  (stored in the `role` column)
 *   - team:  'marketing' | 'sales' | 'operations' | 'leadership' | null
 * Presence in the list (a non-empty level) is the portal allow-list. Admins can
 * do everything; teams gate team-specific areas (Marketing Hub = marketing).
 *
 * NOTE: this is the PORTAL level, not the app's own role. The app authorizes
 * logins from `profiles.role` (admin | anchor_rep | external_rep) — see
 * src/lib/portalAccess.ts, which resolves the portal level/team as an overlay
 * on top of it.
 * ==========================================================================*/

export const ADMIN_ROLE = "admin";
export const INTERNAL_ROLE = "internal";
export const MARKETING_TEAM = "marketing";

/** Access levels offered in the admin "Authorized Users" manager. */
export const PORTAL_LEVELS = [
  { value: "admin", label: "Admin" },
  { value: "internal", label: "Internal" },
] as const;
export type PortalLevel = (typeof PORTAL_LEVELS)[number]["value"];

/** Teams (optional). Marketing gates the Marketing Hub; the rest get the
 *  standard internal experience. */
export const PORTAL_TEAMS = [
  { value: "marketing", label: "Marketing" },
  { value: "sales", label: "Sales" },
  { value: "operations", label: "Operations" },
  { value: "leadership", label: "Leadership" },
] as const;
export type PortalTeam = (typeof PORTAL_TEAMS)[number]["value"];

/** Authorized for the portal iff on the list with a non-empty level. */
export function isRoleAllowed(role: string | null | undefined): boolean {
  return typeof role === "string" && role.trim().length > 0;
}

export function isAdminRole(role: string | null | undefined): boolean {
  return role?.toLowerCase() === ADMIN_ROLE;
}

/** May use the Marketing Hub: any admin, or anyone on the Marketing team. */
export function isMarketingAllowed(
  role: string | null | undefined,
  team: string | null | undefined
): boolean {
  return role?.toLowerCase() === ADMIN_ROLE || team?.toLowerCase() === MARKETING_TEAM;
}

/** Label for a team value, for display. */
export function teamLabel(team: string | null | undefined): string {
  const match = PORTAL_TEAMS.find((t) => t.value === team?.toLowerCase());
  return match ? match.label : "—";
}

/** Label for a level value, for display. */
export function levelLabel(role: string | null | undefined): string {
  const match = PORTAL_LEVELS.find((r) => r.value === role?.toLowerCase());
  return match ? match.label : "No access";
}
