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

type ContactRow = {
  id: string;
  manufacturer: string | null;
  contact_type: string;
  rep_kind: string | null;
  company: string | null;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  cell: string | null;
  title: string | null;
  territory: string | null;
  region: string | null;
  created_at: string;
};

type ProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  role: string | null;
  company: string | null;
  created_at: string | null;
};

type EventRow = {
  user_id: string;
  event_type: string;
  page_path: string | null;
  created_at: string;
};

type Activity = {
  total7: number;
  total30: number;
  lastSeen: string | null;
  topPages: Array<{ path: string; count: number }>;
};

export async function GET() {
  const gate = await requireAdmin();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const { data: contactsData, error: contactsErr } = await supabaseAdmin
    .from("manufacturer_contacts")
    .select(
      "id, manufacturer, contact_type, rep_kind, company, first_name, last_name, full_name, email, phone, cell, title, territory, region, created_at"
    )
    .order("manufacturer", { ascending: true, nullsFirst: false })
    .order("last_name", { ascending: true });

  if (contactsErr) {
    return NextResponse.json({ error: contactsErr.message }, { status: 500 });
  }

  const contacts = (contactsData ?? []) as ContactRow[];

  // Consultant ↔ OEM links (many-to-many). Reps use their `manufacturer`
  // column instead, so they have no link rows.
  const linksByContact = new Map<string, string[]>();
  {
    const { data: links, error: linksErr } = await supabaseAdmin
      .from("manufacturer_contact_manufacturers")
      .select("contact_id, manufacturer");
    if (linksErr) {
      return NextResponse.json({ error: linksErr.message }, { status: 500 });
    }
    for (const l of (links ?? []) as Array<{ contact_id: string; manufacturer: string }>) {
      const list = linksByContact.get(l.contact_id) ?? [];
      list.push(l.manufacturer);
      linksByContact.set(l.contact_id, list);
    }
  }
  const emails = Array.from(
    new Set(
      contacts
        .map((c) => (c.email || "").toLowerCase())
        .filter((e) => e.length > 0)
    )
  );

  // Pull profiles matching any of those emails (lowercased compare).
  const profileByEmail = new Map<string, ProfileRow>();
  if (emails.length > 0) {
    const { data: profiles, error: profErr } = await supabaseAdmin
      .from("profiles")
      .select("id, email, full_name, role, company, created_at")
      .in("email", emails);
    if (profErr) {
      return NextResponse.json({ error: profErr.message }, { status: 500 });
    }
    for (const p of (profiles ?? []) as ProfileRow[]) {
      const key = (p.email || "").toLowerCase();
      if (key) profileByEmail.set(key, p);
    }
  }

  // For the matched profiles, aggregate the last 30 days of events.
  const matchedUserIds = Array.from(profileByEmail.values()).map((p) => p.id);
  const activityByUserId = new Map<string, Activity>();

  if (matchedUserIds.length > 0) {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: events, error: evErr } = await supabaseAdmin
      .from("user_events")
      .select("user_id, event_type, page_path, created_at")
      .in("user_id", matchedUserIds)
      .gte("created_at", thirtyDaysAgo);
    if (evErr) {
      return NextResponse.json({ error: evErr.message }, { status: 500 });
    }

    const sevenDayCutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const pageCounts: Record<string, Record<string, number>> = {};
    for (const e of (events ?? []) as EventRow[]) {
      const agg = activityByUserId.get(e.user_id) ?? {
        total7: 0,
        total30: 0,
        lastSeen: null,
        topPages: [],
      };
      agg.total30 += 1;
      if (new Date(e.created_at).getTime() >= sevenDayCutoff) agg.total7 += 1;
      if (!agg.lastSeen || e.created_at > agg.lastSeen) agg.lastSeen = e.created_at;
      if (e.page_path) {
        const pc = (pageCounts[e.user_id] ??= {});
        pc[e.page_path] = (pc[e.page_path] ?? 0) + 1;
      }
      activityByUserId.set(e.user_id, agg);
    }
    for (const [uid, agg] of activityByUserId) {
      const pc = pageCounts[uid] ?? {};
      agg.topPages = Object.entries(pc)
        .map(([path, count]) => ({ path, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);
    }
  }

  const enriched = contacts.map((c) => {
    const email = (c.email || "").toLowerCase();
    const profile = email ? profileByEmail.get(email) ?? null : null;
    const activity = profile ? activityByUserId.get(profile.id) ?? null : null;
    // A rep's OEM is their `manufacturer` column; a consultant's OEMs come from
    // the link table. `manufacturers` is the unified list used for filtering.
    const linked = linksByContact.get(c.id) ?? [];
    const manufacturers =
      c.contact_type === "consultant" ? linked : c.manufacturer ? [c.manufacturer] : [];
    return {
      ...c,
      manufacturers,
      signed_up: !!profile,
      profile_id: profile?.id ?? null,
      profile_role: profile?.role ?? null,
      profile_created_at: profile?.created_at ?? null,
      activity,
    };
  });

  // Distinct OEMs across both rep manufacturers and consultant links.
  const oemSet = new Set<string>();
  for (const c of enriched) for (const m of c.manufacturers) oemSet.add(m);

  return NextResponse.json({
    contacts: enriched,
    counts: {
      total: contacts.length,
      withEmail: contacts.filter((c) => !!c.email).length,
      signedUp: enriched.filter((c) => c.signed_up).length,
      manufacturers: oemSet.size,
      reps: contacts.filter((c) => c.contact_type !== "consultant").length,
      consultants: contacts.filter((c) => c.contact_type === "consultant").length,
    },
  });
}

// Editable scalar fields on a contact. Restricting on the server keeps callers
// from setting `id` / `created_at` / `raw` directly. The consultant ↔ OEM links
// are handled separately via the `manufacturers` array.
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

// Normalize the `manufacturers` link array from the body: trimmed, de-duped,
// non-empty. Returns null when the key is absent (so PUT can skip touching links).
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

// Replace the link rows for a consultant contact. Reps carry their single OEM
// in the `manufacturer` column, so their links are always cleared.
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

export async function POST(req: NextRequest) {
  const gate = await requireAdmin();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

  const fields = pickEditableFields(body);
  // contact_type is free-text; only 'manufacturer_rep' is single-OEM. Everything
  // else (consultant, contractor, any custom type) is a multi-OEM, company-keyed
  // contact whose OEMs live in the link table.
  const type =
    typeof fields.contact_type === "string" && fields.contact_type
      ? fields.contact_type
      : "manufacturer_rep";
  fields.contact_type = type;
  const isRep = type === "manufacturer_rep";

  const manufacturers = pickManufacturers(body) ?? [];

  if (isRep) {
    if (!fields.manufacturer) {
      return NextResponse.json({ error: "Manufacturer is required for a rep." }, { status: 400 });
    }
  } else {
    if (!fields.company) {
      return NextResponse.json({ error: "Company is required for this contact type." }, { status: 400 });
    }
    fields.manufacturer = null;
    fields.rep_kind = null; // sales/tech only applies to OEM reps
  }

  // Derive full_name when not provided, from first + last.
  if (!fields.full_name) {
    const composed = [fields.first_name, fields.last_name].filter(Boolean).join(" ").trim();
    if (composed) fields.full_name = composed;
  }

  const { data, error } = await supabaseAdmin
    .from("manufacturer_contacts")
    .insert(fields)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  if (!isRep) {
    await syncManufacturerLinks((data as { id: string }).id, manufacturers);
  }

  return NextResponse.json({ contact: data });
}
