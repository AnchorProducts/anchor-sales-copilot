// Absolute base URL for in-app links placed in emails.
//
// Order matters: an explicit configured domain wins, then Vercel's stable
// production domain, and only then the per-deployment VERCEL_URL. VERCEL_URL is
// the deployment-specific host (e.g. anchor-internal-<hash>.vercel.app) which is
// gated by Vercel Deployment Protection — links built from it land recipients on
// a "You Need Access" SSO page. As a last resort we fall back to the request's
// own origin.
function clean(v: unknown): string {
  return String(v ?? "").trim();
}

export function appBaseUrl(req?: Request): string {
  const configured =
    clean(process.env.NEXT_PUBLIC_APP_URL) ||
    clean(process.env.NEXT_PUBLIC_SITE_URL) ||
    clean(process.env.VERCEL_PROJECT_PRODUCTION_URL) ||
    clean(process.env.VERCEL_URL);

  if (configured) {
    return configured.startsWith("http") ? configured : `https://${configured}`;
  }
  return req ? new URL(req.url).origin : "";
}

/** Absolute URL for an in-app path (leading slash optional). */
export function appUrl(path: string, req?: Request): string {
  const base = appBaseUrl(req);
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${base}${suffix}`;
}
