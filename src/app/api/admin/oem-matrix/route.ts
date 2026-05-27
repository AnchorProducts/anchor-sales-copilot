import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { computeOemMatrix } from "@/lib/analytics/oemMatrixData";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Per-manufacturer matrix (Sales reps / Tech reps / Consultants) plus detailed
// logs of every event and project over a caller-selected time window
// (?days=1|7|14|30, default 30). Computation lives in lib/analytics/oemMatrixData
// so the weekly report can reuse it.

const ALLOWED_DAYS = [1, 7, 14, 30] as const;
function parseDays(req: Request): number {
  const raw = Number(new URL(req.url).searchParams.get("days"));
  return (ALLOWED_DAYS as readonly number[]).includes(raw) ? raw : 30;
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

export async function GET(req: Request) {
  const gate = await requireAdmin();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  try {
    const result = await computeOemMatrix(parseDays(req));
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Failed to build matrix." }, { status: 500 });
  }
}
