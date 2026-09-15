// Admin: what goes in every pre-assembled pizza box besides the anchor and its
// series' pieces — the printables packed into each one.
//
//   GET  → { extras: [{ item_id, quantity }] }
//   POST { extras: [{ item_id, quantity }] } → { ok, extras }   replaces the list.
//
// Inventory writers (admins + inside reps) set it: they're the ones packing the
// boxes. Stored in app_settings — see lib/settings/pizzaBoxExtras.

import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { clean, getInventoryProfile, canWriteInventory } from "@/lib/inventory/server";
import { isBoxType } from "@/lib/inventory";
import { PIZZA_BOX_EXTRAS_KEY, parseBoxExtras } from "@/lib/settings/pizzaBoxExtras";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireWriter() {
  const supabase = await supabaseRoute();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth?.user) return { error: "Unauthorized", status: 401 as const };
  const profile = await getInventoryProfile(auth.user.id);
  if (!canWriteInventory(clean(profile?.role))) return { error: "Forbidden", status: 403 as const };
  return { user: auth.user };
}

export async function GET() {
  try {
    const gate = await requireWriter();
    if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

    const { data, error } = await supabaseAdmin
      .from("app_settings")
      .select("value")
      .eq("key", PIZZA_BOX_EXTRAS_KEY)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ extras: parseBoxExtras((data as any)?.value) });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to load box contents." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const gate = await requireWriter();
    if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const extras = parseBoxExtras({ items: body?.extras });

    if (extras.length) {
      const { data: rows, error } = await supabaseAdmin
        .from("marketing_inventory_items")
        .select("id,name,pizza_box,packaging_kit,packaging_role")
        .in(
          "id",
          extras.map((e) => e.item_id)
        );
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      const byId = new Map(((rows || []) as any[]).map((r) => [r.id as string, r]));
      for (const e of extras) {
        const row = byId.get(e.item_id);
        if (!row) return NextResponse.json({ error: "One of those items no longer exists." }, { status: 400 });
        // A kit piece is already in every box, and an anchor IS a box — packing
        // either as an extra would subtract it twice on every scan.
        if (row.packaging_role || isBoxType(row)) {
          return NextResponse.json({ error: `${clean(row.name)} is already part of the box.` }, { status: 400 });
        }
      }
    }

    const { error } = await supabaseAdmin.from("app_settings").upsert(
      {
        key: PIZZA_BOX_EXTRAS_KEY,
        value: { items: extras },
        updated_at: new Date().toISOString(),
        updated_by: gate.user.id,
      },
      { onConflict: "key" }
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, extras });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to save box contents." }, { status: 500 });
  }
}
