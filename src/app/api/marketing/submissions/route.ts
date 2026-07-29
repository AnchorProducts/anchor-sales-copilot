import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { marketingAccessDenial } from "@/lib/portalAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================================
 * GET /api/marketing/submissions — the Strategy Board "Submissions" inbox (§5.4).
 *
 * Pitches awaiting a decision (review_status pending | needs_info), newest
 * first, each with its thread and the submitter's name. Same query the portal's
 * inbox runs — they share the table.
 *
 * ?all=1 includes already-decided pitches, for the reviewed history view.
 * ==========================================================================*/

const SELECT =
  "id, title, description, category, status, source, review_status, submitted_by, submitter_team, " +
  "planned_timeline, decline_reason, reviewed_by, reviewed_at, created_at";

export async function GET(req: Request) {
  const denial = await marketingAccessDenial();
  if (denial) return NextResponse.json({ error: "Forbidden", reason: denial }, { status: 403 });

  const includeAll = new URL(req.url).searchParams.get("all") === "1";
  const supabase = await supabaseRoute();

  let query = supabase.from("mkt_idea").select(SELECT).eq("source", "pitch");
  if (!includeAll) query = query.in("review_status", ["pending", "needs_info"]);

  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) {
    if (/source|review_status|submitted_by/.test(error.message)) {
      return NextResponse.json({ submissions: [], threads: {}, submitters: {}, unavailable: true });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const submissions = (data ?? []) as unknown as Array<{ id: string; submitted_by: string | null }>;
  const ids = submissions.map((s) => s.id);

  const threads: Record<string, unknown[]> = {};
  if (ids.length) {
    const { data: comments } = await supabase
      .from("mkt_idea_comment")
      .select("id, idea_id, author_id, author_team, kind, body, created_at")
      .in("idea_id", ids)
      .order("created_at", { ascending: true });
    for (const c of (comments ?? []) as Array<{ idea_id: string }>) {
      (threads[c.idea_id] ??= []).push(c);
    }
  }

  // Submitter names for display. profiles is service-role read (RLS-blocked to
  // the anon key) and this is already behind the marketing guard.
  const submitters: Record<string, string> = {};
  const userIds = Array.from(new Set(submissions.map((s) => s.submitted_by).filter(Boolean) as string[]));
  if (userIds.length) {
    const { data: profs } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name, email")
      .in("id", userIds);
    for (const p of (profs ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>) {
      submitters[p.id] = p.full_name || p.email || "Unknown";
    }
  }

  return NextResponse.json({ submissions, threads, submitters });
}
