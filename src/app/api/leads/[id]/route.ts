import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS_SET = new Set([
  "new",
  "assigned",
  "contacted",
  "qualified",
  "closed_won",
  "closed_lost",
]);

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

    return NextResponse.json({ lead: data });
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
    if (status) {
      if (!STATUS_SET.has(status)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }
      patch.status = status;
    }
    if (body?.assigned_rep_user_id !== undefined) patch.assigned_rep_user_id = assigned_rep_user_id;
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
