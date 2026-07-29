/* ============================================================================
 * The "Site live" flag — framework-free constants.
 *
 * Everything built for the App ↔ Portal reconciliation (Portal Access, the
 * shared document index, and the whole Pitch to Marketing workflow) ships
 * DARK. Nothing is visible to anyone — reps, marketing, or admins — until an
 * admin flips "Site live" in /admin/tools.
 *
 * IMPORTANT — this key inverts the usual admin_tools convention. Everywhere
 * else in that table a missing row means ACTIVE, so new tiles light up by
 * default. Here a missing row means OFF: the feature set has to be switched on
 * deliberately, exactly once, rather than going live the moment it deploys.
 * ==========================================================================*/

export const SITE_LIVE_KEY = "site_live";

/** Resolve the flag from admin_tools rows. Absent row → off. */
export function siteLiveFrom(rows: Array<{ key: string; active: boolean }> | null | undefined): boolean {
  const row = (rows ?? []).find((r) => r.key === SITE_LIVE_KEY);
  return row?.active === true;
}

/** What flipping the switch reveals — rendered in the admin toggle so it is
 *  obvious what is about to go live. */
export const SITE_LIVE_SURFACES = [
  {
    label: "Pitch to Marketing",
    detail: "Lets any internal user pitch a marketing idea and track the decision (/dashboard/pitch).",
  },
  {
    label: "Submissions inbox",
    detail:
      "The marketing/admin review queue for those pitches — at /marketing/submissions, and as a third tab in the Marketing Admin Center.",
  },
  {
    label: "Email templates",
    detail: "Lets marketing write and design the pitch notification emails (/marketing/email-templates).",
  },
  {
    label: "All Documents",
    detail: "Flat, searchable index over the shared resource library (/assets/documents).",
  },
  {
    label: "Portal Access",
    detail: "Admin manager for the shared authorized-emails list (/admin/portal-access).",
  },
] as const;
