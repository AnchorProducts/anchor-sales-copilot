// Outside-rep → inside-rep territory routing for marketing orders.
//
// An outside (external) rep covers some states (with optional ZIP sub-territories,
// e.g. the TX Houston/Gulf split). The inside (internal/anchor) rep(s) who cover
// the same territory are the ones who get notified when that outside rep submits
// an order — and, by the same rule, the only inside reps who may see and work it.
// "Who gets notified" == "who can see it". Admins bypass all of this and see
// everything; this module is only about scoping inside reps.
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { loadAllSalesReps, narrowRepsByZip, type SalesRep } from "@/lib/sales/regions";

const clean = (v: unknown) => String(v || "").trim();

// The states an outside rep covers, from their profile (array, or legacy single).
export function submitterStates(profile: any): string[] {
  if (Array.isArray(profile?.service_states) && profile.service_states.length) {
    return profile.service_states as string[];
  }
  const single = clean(profile?.service_state);
  return single ? [single] : [];
}

// Inside (internal) reps assigned to a territory — the state(s) an outside rep
// covers, narrowed by ZIP for split territories. Pure and in-memory against a
// preloaded sales_reps list, so it can run per-order in a list scan. Mirrors
// resolveRegionalReps: narrow the full covering set by ZIP, then keep the
// internal reps, de-duped by id. This is the one place the outside-rep → inside-
// rep "region" is resolved; emails and region tool keys both derive from it.
export function insideRepsFor(
  allReps: SalesRep[],
  states: string[],
  zip: string | null
): SalesRep[] {
  const seen = new Set<string>();
  const out: SalesRep[] = [];
  for (const raw of states) {
    const state = clean(raw).toUpperCase();
    if (!state) continue;
    const covering = allReps.filter(
      (r) => Array.isArray(r.states) && r.states.some((s) => clean(s).toUpperCase() === state)
    );
    for (const rep of narrowRepsByZip(covering, zip)) {
      if (rep.kind !== "internal") continue;
      // Dedupe by id when present, else by lowercased email — a rep can cover
      // several of the submitter's states and must only appear once.
      const dedupeKey = clean(rep.id) || clean(rep.email).toLowerCase();
      if (!dedupeKey || seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      out.push(rep);
    }
  }
  return out;
}

// Inside (internal) salesperson emails assigned to a territory. Thin wrapper over
// insideRepsFor for callers that only need the address set (visibility scoping).
export function insideRepEmailsFor(
  allReps: SalesRep[],
  states: string[],
  zip: string | null
): Set<string> {
  const out = new Set<string>();
  for (const rep of insideRepsFor(allReps, states, zip)) {
    const email = clean(rep.email).toLowerCase();
    if (email) out.add(email);
  }
  return out;
}

// Resolve the inside rep record(s) for an outside rep's own territory. Used on
// submit to map the order to its region notification tool(s) — i.e. the
// configured regional manager — without notifying the inside rep directly.
export async function resolveInsideRepsFor(profile: any): Promise<SalesRep[]> {
  const allReps = await loadAllSalesReps();
  const zip = clean(profile?.service_zip) || null;
  return insideRepsFor(allReps, submitterStates(profile), zip);
}

// True if an inside rep (by email) may see/act on an order placed by `orderCreatedBy`.
// Only outside reps' orders route to an inside rep's territory; anything else is false.
export async function insideRepCanAccessOrder(
  meEmail: string,
  orderCreatedBy: string | null | undefined
): Promise<boolean> {
  const email = clean(meEmail).toLowerCase();
  if (!email || !orderCreatedBy) return false;
  const { data: sub } = await supabaseAdmin
    .from("profiles")
    .select("role,service_states,service_state,service_zip")
    .eq("id", orderCreatedBy)
    .maybeSingle();
  if (!sub || clean((sub as any).role) !== "external_rep") return false;
  const allReps = await loadAllSalesReps();
  const zip = clean((sub as any).service_zip) || null;
  return insideRepEmailsFor(allReps, submitterStates(sub), zip).has(email);
}

// The order ids an inside rep (by email) may see — every order placed by an
// outside rep in their territory. Used to scope unread-badge counts to match the
// order list.
export async function insideRepVisibleOrderIds(meEmail: string): Promise<string[]> {
  const email = clean(meEmail).toLowerCase();
  if (!email) return [];

  const { data: orders } = await supabaseAdmin
    .from("marketing_orders")
    .select("id,created_by")
    .order("created_at", { ascending: false })
    .limit(500);
  const rows = (orders || []) as Array<{ id: string; created_by: string | null }>;
  if (rows.length === 0) return [];

  const submitterIds = Array.from(
    new Set(rows.map((o) => o.created_by).filter((v): v is string => !!v))
  );
  const subMap = new Map<string, { role: string; states: string[]; zip: string | null }>();
  if (submitterIds.length) {
    const { data: subs } = await supabaseAdmin
      .from("profiles")
      .select("id,role,service_states,service_state,service_zip")
      .in("id", submitterIds);
    for (const s of (subs || []) as any[]) {
      subMap.set(s.id, {
        role: clean(s.role),
        states: submitterStates(s),
        zip: clean(s.service_zip) || null,
      });
    }
  }

  const allReps = await loadAllSalesReps();
  const mineBySubmitter = new Map<string, boolean>();
  const ids: string[] = [];
  for (const o of rows) {
    const sub = o.created_by ? subMap.get(o.created_by) : undefined;
    if (!sub || sub.role !== "external_rep") continue;
    let mine = mineBySubmitter.get(o.created_by!);
    if (mine === undefined) {
      mine = insideRepEmailsFor(allReps, sub.states, sub.zip).has(email);
      mineBySubmitter.set(o.created_by!, mine);
    }
    if (mine) ids.push(o.id);
  }
  return ids;
}
