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

function normalizeStates(input: any): string[] {
  if (Array.isArray(input)) {
    return input.map((s) => clean(s).toUpperCase()).filter(Boolean);
  }
  return clean(input)
    .toUpperCase()
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function GET() {
  const gate = await requireAdmin();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const { data, error } = await supabaseAdmin
    .from("sales_reps")
    .select("id, outside_sales_name, outside_sales_email, phone, teams_link, states, created_at, updated_at")
    .order("outside_sales_name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ reps: data || [] });
}

export async function POST(req: Request) {
  const gate = await requireAdmin();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const body = await req.json().catch(() => ({}));
  const outsideName = clean(body?.outside_sales_name);
  const outsideEmail = clean(body?.outside_sales_email).toLowerCase();
  if (!outsideName || !outsideEmail) {
    return NextResponse.json({ error: "Outside sales name and email are required." }, { status: 400 });
  }

  const row = {
    outside_sales_name: outsideName,
    outside_sales_email: outsideEmail,
    phone: clean(body?.phone) || null,
    teams_link: clean(body?.teams_link) || null,
    states: normalizeStates(body?.states),
  };

  const { data, error } = await supabaseAdmin
    .from("sales_reps")
    .insert(row)
    .select("id")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: data?.id });
}

export async function PATCH(req: Request) {
  const gate = await requireAdmin();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const body = await req.json().catch(() => ({}));
  const id = clean(body?.id);
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const update: Record<string, any> = { updated_at: new Date().toISOString() };
  if ("outside_sales_name" in body) update.outside_sales_name = clean(body.outside_sales_name) || null;
  if ("outside_sales_email" in body) update.outside_sales_email = clean(body.outside_sales_email).toLowerCase() || null;
  if ("phone" in body) update.phone = clean(body.phone) || null;
  if ("teams_link" in body) update.teams_link = clean(body.teams_link) || null;
  if ("states" in body) update.states = normalizeStates(body.states);

  const { error } = await supabaseAdmin.from("sales_reps").update(update).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const gate = await requireAdmin();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });

  const { error } = await supabaseAdmin.from("sales_reps").delete().eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
