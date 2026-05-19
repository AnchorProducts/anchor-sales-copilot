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

type ContactRow = {
  id: string;
  manufacturer: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  cell: string | null;
  title: string | null;
  territory: string | null;
  region: string | null;
  created_at: string;
};

type ProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: string | null;
  company: string | null;
  created_at: string | null;
};

type EventRow = {
  user_id: string;
  event_type: string;
  page_path: string | null;
  created_at: string;
};

type Activity = {
  total7: number;
  total30: number;
  lastSeen: string | null;
  topPages: Array<{ path: string; count: number }>;
};

export async function GET() {
  const gate = await requireAdmin();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const { data: contactsData, error: contactsErr } = await supabaseAdmin
    .from("manufacturer_contacts")
    .select(
      "id, manufacturer, first_name, last_name, full_name, email, phone, cell, title, territory, region, created_at"
    )
    .order("manufacturer", { ascending: true })
    .order("last_name", { ascending: true });

  if (contactsErr) {
    return NextResponse.json({ error: contactsErr.message }, { status: 500 });
  }

  const contacts = (contactsData ?? []) as ContactRow[];
  const emails = Array.from(
    new Set(
      contacts
        .map((c) => (c.email || "").toLowerCase())
        .filter((e) => e.length > 0)
    )
  );

  // Pull profiles matching any of those emails (lowercased compare).
  const profileByEmail = new Map<string, ProfileRow>();
  if (emails.length > 0) {
    const { data: profiles, error: profErr } = await supabaseAdmin
      .from("profiles")
      .select("id, email, full_name, role, company, created_at")
      .in("email", emails);
    if (profErr) {
      return NextResponse.json({ error: profErr.message }, { status: 500 });
    }
    for (const p of (profiles ?? []) as ProfileRow[]) {
      const key = (p.email || "").toLowerCase();
      if (key) profileByEmail.set(key, p);
    }
  }

  // For the matched profiles, aggregate the last 30 days of events.
  const matchedUserIds = Array.from(profileByEmail.values()).map((p) => p.id);
  const activityByUserId = new Map<string, Activity>();

  if (matchedUserIds.length > 0) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: events, error: evErr } = await supabaseAdmin
      .from("user_events")
      .select("user_id, event_type, page_path, created_at")
      .in("user_id", matchedUserIds)
      .gte("created_at", thirtyDaysAgo);
    if (evErr) {
      return NextResponse.json({ error: evErr.message }, { status: 500 });
    }

    const sevenDayCutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const pageCounts: Record<string, Record<string, number>> = {};
    for (const e of (events ?? []) as EventRow[]) {
      const agg = activityByUserId.get(e.user_id) ?? {
        total7: 0,
        total30: 0,
        lastSeen: null,
        topPages: [],
      };
      agg.total30 += 1;
      if (new Date(e.created_at).getTime() >= sevenDayCutoff) agg.total7 += 1;
      if (!agg.lastSeen || e.created_at > agg.lastSeen) agg.lastSeen = e.created_at;
      if (e.page_path) {
        const pc = (pageCounts[e.user_id] ??= {});
        pc[e.page_path] = (pc[e.page_path] ?? 0) + 1;
      }
      activityByUserId.set(e.user_id, agg);
    }
    for (const [uid, agg] of activityByUserId) {
      const pc = pageCounts[uid] ?? {};
      agg.topPages = Object.entries(pc)
        .map(([path, count]) => ({ path, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
    }
  }

  const enriched = contacts.map((c) => {
    const email = (c.email || "").toLowerCase();
    const profile = email ? profileByEmail.get(email) ?? null : null;
    const activity = profile ? activityByUserId.get(profile.id) ?? null : null;
    return {
      ...c,
      signed_up: !!profile,
      profile_id: profile?.id ?? null,
      profile_role: profile?.role ?? null,
      profile_created_at: profile?.created_at ?? null,
      activity,
    };
  });

  return NextResponse.json({
    contacts: enriched,
    counts: {
      total: contacts.length,
      withEmail: contacts.filter((c) => !!c.email).length,
      signedUp: enriched.filter((c) => c.signed_up).length,
      manufacturers: Array.from(new Set(contacts.map((c) => c.manufacturer))).length,
    },
  });
}
