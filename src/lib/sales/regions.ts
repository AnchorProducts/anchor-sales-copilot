import { supabaseAdmin } from "@/lib/supabaseAdmin";

export type SalesRep = {
  id?: string;
  outside_sales_name: string | null;
  outside_sales_email: string | null;
  inside_sales_name: string | null;
  inside_sales_email: string | null;
  teams_link: string | null;
  states: string[];
};

// In-memory fallback used only when the DB has zero reps yet.
const FALLBACK_REPS: SalesRep[] = [
  {
    outside_sales_name: "Test Assignment",
    outside_sales_email: null,
    inside_sales_name: null,
    inside_sales_email: null,
    teams_link: null,
    states: ["TX"],
  },
];

export async function loadAllSalesReps(): Promise<SalesRep[]> {
  const { data, error } = await supabaseAdmin
    .from("sales_reps")
    .select("id, outside_sales_name, outside_sales_email, inside_sales_name, inside_sales_email, teams_link, states")
    .order("outside_sales_name");

  if (error || !data || data.length === 0) return FALLBACK_REPS;
  return data as SalesRep[];
}

export async function resolveRegionalAssignment(
  country: string,
  state: string
): Promise<SalesRep | null> {
  if (String(country || "").trim().toUpperCase() !== "US") return null;
  const normalizedState = String(state || "").trim().toUpperCase();
  const reps = await loadAllSalesReps();
  for (const rep of reps) {
    if (rep.states.includes(normalizedState)) return rep;
  }
  return null;
}

// Resolve the state codes assigned to a given internal rep, by matching
// their profile email against sales_reps.outside_sales_email.
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

  const { data: rep } = await supabaseAdmin
    .from("sales_reps")
    .select("states")
    .ilike("outside_sales_email", email)
    .maybeSingle();

  const states = (rep as { states?: string[] | null } | null)?.states ?? [];
  return states.map((s) => String(s || "").trim().toUpperCase()).filter(Boolean);
}
