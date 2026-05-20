import { NextRequest, NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type ActivityCategory = "all" | "internal" | "external" | "manufacturer";

function parseCategory(value: string | null): ActivityCategory {
  if (value === "all" || value === "internal" || value === "manufacturer") return value;
  return "external";
}

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
  role?: string | null;
  manufacturer?: string | null;
};

type ManufacturerContactRow = {
  manufacturer: string;
  email: string | null;
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
  metadata: Record<string, unknown> | null;
  created_at: string;
};
type ClickAggregate = { label: string; path: string; count: number };
type RecentEvent = {
  created_at: string;
  event_type: string;
  page_path: string | null;
  label: string | null;
};
type EventAggregate = {
  total7: number;
  total30: number;
  lastSeen: string | null;
  byType: Record<string, number>;
  topPages: Array<{ path: string; count: number }>;
  topClicks: ClickAggregate[];
  recent: RecentEvent[];
};

export async function GET(req: NextRequest) {
  const gate = await requireAdmin();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const category = parseCategory(req.nextUrl.searchParams.get("category"));

  // Manufacturer contacts -> email map: lower(email) -> manufacturer name.
  // Loaded for any category that needs the manufacturer tag (all + manufacturer)
  // so user rows can be stamped with it.
  const manufacturerByEmail = new Map<string, string>();
  // Total manufacturer-contact counts per OEM — used by the scorecard to compute
  // signup rate (signed_up / total_contacts). Counts every contact row regardless
  // of whether they have an email.
  const oemContactCounts: Record<string, number> = {};
  if (category === "manufacturer" || category === "all") {
    const contactsSelect = category === "all"
      ? supabaseAdmin.from("manufacturer_contacts").select("manufacturer,email")
      : supabaseAdmin.from("manufacturer_contacts").select("manufacturer,email").not("email", "is", null);
    const { data: contacts, error: contactsErr } = await contactsSelect;
    if (contactsErr) return NextResponse.json({ error: contactsErr.message }, { status: 500 });
    for (const c of (contacts ?? []) as ManufacturerContactRow[]) {
      if (c.email) manufacturerByEmail.set(c.email.toLowerCase(), c.manufacturer);
      if (category === "all") {
        oemContactCounts[c.manufacturer] = (oemContactCounts[c.manufacturer] ?? 0) + 1;
      }
    }
  }

  let usersQuery = supabaseAdmin
    .from("profiles")
    .select("id,email,full_name,company,phone,created_at,role")
    .order("created_at", { ascending: false });

  if (category === "external") {
    usersQuery = usersQuery.eq("user_type", "external");
  } else if (category === "internal") {
    usersQuery = usersQuery.in("role", ["anchor_rep", "admin"]);
  } else if (category === "manufacturer") {
    const emails = Array.from(manufacturerByEmail.keys());
    if (emails.length === 0) {
      return NextResponse.json({
        category,
        users: [],
        charts: { dailyEvents: [], eventsByType: {} },
      });
    }
    usersQuery = usersQuery.in("email", emails);
  }
  // category === "all" runs no filter — every profile, internal + external.

  const { data: usersRaw, error: usersErr } = await usersQuery;
  if (usersErr) return NextResponse.json({ error: usersErr.message }, { status: 500 });

  let users = (usersRaw ?? []) as ProfileRow[];

  if (category === "manufacturer") {
    users = users
      .map((u) => ({
        ...u,
        manufacturer: manufacturerByEmail.get((u.email || "").toLowerCase()) ?? null,
      }))
      .filter((u) => u.manufacturer);
  } else if (category === "all") {
    users = users.map((u) => ({
      ...u,
      manufacturer: manufacturerByEmail.get((u.email || "").toLowerCase()) ?? null,
    }));
  }

  const userIds = users.map((u) => u.id);

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
          .select("user_id,event_type,page_path,metadata,created_at")
          .in("user_id", userIds)
          .gte("created_at", thirtyDaysAgo)
          .order("created_at", { ascending: false })
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
  // key = path + "::" + label, value = count, so the same label on
  // different pages is counted separately (useful for "Open Copilot"
  // appearing in multiple spots).
  const clickCounts: Record<string, Record<string, { label: string; path: string; count: number }>> = {};
  const recentByUser: Record<string, RecentEvent[]> = {};
  // Sparse per-user daily counts: user_id -> ISO date (YYYY-MM-DD) -> count.
  // The client rolls these up into arbitrary series (per OEM, category, etc.).
  const dailyByUser: Record<string, Record<string, number>> = {};

  for (const e of events) {
    if (!e.user_id) continue;
    const agg = (eventAggs[e.user_id] ??= {
      total7: 0,
      total30: 0,
      lastSeen: null,
      byType: {},
      topPages: [],
      topClicks: [],
      recent: [],
    });
    agg.total30 += 1;
    if (new Date(e.created_at).getTime() >= sevenDayCutoff) agg.total7 += 1;
    if (!agg.lastSeen || e.created_at > agg.lastSeen) agg.lastSeen = e.created_at;
    agg.byType[e.event_type] = (agg.byType[e.event_type] ?? 0) + 1;
    if (e.page_path) {
      const pc = (pageCounts[e.user_id] ??= {});
      pc[e.page_path] = (pc[e.page_path] ?? 0) + 1;
    }

    const day = e.created_at.slice(0, 10);
    const dc = (dailyByUser[e.user_id] ??= {});
    dc[day] = (dc[day] ?? 0) + 1;

    if (e.event_type === "click") {
      const meta = (e.metadata ?? {}) as Record<string, unknown>;
      const label = String(meta.trackId || meta.label || meta.href || meta.el || "click");
      const path = e.page_path || "";
      const key = `${path}::${label}`;
      const userClicks = (clickCounts[e.user_id] ??= {});
      const entry = (userClicks[key] ??= { label, path, count: 0 });
      entry.count += 1;
    }

    // Keep the latest 25 events per user for the timeline / PDF.
    const recent = (recentByUser[e.user_id] ??= []);
    if (recent.length < 25) {
      const m = (e.metadata ?? {}) as Record<string, unknown>;
      const label =
        e.event_type === "click"
          ? String(m.trackId || m.label || m.href || m.el || "")
          : null;
      recent.push({
        created_at: e.created_at,
        event_type: e.event_type,
        page_path: e.page_path,
        label,
      });
    }
  }

  for (const uid of Object.keys(eventAggs)) {
    const pc = pageCounts[uid] ?? {};
    eventAggs[uid].topPages = Object.entries(pc)
      .map(([path, count]) => ({ path, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    eventAggs[uid].topClicks = Object.values(clickCounts[uid] ?? {})
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
    eventAggs[uid].recent = recentByUser[uid] ?? [];
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

  const rows = users.map((u) => ({
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
      topClicks: [],
      recent: [],
    },
    dailyEvents: Object.entries(dailyByUser[u.id] ?? {})
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0)),
  }));

  return NextResponse.json({
    category,
    users: rows,
    charts: { dailyEvents, eventsByType: overallByType },
    oemContactCounts: category === "all" ? oemContactCounts : undefined,
  });
}
