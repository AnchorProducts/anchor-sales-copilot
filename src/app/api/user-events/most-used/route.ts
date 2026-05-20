import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Feature catalog: each path prefix maps to a feature key. Longest prefixes
// are checked first so /dashboard/opportunities/new doesn't get attributed
// to /dashboard.
const FEATURE_PREFIXES: Array<{ key: string; prefix: string }> = [
  { key: "notable",    prefix: "/dashboard/notable-projects" },
  { key: "commission", prefix: "/dashboard/commission" },
  { key: "consults",   prefix: "/dashboard/opportunities" },
  { key: "assets",     prefix: "/assets" },
  { key: "chat",       prefix: "/chat" },
];

function pathToFeature(path: string | null): string | null {
  if (!path) return null;
  for (const f of FEATURE_PREFIXES) {
    if (path === f.prefix || path.startsWith(`${f.prefix}/`)) return f.key;
  }
  return null;
}

export async function GET() {
  const supabase = await supabaseRoute();
  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr || !auth?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Returns:
  //   feature   — the user's MOST RECENT opened feature (drives the hero)
  //   lastSeen  — when that recent event happened
  //   counts    — per-feature page_view counts over the last 30 days
  //               (drives bento tile sizing — heavier-used apps get wider tiles)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("user_events")
    .select("page_path, created_at")
    .eq("user_id", auth.user.id)
    .eq("event_type", "page_view")
    .gte("created_at", thirtyDaysAgo)
    .order("created_at", { ascending: false })
    .limit(2000);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const counts: Record<string, number> = {};
  let topKey: string | null = null;
  let lastSeen: string | null = null;
  for (const row of data ?? []) {
    const r = row as { page_path: string | null; created_at: string };
    const key = pathToFeature(r.page_path);
    if (!key) continue;
    counts[key] = (counts[key] ?? 0) + 1;
    // First row in our DESC-by-created_at sort is the most recent feature event.
    if (topKey === null) {
      topKey = key;
      lastSeen = r.created_at;
    }
  }

  return NextResponse.json({ feature: topKey, lastSeen, counts });
}
