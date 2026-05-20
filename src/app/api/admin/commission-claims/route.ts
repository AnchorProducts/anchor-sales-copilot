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
  const role = String((prof as { role?: string } | null)?.role || "");
  if (role !== "admin") return { error: "Forbidden", status: 403 as const };

  return { user: auth.user };
}

export async function GET() {
  const gate = await requireAdmin();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const { data, error } = await supabaseAdmin
    .from("commission_claims")
    .select(
      "id, created_at, created_by, status, " +
      "rep_name, rep_company, rep_phone, rep_email, " +
      "certified, unaware_other_salesperson, additional_salespeople, " +
      "estimated_order_date, job_name, company_placing_order, " +
      "order_city, order_state, u_anchors_ordered, qty, " +
      "roof_type, roof_brand, other_items, " +
      "ship_to_address, ship_city, ship_state, ship_zip, " +
      "project_description"
    )
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: error.message, code: error.code, hint: error.hint },
      { status: 500 }
    );
  }

  return NextResponse.json({ claims: data || [] });
}
