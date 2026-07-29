import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { requireInternalUser } from "@/lib/portalAccess";
import { IDEA_CATEGORIES } from "@/lib/marketing/ideaConstants";
import { notifyNewPitch } from "@/lib/pitches/notify";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ============================================================================
 * Pitch to Marketing — the submitter's own pitches (§5.3).
 *
 *   GET  → this user's pitches, newest first, each with its comment thread
 *   POST → submit a pitch  { title, description, category, notes? }
 *
 * Reads and writes go through the caller's own scoped client, so the RLS
 * carve-out added in 20260727_000001 is the real enforcement: a submitter can
 * only ever see or create their own pitches, never the rest of the board.
 * ==========================================================================*/

const VALID_CATEGORIES = new Set(IDEA_CATEGORIES.map((c) => c.value as string));

const SELECT =
  "id, title, description, category, status, source, review_status, submitter_team, " +
  "planned_timeline, decline_reason, reviewed_at, created_at";

function clean(v: unknown) {
  return String(v ?? "").trim();
}

export async function GET() {
  const access = await requireInternalUser();
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const supabase = await supabaseRoute();
  const { data, error } = await supabase
    .from("mkt_idea")
    .select(SELECT)
    .eq("source", "pitch")
    .eq("submitted_by", access.userId)
    .order("created_at", { ascending: false });

  if (error) {
    // The pitch columns land with migration 20260727_000001. Until it is applied
    // the feature reports itself as unavailable rather than 500-ing.
    if (/source|review_status|submitted_by/.test(error.message)) {
      return NextResponse.json({ pitches: [], threads: {}, unavailable: true });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const pitches = (data ?? []) as unknown as Array<{ id: string }>;
  const ids = pitches.map((p) => p.id);

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

  return NextResponse.json({ pitches, threads });
}

export async function POST(req: Request) {
  const access = await requireInternalUser();
  if (!access) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const title = clean(body.title);
  const description = clean(body.description);
  const category = clean(body.category).toLowerCase();
  const notes = clean(body.notes);

  if (!title) return NextResponse.json({ error: "Give your idea a title." }, { status: 400 });
  if (!description) return NextResponse.json({ error: "Describe the idea so marketing can review it." }, { status: 400 });
  if (category && !VALID_CATEGORIES.has(category)) {
    return NextResponse.json({ error: "Pick a valid category." }, { status: 400 });
  }

  // Supporting notes ride along in the description — the shared board renders one
  // description field, and a pitch must look like any other idea once approved.
  const fullDescription = notes ? `${description}\n\nSupporting notes:\n${notes}` : description;

  const supabase = await supabaseRoute();
  const { data, error } = await supabase
    .from("mkt_idea")
    .insert({
      title,
      description: fullDescription,
      category: category || "other",
      status: "inbox",
      priority: "medium",
      source: "pitch",
      review_status: "pending",
      submitted_by: access.userId,
      submitter_team: access.team,
      created_by: access.userId,
      tags: [],
    })
    .select(SELECT)
    .single();

  if (error) {
    if (/source|review_status|submitted_by/.test(error.message)) {
      return NextResponse.json(
        { error: "Pitching isn't switched on yet — the database migration is still pending." },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Best-effort notification to the marketing reviewers.
  const { data: prof } = await supabaseAdmin
    .from("profiles")
    .select("full_name")
    .eq("id", access.userId)
    .maybeSingle();
  await notifyNewPitch({
    title,
    category: category || null,
    submitterName: (prof as { full_name?: string } | null)?.full_name ?? access.email,
  });

  return NextResponse.json({ pitch: data });
}
