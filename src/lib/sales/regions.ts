import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type SalesRepKind = "internal" | "external";

// One salesperson assigned to a set of US states. `kind` distinguishes
// internal (inside sales / Anchor team) from external (outside / field reps).
// Multiple entries of either kind may cover the same state.
export type SalesRep = {
  id?: string;
  kind: SalesRepKind;
  name: string | null;
  email: string | null;
  teams_link: string | null;
  states: string[];
  // 3-digit ZIP prefixes this rep covers within a shared state. Empty = the
  // rep covers the whole state. Used to split overlapping reps by ZIP.
  zip_prefixes: string[];
};

// In-memory fallback used only when the DB has zero reps yet.
const FALLBACK_REPS: SalesRep[] = [];

export async function loadAllSalesReps(): Promise<SalesRep[]> {
  const { data, error } = await supabaseAdmin
    .from("sales_reps")
    .select("id, kind, name, email, teams_link, states, zip_prefixes")
    .order("name");

  if (error || !data || data.length === 0) return FALLBACK_REPS;
  return data as SalesRep[];
}

function repCoversState(rep: SalesRep, normalizedState: string): boolean {
  return (
    Array.isArray(rep.states) &&
    rep.states.some((s) => String(s || "").trim().toUpperCase() === normalizedState)
  );
}

// When reps overlap a state via ZIP sub-territories, narrow to the rep(s) whose
// zip_prefixes claim the given ZIP. Reps with no zip_prefixes are the state-wide
// default and are used when the ZIP isn't claimed by a sub-territory rep.
// With no ZIP (or no sub-territories in play) the list is returned unchanged.
export function narrowRepsByZip(reps: SalesRep[], zip?: string | null): SalesRep[] {
  const z3 = String(zip || "").replace(/\D/g, "").slice(0, 3);
  if (!z3) return reps;
  const specifics = reps.filter((r) => (r.zip_prefixes?.length ?? 0) > 0);
  if (specifics.length === 0) return reps;
  const matching = specifics.filter((r) => r.zip_prefixes.includes(z3));
  if (matching.length > 0) return matching;
  const defaults = reps.filter((r) => (r.zip_prefixes?.length ?? 0) === 0);
  return defaults.length > 0 ? defaults : reps;
}

// Every rep (internal + external) assigned to a US state. When a ZIP is given,
// overlapping ZIP sub-territories (e.g. TX Houston/Gulf) are narrowed down.
export async function resolveRegionalReps(
  country: string,
  state: string,
  zip?: string | null
): Promise<SalesRep[]> {
  if (String(country || "").trim().toUpperCase() !== "US") return [];
  const normalizedState = String(state || "").trim().toUpperCase();
  if (!normalizedState) return [];
  const reps = await loadAllSalesReps();
  return narrowRepsByZip(reps.filter((rep) => repCoversState(rep, normalizedState)), zip);
}

// Reps for a state split by kind — convenient for callers that treat internal
// vs external differently (REC routing vs the "your reps" dashboard card).
// Pass the project ZIP to resolve ZIP-split territories (TX Daymon vs Robert).
export async function resolveRepsByKind(
  country: string,
  state: string,
  zip?: string | null
): Promise<{ internal: SalesRep[]; external: SalesRep[] }> {
  const reps = await resolveRegionalReps(country, state, zip);
  return {
    internal: reps.filter((r) => r.kind === "internal"),
    external: reps.filter((r) => r.kind === "external"),
  };
}

// Resolve the state codes assigned to a given user, by matching their profile
// email against any sales_reps entry (internal or external). Used to scope a
// rep's lead-triage queue to their states.
export async function resolveStatesForUser(userId: string): Promise<string[]> {
  if (!userId) return [];

  const { data: prof } = await supabaseAdmin
    .from("profiles")
    .select("email")
    .eq("id", userId)
    .maybeSingle();

  const email = String((prof as { email?: string | null } | null)?.email || "")
    .trim()
    .toLowerCase();
  if (!email) return [];

  const { data: reps } = await supabaseAdmin
    .from("sales_reps")
    .select("states")
    .ilike("email", email);

  const out = new Set<string>();
  for (const rep of (reps as { states?: string[] | null }[] | null) ?? []) {
    for (const s of rep.states ?? []) {
      const v = String(s || "").trim().toUpperCase();
      if (v) out.add(v);
    }
  }
  return [...out];
}
