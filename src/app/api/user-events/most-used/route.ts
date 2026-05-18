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

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("user_events")
    .select("page_path")
    .eq("user_id", auth.user.id)
    .eq("event_type", "page_view")
    .gte("created_at", sevenDaysAgo)
    .limit(1000);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const counts = new Map<string, number>();
  for (const row of data ?? []) {
    const key = pathToFeature((row as { page_path: string | null }).page_path);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }

  let topKey: string | null = null;
  let topCount = 0;
  for (const [key, count] of counts) {
    if (count > topCount) {
      topKey = key;
      topCount = count;
    }
  }

  return NextResponse.json({ feature: topKey, count: topCount });
}
