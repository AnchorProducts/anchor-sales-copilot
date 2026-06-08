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

// Return the activation state for every tool that has a row. Tools absent from
// the table are active by default, so the caller merges this against the code
// catalog (src/app/admin/cards.tsx).
export async function GET() {
  const gate = await requireAdmin();
  if ("error" in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const { data, error } = await supabaseAdmin
    .from("admin_tools")
    .select("key,active");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ tools: data || [] });
}

// Activate or deactivate a single tool. Upserts a row keyed by `key` so the
// choice persists; the hub hides any tool whose row is active = false.
export async function PATCH(req: Request) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "Server is missing SUPABASE_SERVICE_ROLE_KEY — admin updates cannot bypass RLS." },
      { status: 500 }
    );
  }

  const gate = await requireAdmin();
  if ("error" in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const body = await req.json().catch(() => ({}));
  const key = String(body.key || "").trim();
  if (!key) {
    return NextResponse.json({ error: "key is required" }, { status: 400 });
  }
  if (typeof body.active !== "boolean") {
    return NextResponse.json({ error: "active (boolean) is required" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("admin_tools")
    .upsert(
      { key, active: body.active, updated_at: new Date().toISOString() },
      { onConflict: "key" }
    )
    .select("key,active")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: error?.message || "Update failed" }, { status: 500 });
  }

  return NextResponse.json({ updated: true, key: data.key, active: data.active });
}
