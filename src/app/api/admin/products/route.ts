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

function clean(v: any) {
  return String(v || "").trim();
}

export async function POST(req: Request) {
  const gate = await requireAdmin();
  if ("error" in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const body = await req.json().catch(() => ({}));
  const name = clean(body.name);
  const section = clean(body.section) || "solution";
  const series = clean(body.series) || null;
  const sku = clean(body.sku) || null;

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }
  if (!["solution", "anchor", "internal_assets"].includes(section)) {
    return NextResponse.json({ error: "invalid section" }, { status: 400 });
  }

  // If a row with this name already exists, return its id (case-insensitive).
  const { data: existing } = await supabaseAdmin
    .from("products")
    .select("id")
    .ilike("name", name)
    .maybeSingle();

  if (existing?.id) {
    return NextResponse.json({ id: existing.id, created: false });
  }

  const { data, error: insertErr } = await supabaseAdmin
    .from("products")
    .insert({ name, section, series, sku, active: true })
    .select("id")
    .single();

  if (insertErr || !data?.id) {
    return NextResponse.json(
      { error: insertErr?.message || "Failed to create product" },
      { status: 500 }
    );
  }

  return NextResponse.json({ id: data.id, created: true });
}
