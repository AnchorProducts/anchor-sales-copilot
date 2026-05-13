import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireAdmin() {
  const supabase = await supabaseRoute();
  const { data: auth, error } = await supabase.auth.getUser();
  if (error || !auth?.user) return { error: "Unauthorized", status: 401 as const };

  const { data: prof } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", auth.user.id)
    .maybeSingle();

  const role = String((prof as { role?: string } | null)?.role || "");
  if (role !== "admin") return { error: "Forbidden", status: 403 as const };

  return { user: auth.user };
}

type ProfileRow = {
  id: string;
  email: string;
  full_name: string | null;
  company: string | null;
  phone: string | null;
  created_at: string | null;
};

type ConversationRow = { user_id: string | null };
type LeadRow = { user_id: string | null };
type ReportRow = {
  id: string;
  contractor_name: string | null;
  company_name: string | null;
  access_type: string | null;
  created_at: string;
  file_url: string | null;
  flags_count: number | null;
  user_id: string | null;
};
type EventRow = {
  user_id: string;
  event_type: string;
  page_path: string | null;
  created_at: string;
};
type EventAggregate = {
  total7: number;
  total30: number;
  lastSeen: string | null;
  byType: Record<string, number>;
  topPages: Array<{ path: string; count: number }>;
};

export async function GET() {
  const gate = await requireAdmin();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const { data: users, error: usersErr } = await supabaseAdmin
    .from("profiles")
    .select("id,email,full_name,company,phone,created_at")
    .eq("user_type", "external")
    .order("created_at", { ascending: false });

  if (usersErr) return NextResponse.json({ error: usersErr.message }, { status: 500 });

  const userIds = (users ?? []).map((u: ProfileRow) => u.id);

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const [convRes, leadRes, reportRes, eventRes] = await Promise.all([
    userIds.length
      ? supabaseAdmin
          .from("conversations")
          .select("user_id")
          .in("user_id", userIds)
          .is("deleted_at", null)
      : Promise.resolve({ data: [] as ConversationRow[], error: null }),
    userIds.length
      ? supabaseAdmin.from("leads").select("user_id").in("user_id", userIds)
      : Promise.resolve({ data: [] as LeadRow[], error: null }),
    supabaseAdmin
      .from("assessment_reports")
      .select("id,contractor_name,company_name,access_type,created_at,file_url,flags_count,user_id")
      .order("created_at", { ascending: false }),
    userIds.length
      ? supabaseAdmin
          .from("user_events")
          .select("user_id,event_type,page_path,created_at")
          .in("user_id", userIds)
          .gte("created_at", thirtyDaysAgo)
      : Promise.resolve({ data: [] as EventRow[], error: null }),
  ]);

  const convCounts: Record<string, number> = {};
  for (const row of (convRes.data ?? []) as ConversationRow[]) {
    if (row.user_id) convCounts[row.user_id] = (convCounts[row.user_id] ?? 0) + 1;
  }

  const leadCounts: Record<string, number> = {};
  for (const row of (leadRes.data ?? []) as LeadRow[]) {
    if (row.user_id) leadCounts[row.user_id] = (leadCounts[row.user_id] ?? 0) + 1;
  }

  const reports: ReportRow[] = (reportRes.data ?? []) as ReportRow[];

  const sevenDayCutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const events: EventRow[] = (eventRes.data ?? []) as EventRow[];
  const eventAggs: Record<string, EventAggregate> = {};
  const pageCounts: Record<string, Record<string, number>> = {};

  for (const e of events) {
    if (!e.user_id) continue;
    const agg = (eventAggs[e.user_id] ??= {
      total7: 0,
      total30: 0,
      lastSeen: null,
      byType: {},
      topPages: [],
    });
    agg.total30 += 1;
    if (new Date(e.created_at).getTime() >= sevenDayCutoff) agg.total7 += 1;
    if (!agg.lastSeen || e.created_at > agg.lastSeen) agg.lastSeen = e.created_at;
    agg.byType[e.event_type] = (agg.byType[e.event_type] ?? 0) + 1;
    if (e.page_path) {
      const pc = (pageCounts[e.user_id] ??= {});
      pc[e.page_path] = (pc[e.page_path] ?? 0) + 1;
    }
  }

  for (const uid of Object.keys(eventAggs)) {
    const pc = pageCounts[uid] ?? {};
    eventAggs[uid].topPages = Object.entries(pc)
      .map(([path, count]) => ({ path, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }

  // Aggregate daily series and overall event-type mix for the dashboard charts.
  const daysBack = 30;
  const dailyCounts: Record<string, number> = {};
  const todayUTC = new Date();
  todayUTC.setUTCHours(0, 0, 0, 0);
  for (let i = daysBack - 1; i >= 0; i--) {
    const d = new Date(todayUTC.getTime() - i * 24 * 60 * 60 * 1000);
    dailyCounts[d.toISOString().slice(0, 10)] = 0;
  }
  const overallByType: Record<string, number> = {};
  for (const e of events) {
    const day = e.created_at.slice(0, 10);
    if (day in dailyCounts) dailyCounts[day] += 1;
    overallByType[e.event_type] = (overallByType[e.event_type] ?? 0) + 1;
  }
  const dailyEvents = Object.entries(dailyCounts).map(([date, count]) => ({ date, count }));

  const rows = (users ?? []).map((u: ProfileRow) => ({
    ...u,
    conversationCount: convCounts[u.id] ?? 0,
    leadCount: leadCounts[u.id] ?? 0,
    reports: reports.filter(
      (r) => r.user_id === u.id || (!r.user_id && r.company_name === u.company)
    ),
    events: eventAggs[u.id] ?? {
      total7: 0,
      total30: 0,
      lastSeen: null,
      byType: {},
      topPages: [],
    },
  }));

  return NextResponse.json({
    users: rows,
    charts: { dailyEvents, eventsByType: overallByType },
  });
}
