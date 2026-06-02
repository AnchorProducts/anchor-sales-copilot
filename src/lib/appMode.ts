// Set NEXT_PUBLIC_APP_MODE=internal in the internal Vercel deployment.
// External deployment leaves it unset (defaults to "external").
export const isInternal = process.env.NEXT_PUBLIC_APP_MODE === "internal";

export const APP_NAME    = isInternal ? "Anchor Internal"    : "Anchor App";
export const APP_SHORT   = isInternal ? "Anchor Internal"    : "Anchor App";
export const APP_LOGO    = isInternal ? "/internal_anchorplogin.svg" : "/anchorplogin.svg";
export const APP_NAV_LOGO = "/anchorp.svg"; // nav logo is the same for both
