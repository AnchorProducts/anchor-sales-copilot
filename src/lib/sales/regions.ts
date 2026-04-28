import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const US_STATES: string[] = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA",
  "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD",
  "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ",
  "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC",
  "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
];

export type SalesRep = {
  id?: string;
  outside_sales_name: string | null;
  outside_sales_email: string | null;
  phone: string | null;
  teams_link: string | null;
  states: string[];
};

// In-memory fallback used only when the DB has zero reps yet.
const FALLBACK_REPS: SalesRep[] = [
  {
    outside_sales_name: "Test Assignment",
    outside_sales_email: null,
    phone: null,
    teams_link: null,
    states: ["TX"],
  },
];

export async function loadAllSalesReps(): Promise<SalesRep[]> {
  const { data, error } = await supabaseAdmin
    .from("sales_reps")
    .select("id, outside_sales_name, outside_sales_email, phone, teams_link, states")
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
