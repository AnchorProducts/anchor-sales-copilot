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

// Two front-ends share this repo as separate Vercel projects: the INTERNAL app
// (admins + internal/anchor reps) and the EXTERNAL app (external reps). A cross-
// audience email must link to the RECIPIENT's app, not whichever deployment
// happened to send the mail — so appUrl() (which resolves to the sender's own
// origin) is wrong for those. Use these audience-pinned bases instead.
const INTERNAL_APP_BASE =
  clean(process.env.NEXT_PUBLIC_INTERNAL_APP_URL) || "https://anchor-internal.vercel.app";
const EXTERNAL_APP_BASE =
  clean(process.env.NEXT_PUBLIC_EXTERNAL_APP_URL) || "https://anchor-sales-copilot.vercel.app";

function withBase(base: string, path: string): string {
  const root = base.startsWith("http") ? base : `https://${base}`;
  const suffix = path.startsWith("/") ? path : `/${path}`;
  return `${root}${suffix}`;
}

/** Absolute URL on the internal app (admin console, internal-rep tooling). */
export function internalAppUrl(path: string): string {
  return withBase(INTERNAL_APP_BASE, path);
}

/** Absolute URL on the external app (external-rep facing). */
export function externalAppUrl(path: string): string {
  return withBase(EXTERNAL_APP_BASE, path);
}

/** Pick the app a rep logs into, based on their role. */
export function repAppUrl(path: string, role: string | null | undefined): string {
  return clean(role) === "external_rep" ? externalAppUrl(path) : internalAppUrl(path);
}
