import "server-only";

/* ============================================================================
 * Is NetSuite actually set up?
 *
 * The NetSuite push is built but not commissioned — there are no credentials
 * yet. Rather than showing reps a sync button that always fails, every NetSuite
 * surface is gated on this check: unconfigured means the panel renders as a
 * greyed-out "Coming soon" box, and the sync endpoint refuses politely.
 *
 * The moment all six values are present in the environment, the real UI appears
 * on its own. No code change, no feature flag to flip.
 *
 * Set them in `.env.local` for local dev, and in BOTH Vercel projects for
 * production. Note the actual OAuth call is made by the `netsuite-lead-sync`
 * Supabase edge function, which reads these from its own secrets — so they must
 * be set there too (`supabase secrets set`). This check gates the UI; it can't
 * see the edge function's environment.
 * ==========================================================================*/

export const NETSUITE_ENV_VARS = [
  "NETSUITE_ACCOUNT_ID",
  "NETSUITE_CONSUMER_KEY",
  "NETSUITE_CONSUMER_SECRET",
  "NETSUITE_TOKEN_ID",
  "NETSUITE_TOKEN_SECRET",
  "NETSUITE_RESTLET_URL",
] as const;

/** True only when every credential is present and non-empty. */
export function isNetSuiteConfigured(): boolean {
  return NETSUITE_ENV_VARS.every((key) => String(process.env[key] ?? "").trim().length > 0);
}

/** Which credentials are still missing — for the sync endpoint's error message. */
export function missingNetSuiteEnvVars(): string[] {
  return NETSUITE_ENV_VARS.filter((key) => String(process.env[key] ?? "").trim().length === 0);
}
