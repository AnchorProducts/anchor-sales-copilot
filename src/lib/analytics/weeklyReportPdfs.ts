import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { computeOemMatrix } from "@/lib/analytics/oemMatrixData";
import { buildOemMatrixPdf } from "@/lib/analytics/oemMatrixPdf";
import { buildUserAnalyticsPdf } from "@/lib/analytics/userAnalyticsPdf";
import {
  buildUserAnalyticsSummary,
  shortEventLabel,
  type ChartUser,
} from "@/lib/analytics/userAnalyticsSummary";

const WINDOW_LABEL = "Last 7 days";

// OEM matrix PDF — last 7 days, no manufacturer/type filters.
export async function buildWeeklyOemMatrixPdf(): Promise<Buffer> {
  const matrix = await computeOemMatrix(7);
  return buildOemMatrixPdf(matrix, { windowLabel: WINDOW_LABEL, manufacturers: [], groups: [] });
}

// Non-OEM app users (internal staff + other signed-up users), with their events
// over the window — the same set the User Analytics page scopes to.
async function computeNonOemChartUsers(days: number): Promise<ChartUser[]> {
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data: contactData } = await supabaseAdmin.from("manufacturer_contacts").select("email");
  const rosterEmails = new Set<string>();
  for (const c of (contactData ?? []) as Array<{ email: string | null }>) {
    if (c.email) rosterEmails.add(c.email.toLowerCase());
  }

  const { data: profData, error: pErr } = await supabaseAdmin
    .from("profiles")
    .select("id, email, full_name, role");
  if (pErr) throw new Error(pErr.message);
  const profiles = ((profData ?? []) as Array<{ id: string; email: string | null; full_name: string | null; role: string | null }>)
    .filter((p) => !p.email || !rosterEmails.has(p.email.toLowerCase()));

  const ids = profiles.map((p) => p.id);
  const byTypeByUser = new Map<string, Record<string, number>>();
  const dailyByUser = new Map<string, Record<string, number>>();
  const lastSeenByUser = new Map<string, string>();

  if (ids.length > 0) {
    const { data: evData, error: evErr } = await supabaseAdmin
      .from("user_events")
      .select("user_id, event_type, created_at")
      .in("user_id", ids)
      .gte("created_at", cutoff);
    if (evErr) throw new Error(evErr.message);
    for (const e of (evData ?? []) as Array<{ user_id: string | null; event_type: string; created_at: string }>) {
      if (!e.user_id) continue;
      const bt = byTypeByUser.get(e.user_id) ?? {};
      bt[e.event_type] = (bt[e.event_type] ?? 0) + 1;
      byTypeByUser.set(e.user_id, bt);
      const day = e.created_at.slice(0, 10);
      const dc = dailyByUser.get(e.user_id) ?? {};
      dc[day] = (dc[day] ?? 0) + 1;
      dailyByUser.set(e.user_id, dc);
      const prev = lastSeenByUser.get(e.user_id);
      if (!prev || e.created_at > prev) lastSeenByUser.set(e.user_id, e.created_at);
    }
  }

  return profiles.map((p) => {
    const byType = byTypeByUser.get(p.id) ?? {};
    const total = Object.values(byType).reduce((s, n) => s + n, 0);
    return {
      id: p.id,
      full_name: p.full_name,
      email: p.email ?? "",
      role: p.role,
      events: { total7: total, total30: total, lastSeen: lastSeenByUser.get(p.id) ?? null, byType },
      dailyEvents: Object.entries(dailyByUser.get(p.id) ?? {}).map(([date, count]) => ({ date, count })),
    };
  });
}

// User Analytics PDF — last 7 days, every non-OEM user with their event breakdown.
export async function buildWeeklyUserAnalyticsPdf(): Promise<Buffer> {
  const users = await computeNonOemChartUsers(7);
  const summary = buildUserAnalyticsSummary(users, 7);

  const isInternal = (role: string | null) => role === "anchor_rep" || role === "admin";
  const userTotal = (u: ChartUser) => Object.values(u.events.byType).reduce((s, n) => s + n, 0);
  const agg: Record<string, number> = {};
  for (const u of users) for (const [t, n] of Object.entries(u.events.byType)) agg[t] = (agg[t] ?? 0) + n;
  const topTypeKeys = Object.entries(agg).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([t]) => t);

  const rows = users
    .map((u) => ({
      name: u.full_name || u.email,
      email: u.email,
      category: isInternal(u.role) ? "Internal" : "External",
      counts: topTypeKeys.map((t) => u.events.byType[t] ?? 0),
      total: userTotal(u),
    }))
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total);

  return buildUserAnalyticsPdf({
    title: "User Analytics",
    scopeLabel: "Internal staff & other app users",
    windowLabel: WINDOW_LABEL,
    stats: summary.stats,
    series: summary.series,
    byType: summary.byType,
    breakdown: { typeLabels: topTypeKeys.map(shortEventLabel), rows },
  });
}
