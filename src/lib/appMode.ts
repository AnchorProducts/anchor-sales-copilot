// Set NEXT_PUBLIC_APP_MODE=internal in the internal Vercel deployment.
// External deployment leaves it unset (defaults to "external").
export const isInternal = process.env.NEXT_PUBLIC_APP_MODE === "internal";

const EXTERNAL_APP_NAME = "Anchor App";
const INTERNAL_APP_NAME = "Anchor Internal";

// Deployment-level name — fixed per Vercel project via NEXT_PUBLIC_APP_MODE.
// Used for SSR/pre-login surfaces (page title, manifest, login screen) where
// the user's role isn't known yet.
export const APP_NAME    = isInternal ? INTERNAL_APP_NAME : EXTERNAL_APP_NAME;
export const APP_SHORT   = APP_NAME;
export const APP_LOGO    = isInternal ? "/internal_anchorplogin.svg" : "/anchorplogin.svg";
export const APP_NAV_LOGO = "/anchorp.svg"; // nav logo is the same for both

// Role-aware name for post-login chrome. An admin previewing the external
// experience via "View As" should see "Anchor App" even on the internal
// deployment, so the name follows the effective role rather than the build.
// Unknown/loading role falls back to the deployment name.
export function appNameForRole(role?: string | null) {
  if (role === "external_rep") return EXTERNAL_APP_NAME;
  if (role === "anchor_rep" || role === "admin") return INTERNAL_APP_NAME;
  return APP_NAME;
}
