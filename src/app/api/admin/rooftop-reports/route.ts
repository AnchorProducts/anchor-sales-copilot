import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireAdmin() {
  const supabase = await supabaseRoute();
  const { data: auth, error } = await supabase.auth.getUser();
  if (error || !auth?.user) return { error: "Unauthorized", status: 401 as const };

  const { data: prof } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", auth.user.id)
    .maybeSingle();

  const role = String((prof as any)?.role || "");
  if (role !== "admin") return { error: "Forbidden", status: 403 as const };
  return { user: auth.user };
}

export async function GET() {
  const gate = await requireAdmin();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const { data: reports, error } = await supabaseAdmin
    .from("assessment_reports")
    .select("id, contractor_name, company_name, access_type, created_at, file_url, flags_count, user_id")
    .order("created_at", { ascending: false });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Join submitter info from profiles
  const userIds = Array.from(new Set((reports || []).map((r: any) => r.user_id).filter(Boolean)));
  const profilesById: Record<string, { email: string | null; full_name: string | null; company: string | null }> = {};

  if (userIds.length > 0) {
    const { data: profs } = await supabaseAdmin
      .from("profiles")
      .select("id, email, full_name, company")
      .in("id", userIds);

    for (const p of profs || []) {
      profilesById[(p as any).id] = {
        email: (p as any).email || null,
        full_name: (p as any).full_name || null,
        company: (p as any).company || null,
      };
    }
  }

  const enriched = (reports || []).map((r: any) => ({
    ...r,
    submitter_email: profilesById[r.user_id]?.email || null,
    submitter_name: profilesById[r.user_id]?.full_name || null,
    submitter_company: profilesById[r.user_id]?.company || null,
  }));

  return NextResponse.json({ reports: enriched });
}
