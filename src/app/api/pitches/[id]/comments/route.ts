import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { getPortalAccess, isMarketingAllowed, isRoleAllowed } from "@/lib/portalAccess";
import { isSiteLive } from "@/lib/flags/server";
import { notifyInfoRequest, notifyInfoResponse, submitterEmail } from "@/lib/pitches/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================================
 * POST /api/pitches/[id]/comments — add to a pitch's two-way thread.
 *
 *   { body, kind? }  kind: 'comment' | 'info_response' (submitter)
 *                          'comment' | 'info_request'  (marketing)
 *
 * A marketing 'info_request' also moves the pitch to review_status='needs_info';
 * a submitter 'info_response' moves it back to 'pending' (§5.2). Insert goes
 * through the caller's scoped client so the RLS thread policy is what actually
 * decides who may write here.
 * ==========================================================================*/

function clean(v: unknown) {
  return String(v ?? "").trim();
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  // This route resolves access directly rather than through one of the shared
  // guards (it serves both submitters and reviewers), so the "Site live" kill
  // switch has to be checked explicitly here.
  if (!(await isSiteLive())) return NextResponse.json({ error: "Not available" }, { status: 404 });

  const access = await getPortalAccess();
  if (!access || !isRoleAllowed(access.level)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const payload = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const text = clean(payload.body);
  if (!text) return NextResponse.json({ error: "Write something first." }, { status: 400 });

  const supabase = await supabaseRoute();

  // RLS already scopes this select to marketing or the pitch's own submitter.
  const { data: idea, error: readErr } = await supabase
    .from("mkt_idea")
    .select("id, title, submitted_by, review_status, source")
    .eq("id", id)
    .maybeSingle();
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
  if (!idea) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const isReviewer = isMarketingAllowed(access.level, access.team) && access.fromInvite;
  const isSubmitter = (idea as { submitted_by: string | null }).submitted_by === access.userId;
  if (!isReviewer && !isSubmitter) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const requested = clean(payload.kind).toLowerCase();
  const kind = isReviewer
    ? requested === "info_request"
      ? "info_request"
      : "comment"
    : requested === "info_response"
      ? "info_response"
      : "comment";

  const { error: insErr } = await supabase.from("mkt_idea_comment").insert({
    idea_id: id,
    author_id: access.userId,
    author_team: isReviewer ? access.team ?? "marketing" : access.team,
    kind,
    body: text,
  });
  if (insErr) {
    if (/mkt_idea_comment/.test(insErr.message)) {
      return NextResponse.json(
        { error: "Comments aren't switched on yet — the database migration is still pending." },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: insErr.message }, { status: 500 });
  }

  // Move the review state with the conversation, and tell the other party.
  //
  // These transitions are driven by the state machine, not by the user, and go
  // through the service role on purpose: RLS makes mkt_idea updates
  // marketing-only, so a submitter's own client would silently match zero rows
  // and leave the pitch stuck in needs_info. Both branches are already behind
  // the reviewer/submitter check above.
  const title = (idea as { title: string }).title;
  if (kind === "info_request") {
    await supabaseAdmin.from("mkt_idea").update({ review_status: "needs_info" }).eq("id", id);
    await notifyInfoRequest({
      to: await submitterEmail((idea as { submitted_by: string | null }).submitted_by),
      title,
      question: text,
    });
  } else if (kind === "info_response") {
    // Only pull it back into the queue if it was actually waiting on the submitter.
    if ((idea as { review_status: string | null }).review_status === "needs_info") {
      await supabaseAdmin.from("mkt_idea").update({ review_status: "pending" }).eq("id", id);
    }
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("full_name")
      .eq("id", access.userId)
      .maybeSingle();
    await notifyInfoResponse({
      title,
      responderName: (prof as { full_name?: string } | null)?.full_name ?? access.email,
      body: text,
    });
  }

  return NextResponse.json({ ok: true });
}
