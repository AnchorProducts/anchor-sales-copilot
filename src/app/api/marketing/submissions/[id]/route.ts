import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/server";
import { requireMarketingUser } from "@/lib/portalAccess";
import { notifyApproved, notifyDeclined, submitterEmail } from "@/lib/pitches/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================================
 * PATCH /api/marketing/submissions/[id] — decide on a pitch (§5.2, §5.4).
 *
 *   { action: 'approve', planned_timeline }  → approved, placed on the board in
 *                                              "Considering", decision comment
 *   { action: 'decline', decline_reason }    → declined, decision comment
 *
 * "Request info" is not here — it is a thread event, handled by
 * POST /api/pitches/[id]/comments with kind='info_request'.
 *
 * Approve deliberately sets status='considering' so an approved pitch behaves
 * exactly like any other board idea from that point on (drag through the
 * pipeline, promote to campaign, AI review). The AI review therefore only ever
 * runs on approved pitches, never on pending ones.
 * ==========================================================================*/

function clean(v: unknown) {
  return String(v ?? "").trim();
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const access = await requireMarketingUser();
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = clean(body.action).toLowerCase();
  const timeline = clean(body.planned_timeline);
  const reason = clean(body.decline_reason);

  if (action !== "approve" && action !== "decline") {
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }
  if (action === "approve" && !timeline) {
    return NextResponse.json({ error: "Give the submitter a timeline." }, { status: 400 });
  }
  if (action === "decline" && !reason) {
    return NextResponse.json({ error: "A reason is required when declining." }, { status: 400 });
  }

  const supabase = await supabaseRoute();

  const { data: idea, error: readErr } = await supabase
    .from("mkt_idea")
    .select("id, title, source, submitted_by, review_status")
    .eq("id", id)
    .maybeSingle();
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
  if (!idea) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if ((idea as { source: string | null }).source !== "pitch") {
    return NextResponse.json({ error: "That isn't a pitch." }, { status: 400 });
  }

  const now = new Date().toISOString();
  const patch =
    action === "approve"
      ? {
          review_status: "approved",
          planned_timeline: timeline,
          decline_reason: null,
          // Auto-place on the board — from here it is an ordinary board idea.
          status: "considering",
          reviewed_by: access.userId,
          reviewed_at: now,
        }
      : {
          review_status: "declined",
          decline_reason: reason,
          reviewed_by: access.userId,
          reviewed_at: now,
        };

  const { error: updErr } = await supabase.from("mkt_idea").update(patch).eq("id", id);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  // A decision comment keeps the whole rationale in the thread.
  const decisionBody =
    action === "approve"
      ? `Approved. Planned timeline: ${timeline}`
      : `Declined. Reason: ${reason}`;
  await supabase.from("mkt_idea_comment").insert({
    idea_id: id,
    author_id: access.userId,
    author_team: access.team ?? "marketing",
    kind: "decision",
    body: decisionBody,
  });

  const title = (idea as { title: string }).title;
  const to = await submitterEmail((idea as { submitted_by: string | null }).submitted_by);
  if (action === "approve") await notifyApproved({ to, title, timeline });
  else await notifyDeclined({ to, title, reason });

  return NextResponse.json({ ok: true });
}
