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
  "contact_type",
  "rep_kind",
  "company",
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

function pickManufacturers(body: Record<string, unknown>): string[] | null {
  if (!("manufacturers" in body)) return null;
  const raw = body.manufacturers;
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  for (const v of raw) {
    if (typeof v === "string") {
      const t = v.trim();
      if (t) seen.add(t);
    }
  }
  return Array.from(seen);
}

async function syncManufacturerLinks(contactId: string, manufacturers: string[]) {
  await supabaseAdmin
    .from("manufacturer_contact_manufacturers")
    .delete()
    .eq("contact_id", contactId);
  if (manufacturers.length > 0) {
    await supabaseAdmin
      .from("manufacturer_contact_manufacturers")
      .insert(manufacturers.map((m) => ({ contact_id: contactId, manufacturer: m })));
  }
}

export async function PUT(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

  const fields = pickEditableFields(body);
  let manufacturers = pickManufacturers(body);

  // Type-aware normalization, only when the caller sends a contact_type.
  // 'manufacturer_rep' is single-OEM; any other type is multi-OEM / company-keyed.
  let isRep: boolean | null = null;
  if ("contact_type" in fields) {
    const type =
      typeof fields.contact_type === "string" && fields.contact_type
        ? fields.contact_type
        : "manufacturer_rep";
    fields.contact_type = type;
    isRep = type === "manufacturer_rep";
    if (isRep) {
      // Reps carry a single OEM; clear any stale links.
      manufacturers = [];
    } else {
      // Multi-OEM types key off company; OEMs live in the link table.
      fields.manufacturer = null;
      fields.rep_kind = null; // sales/tech only applies to OEM reps
      if ("company" in fields && !fields.company) {
        return NextResponse.json({ error: "Company is required for this contact type." }, { status: 400 });
      }
    }
  }

  if (Object.keys(fields).length === 0 && manufacturers === null) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  // For reps, a supplied manufacturer must be non-empty.
  if (isRep !== false && "manufacturer" in fields && !fields.manufacturer) {
    return NextResponse.json({ error: "Manufacturer cannot be empty." }, { status: 400 });
  }

  // Keep full_name in sync when first/last change but full_name wasn't supplied.
  if (!("full_name" in fields) && ("first_name" in fields || "last_name" in fields)) {
    const composed = [fields.first_name, fields.last_name].filter(Boolean).join(" ").trim();
    if (composed) fields.full_name = composed;
  }

  let data: unknown = null;
  if (Object.keys(fields).length > 0) {
    const res = await supabaseAdmin
      .from("manufacturer_contacts")
      .update(fields)
      .eq("id", id)
      .select()
      .single();
    if (res.error) return NextResponse.json({ error: res.error.message }, { status: 500 });
    if (!res.data) return NextResponse.json({ error: "Contact not found." }, { status: 404 });
    data = res.data;
  }

  if (manufacturers !== null) {
    await syncManufacturerLinks(id, manufacturers);
  }

  return NextResponse.json({ contact: data ?? { id } });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAdmin();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  // Link rows are removed by the ON DELETE CASCADE on contact_id.
  const { error } = await supabaseAdmin
    .from("manufacturer_contacts")
    .delete()
    .eq("id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
