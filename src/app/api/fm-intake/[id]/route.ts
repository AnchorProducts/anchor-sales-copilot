import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isFmIntakeStatus } from "@/lib/fmIntake";

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

// GET — one submission in full, with signed URLs for its attachments. Admin only.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const supabase = await supabaseRoute();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if ((await getRole(auth.user.id)) !== "admin") {
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

    let reviewer: string | null = null;
    if (row.reviewed_by) {
      const { data: p } = await supabaseAdmin
        .from("profiles")
        .select("full_name,email")
        .eq("id", row.reviewed_by)
        .maybeSingle();
      reviewer = clean((p as any)?.full_name) || clean((p as any)?.email) || null;
    }

    return NextResponse.json({ submission: { ...row, attachments, reviewed_by_name: reviewer } });
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

    if (body.status !== undefined) {
      const status = clean(body.status);
      if (!isFmIntakeStatus(status)) {
        return NextResponse.json({ error: "Invalid status." }, { status: 400 });
      }
      updates.status = status;
    }
    if (body.review_notes !== undefined) {
      updates.review_notes = clean(body.review_notes) || null;
    }
    if (body.status === undefined && body.review_notes === undefined) {
      return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("fm_intake_submissions")
      .update(updates)
      .eq("id", clean(id))
      .select("id,status,review_notes,reviewed_at")
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Submission not found." }, { status: 404 });

    return NextResponse.json({ ok: true, submission: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to update submission." }, { status: 500 });
  }
}
