import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isFmIntakeStatus, statusForAssignee } from "@/lib/fmIntake";
import { isNetSuiteConfigured } from "@/lib/netsuite/config";
import { resolveStatesForUser } from "@/lib/sales/regions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "knowledge";
const clean = (v: unknown) => String(v ?? "").trim();

async function getRole(userId: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  return clean((data as { role?: string } | null)?.role);
}

// GET — one submission in full, with signed URLs for its attachments. Admin sees
// any; an internal (anchor_rep) sees one only if it's in their assigned states.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const supabase = await supabaseRoute();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const role = await getRole(auth.user.id);
    if (role !== "admin" && role !== "anchor_rep") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data, error } = await supabaseAdmin
      .from("fm_intake_submissions")
      .select("*")
      .eq("id", clean(id))
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Submission not found." }, { status: 404 });

    const row = data as any;

    // Territory gate for scoped reps: only their states' intakes.
    if (role === "anchor_rep") {
      const repStates = await resolveStatesForUser(auth.user.id);
      const region = clean(row.region_code).toUpperCase();
      if (!region || !repStates.includes(region)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }
    const attachments = await Promise.all(
      (Array.isArray(row.attachments) ? row.attachments : []).map(async (a: any) => {
        const path = clean(a?.path);
        let url: string | null = null;
        if (path) {
          const { data: signed } = await supabaseAdmin.storage
            .from(BUCKET)
            .createSignedUrl(path, 60 * 60);
          url = signed?.signedUrl || null;
        }
        return {
          path,
          filename: clean(a?.filename) || path.split("/").pop() || "file",
          content_type: clean(a?.content_type) || "application/octet-stream",
          size: a?.size || 0,
          url,
        };
      })
    );

    const nameFor = async (userId: unknown): Promise<string | null> => {
      if (!userId) return null;
      const { data: p } = await supabaseAdmin
        .from("profiles")
        .select("full_name,email")
        .eq("id", userId as string)
        .maybeSingle();
      return clean((p as any)?.full_name) || clean((p as any)?.email) || null;
    };

    const [reviewer, assignee] = await Promise.all([
      nameFor(row.reviewed_by),
      nameFor(row.assigned_rep_user_id),
    ]);

    return NextResponse.json({
      submission: {
        ...row,
        attachments,
        reviewed_by_name: reviewer,
        assigned_rep_name: assignee,
      },
      // Tells the client whether to render the live NetSuite panel or the
      // "Coming soon" placeholder. Only the boolean crosses the wire.
      netsuiteConfigured: isNetSuiteConfigured(),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to load submission." }, { status: 500 });
  }
}

// PATCH — record the admin decision: status and/or review notes. Admin only.
export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const supabase = await supabaseRoute();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if ((await getRole(auth.user.id)) !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

    const updates: Record<string, unknown> = {
      reviewed_by: auth.user.id,
      reviewed_at: new Date().toISOString(),
    };

    // Assignment is the source of truth: setting or clearing the assignee moves
    // the status with it. A client-sent status is only honoured when assignment
    // isn't part of the same request, so the two can never end up disagreeing.
    if (body.assigned_rep_user_id !== undefined) {
      const assignee = clean(body.assigned_rep_user_id) || null;
      updates.assigned_rep_user_id = assignee;
      updates.status = statusForAssignee(assignee);
    } else if (body.status !== undefined) {
      const status = clean(body.status);
      if (!isFmIntakeStatus(status)) {
        return NextResponse.json({ error: "Invalid status." }, { status: 400 });
      }
      updates.status = status;
    }
    if (body.review_notes !== undefined) {
      updates.review_notes = clean(body.review_notes) || null;
    }
    if (
      body.status === undefined &&
      body.review_notes === undefined &&
      body.assigned_rep_user_id === undefined
    ) {
      return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("fm_intake_submissions")
      .update(updates)
      .eq("id", clean(id))
      .select("id,status,review_notes,reviewed_at,assigned_rep_user_id")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Submission not found." }, { status: 404 });

    return NextResponse.json({ ok: true, submission: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to update submission." }, { status: 500 });
  }
}

/* ----------------------------------------------------------------------------
 * DELETE — permanently remove a Project Intake and its uploaded files. Admin
 * only, matching the consult side.
 *
 * No undo, no soft-delete column, so the UI confirms first. Files go before the
 * row, since the row is the only record of where they live.
 * --------------------------------------------------------------------------*/
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const supabase = await supabaseRoute();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if ((await getRole(auth.user.id)) !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const intakeId = clean(id);
    if (!intakeId) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const { data: row, error: readErr } = await supabaseAdmin
      .from("fm_intake_submissions")
      .select("id, attachments")
      .eq("id", intakeId)
      .maybeSingle();

    if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
    if (!row) return NextResponse.json({ error: "Submission not found." }, { status: 404 });

    const paths = (Array.isArray((row as any).attachments) ? (row as any).attachments : [])
      .map((a: any) => clean(a?.path))
      .filter(Boolean);

    // A storage failure must not block the delete — report leftovers instead.
    let orphanedFiles = 0;
    if (paths.length > 0) {
      const { error: rmErr } = await supabaseAdmin.storage.from(BUCKET).remove(paths);
      if (rmErr) orphanedFiles = paths.length;
    }

    const { error: delErr } = await supabaseAdmin
      .from("fm_intake_submissions")
      .delete()
      .eq("id", intakeId);
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

    return NextResponse.json({
      ok: true,
      deletedFiles: paths.length - orphanedFiles,
      orphanedFiles,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to delete submission." }, { status: 500 });
  }
}
