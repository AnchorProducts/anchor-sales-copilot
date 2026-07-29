import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { LEAD_STATUS_KEYS, statusForAssignee } from "@/lib/leads/status";
import { isNetSuiteConfigured } from "@/lib/netsuite/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Two states only — see src/lib/leads/status.ts and the leads_status_check
// constraint. Status is derived from the assignee, never set on its own.
const STATUS_SET = new Set(LEAD_STATUS_KEYS);

function isInternalRole(role: string) {
  return role === "admin" || role === "anchor_rep";
}

async function getRole(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return String((data as any)?.role || "");
}

function clean(v: any) {
  return String(v || "").trim();
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await supabaseRoute();
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr || !auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const role = await getRole(auth.user.id);
    if (!isInternalRole(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await ctx.params;
    const leadId = clean(id);
    if (!leadId) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const { data, error } = await supabaseAdmin
      .from("leads")
      .select("*")
      .eq("id", leadId)
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Collect every attachment path on the lead and pre-sign them with
    // the service role. The browser client can't mint these because
    // storage RLS blocks reads on lead-uploads.
    type AttachmentRef = { path?: unknown };
    const paths = new Set<string>();
    const topAttachments = Array.isArray((data as { attachments?: unknown }).attachments)
      ? ((data as { attachments?: AttachmentRef[] }).attachments ?? [])
      : [];
    for (const a of topAttachments) {
      if (typeof a?.path === "string" && a.path) paths.add(a.path);
    }
    const solutions = Array.isArray((data as { solution_requests?: unknown }).solution_requests)
      ? ((data as { solution_requests?: Array<{ attachments?: AttachmentRef[] }> }).solution_requests ?? [])
      : [];
    for (const s of solutions) {
      for (const a of s?.attachments ?? []) {
        if (typeof a?.path === "string" && a.path) paths.add(a.path);
      }
    }

    const attachmentUrls: Record<string, string> = {};
    if (paths.size > 0) {
      const { data: signed } = await supabaseAdmin.storage
        .from("lead-uploads")
        .createSignedUrls(Array.from(paths), 60 * 30);
      for (const row of signed ?? []) {
        if (row?.path && row?.signedUrl) attachmentUrls[row.path] = row.signedUrl;
      }
    }

<<<<<<< HEAD
    return NextResponse.json({ lead: data, attachmentUrls });
=======
    // Tells the client whether to render the live NetSuite panel or the
    // "Coming soon" placeholder. Only the boolean crosses the wire — never the
    // credentials themselves.
    return NextResponse.json({
      lead: data,
      attachmentUrls,
      netsuiteConfigured: isNetSuiteConfigured(),
    });
>>>>>>> a793af67077ac9a21d787700dec76bb40baeba7e
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to load lead." }, { status: 500 });
  }
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await supabaseRoute();
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr || !auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const role = await getRole(auth.user.id);
    if (!isInternalRole(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { id } = await ctx.params;
    const leadId = clean(id);
    if (!leadId) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const status = clean(body?.status);
    const assigned_rep_user_id = clean(body?.assigned_rep_user_id) || null;
    const meeting_link = clean(body?.meeting_link) || null;

    const patch: Record<string, any> = { updated_at: new Date().toISOString() };

    // Assignment is the source of truth: setting or clearing the assignee moves
    // the status with it. A client-sent status is only honoured when assignment
    // isn't part of the same request, so the two can never end up disagreeing.
    if (body?.assigned_rep_user_id !== undefined) {
      patch.assigned_rep_user_id = assigned_rep_user_id;
      patch.status = statusForAssignee(assigned_rep_user_id);
    } else if (status) {
      if (!STATUS_SET.has(status)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }
      patch.status = status;
    }
    if (body?.meeting_link !== undefined) patch.meeting_link = meeting_link;

    const { data, error } = await supabaseAdmin
      .from("leads")
      .update(patch)
      .eq("id", leadId)
      .select("*")
      .maybeSingle();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ lead: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to update lead." }, { status: 500 });
  }
}

/* ----------------------------------------------------------------------------
 * DELETE — permanently remove a consult and its uploaded files. ADMIN ONLY:
 * anchor_reps can work the queue but can't destroy submissions.
 *
 * There is no undo and no soft-delete column, so the UI confirms first. Files
 * are removed before the row, because the row is the only record of where they
 * live — losing it first would orphan them in the bucket forever.
 * --------------------------------------------------------------------------*/
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const supabase = await supabaseRoute();
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr || !auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    if ((await getRole(auth.user.id)) !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { id } = await ctx.params;
    const leadId = clean(id);
    if (!leadId) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const { data: lead, error: readErr } = await supabaseAdmin
      .from("leads")
      .select("id, attachments, solution_requests")
      .eq("id", leadId)
      .maybeSingle();

    if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });
    if (!lead) return NextResponse.json({ error: "Consult not found." }, { status: 404 });

    // Attachments live in two shapes: a flat top-level array, and a per-solution
    // array inside solution_requests. Collect both, de-duplicated.
    const row = lead as { attachments?: unknown; solution_requests?: unknown };
    const paths = new Set<string>();
    const collect = (list: unknown) => {
      if (!Array.isArray(list)) return;
      for (const a of list) {
        const p = clean((a as { path?: unknown } | null)?.path);
        if (p) paths.add(p);
      }
    };
    collect(row.attachments);
    if (Array.isArray(row.solution_requests)) {
      for (const s of row.solution_requests) {
        collect((s as { attachments?: unknown } | null)?.attachments);
      }
    }

    // A storage failure must not block the delete — the row is what the admin
    // asked to remove. Report leftovers instead of silently swallowing them.
    let orphanedFiles = 0;
    if (paths.size > 0) {
      const { error: rmErr } = await supabaseAdmin.storage
        .from("lead-uploads")
        .remove([...paths]);
      if (rmErr) orphanedFiles = paths.size;
    }

    const { error: delErr } = await supabaseAdmin.from("leads").delete().eq("id", leadId);
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 });

    return NextResponse.json({ ok: true, deletedFiles: paths.size - orphanedFiles, orphanedFiles });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to delete consult." }, { status: 500 });
  }
}
