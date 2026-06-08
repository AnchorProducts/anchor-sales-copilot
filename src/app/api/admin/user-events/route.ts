import { NextRequest, NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Every event a single user logged within a time window — powers the per-user
// "full event log" PDF. Capped so a very chatty user can't produce a huge file.
const MAX_EVENTS = 3000;
// Includes 1 so the matrix's "Last 24 hours" window returns a real 1-day cut
// instead of silently coercing to 30 (which mislabeled the export).
const ALLOWED_DAYS = [1, 7, 14, 30, 90] as const;

function parseDays(value: string | null): number {
  const n = Number(value);
  return (ALLOWED_DAYS as readonly number[]).includes(n) ? n : 30;
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
  if (String((prof as { role?: string } | null)?.role || "") !== "admin") {
    return { error: "Forbidden", status: 403 as const };
  }
  return { user: auth.user };
}

export async function GET(req: NextRequest) {
  const gate = await requireAdmin();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });
  const days = parseDays(req.nextUrl.searchParams.get("days"));
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabaseAdmin
    .from("user_events")
    .select("event_type, page_path, metadata, created_at")
    .eq("user_id", userId)
    .gte("created_at", cutoff)
    .order("created_at", { ascending: false })
    .limit(MAX_EVENTS + 1);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const raw = (data ?? []) as Array<{ event_type: string; page_path: string | null; metadata: Record<string, unknown> | null; created_at: string }>;
  const truncated = raw.length > MAX_EVENTS;
  const events = raw.slice(0, MAX_EVENTS).map((e) => {
    const m = (e.metadata ?? {}) as Record<string, unknown>;
    const detail =
      e.event_type === "click"
        ? String(m.trackId || m.label || m.href || m.el || "click")
        : e.page_path || "";
    return { at: e.created_at, type: e.event_type, detail };
  });

  return NextResponse.json({ days, count: events.length, truncated, events });
}
