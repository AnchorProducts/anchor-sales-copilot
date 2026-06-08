import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { DEFAULT_ROOFTOP_SYSTEM_PROMPT } from "@/lib/rooftop/assessmentPrompt";

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

// Return the current prompt and whether it's a saved override or the built-in
// default, plus the default itself so the editor can offer "reset to default".
export async function GET() {
  const gate = await requireAdmin();
  if ("error" in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const { data } = await supabaseAdmin
    .from("rooftop_assessment_config")
    .select("system_prompt,updated_at")
    .eq("id", 1)
    .maybeSingle();

  const override = String((data as { system_prompt?: string } | null)?.system_prompt || "").trim();
  return NextResponse.json({
    prompt: override || DEFAULT_ROOFTOP_SYSTEM_PROMPT,
    isCustom: override.length > 0,
    default: DEFAULT_ROOFTOP_SYSTEM_PROMPT,
    updatedAt: (data as { updated_at?: string } | null)?.updated_at ?? null,
  });
}

// Save an override prompt. Passing an empty/whitespace prompt clears the
// override (the audit reverts to the built-in default).
export async function PUT(req: Request) {
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
  const prompt = typeof body.prompt === "string" ? body.prompt.trim() : "";

  const { error } = await supabaseAdmin
    .from("rooftop_assessment_config")
    .upsert(
      { id: 1, system_prompt: prompt || null, updated_at: new Date().toISOString() },
      { onConflict: "id" }
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ saved: true, isCustom: prompt.length > 0 });
}
