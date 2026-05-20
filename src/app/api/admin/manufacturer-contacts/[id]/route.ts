import { NextRequest, NextResponse } from "next/server";
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

const EDITABLE_FIELDS = [
  "manufacturer",
  "first_name",
  "last_name",
  "full_name",
  "email",
  "phone",
  "cell",
  "title",
  "territory",
  "region",
] as const;

type EditableField = (typeof EDITABLE_FIELDS)[number];

function pickEditableFields(body: Record<string, unknown>): Partial<Record<EditableField, string | null>> {
  const out: Partial<Record<EditableField, string | null>> = {};
  for (const k of EDITABLE_FIELDS) {
    if (k in body) {
      const v = body[k];
      out[k] = typeof v === "string" ? v.trim() || null : null;
    }
  }
  return out;
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

  const fields = pickEditableFields(body);
  if (Object.keys(fields).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  // If manufacturer is in the payload, it must be non-empty.
  if ("manufacturer" in fields && !fields.manufacturer) {
    return NextResponse.json({ error: "Manufacturer cannot be empty." }, { status: 400 });
  }

  // Keep full_name in sync when first/last change but full_name wasn't supplied.
  if (!("full_name" in fields) && ("first_name" in fields || "last_name" in fields)) {
    const composed = [fields.first_name, fields.last_name].filter(Boolean).join(" ").trim();
    if (composed) fields.full_name = composed;
  }

  const { data, error } = await supabaseAdmin
    .from("manufacturer_contacts")
    .update(fields)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Contact not found." }, { status: 404 });
  return NextResponse.json({ contact: data });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const { error } = await supabaseAdmin
    .from("manufacturer_contacts")
    .delete()
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
