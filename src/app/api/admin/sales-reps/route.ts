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

function normalizeKind(input: any): "internal" | "external" {
  return clean(input).toLowerCase() === "internal" ? "internal" : "external";
}

// 3-digit ZIP prefixes. Accepts an array or comma/space-separated string.
function normalizeZipPrefixes(input: any): string[] {
  const raw = Array.isArray(input) ? input : clean(input).split(/[,\s]+/);
  return raw
    .map((s) => String(s || "").replace(/\D/g, "").slice(0, 3))
    .filter((s) => s.length === 3);
}

export async function GET() {
  const gate = await requireAdmin();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const { data, error } = await supabaseAdmin
    .from("sales_reps")
    .select("id, kind, name, email, teams_link, states, zip_prefixes, created_at, updated_at")
    .order("name");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ reps: data || [] });
}

export async function POST(req: Request) {
  const gate = await requireAdmin();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const body = await req.json().catch(() => ({}));
  const name = clean(body?.name);
  const email = clean(body?.email).toLowerCase();
  if (!name || !email) {
    return NextResponse.json({ error: "Name and email are required." }, { status: 400 });
  }

  const kind = normalizeKind(body?.kind);
  const row = {
    kind,
    name,
    email,
    // Internal reps route by email only; they never need a Teams link.
    teams_link: kind === "internal" ? null : clean(body?.teams_link) || null,
    states: normalizeStates(body?.states),
    zip_prefixes: normalizeZipPrefixes(body?.zip_prefixes),
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
  if ("kind" in body) update.kind = normalizeKind(body.kind);
  if ("name" in body) update.name = clean(body.name) || null;
  if ("email" in body) update.email = clean(body.email).toLowerCase() || null;
  if ("teams_link" in body) update.teams_link = clean(body.teams_link) || null;
  if ("states" in body) update.states = normalizeStates(body.states);
  if ("zip_prefixes" in body) update.zip_prefixes = normalizeZipPrefixes(body.zip_prefixes);
  // Internal reps never carry a Teams link, regardless of what was submitted.
  if (update.kind === "internal") update.teams_link = null;

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
