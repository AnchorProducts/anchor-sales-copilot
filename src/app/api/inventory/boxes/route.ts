// Admin: assemble pizza boxes, or unbox them.
//
//   POST { anchor_id, quantity }
//     quantity > 0 assembles that many boxes of the anchor; quantity < 0 unboxes.
//     → { ok, boxes, ready, short: [{ name, short }] }
//
// Assembling reserves a box's contents: the anchor, its series' pieces and the
// printables every box gets come off their loose counts, and the box goes on
// its own ready count — an inventory item pointing at the anchor through
// box_of, created the first time that anchor is assembled. Unboxing is the
// reverse, and can only open boxes that are on the ready count.
//
// Boxes that were physically built get recorded even when a count says the
// parts weren't there: the count stops at 0 and the shortfall comes back so
// someone recounts. Inventory writers (admins + inside reps) only.

import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  canWriteInventory,
  clean,
  getInventoryProfile,
  loadBoxCatalog,
  shiftStock,
} from "@/lib/inventory/server";
import { boxParts, findReadyBox, isBoxType, readyBoxName } from "@/lib/inventory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BOXES = 1000; // sanity ceiling per request

export async function POST(req: Request) {
  try {
    const supabase = await supabaseRoute();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const profile = await getInventoryProfile(auth.user.id);
    if (!canWriteInventory(clean(profile?.role))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const anchorId = clean(body?.anchor_id);
    const requested = Math.floor(Number(body?.quantity));
    if (!anchorId || !Number.isFinite(requested) || requested === 0) {
      return NextResponse.json({ error: "Say how many boxes." }, { status: 400 });
    }
    if (Math.abs(requested) > MAX_BOXES) {
      return NextResponse.json({ error: "That's more boxes than one go can hold." }, { status: 400 });
    }

    const { catalog, extras, hasBoxOf } = await loadBoxCatalog();
    if (!hasBoxOf) {
      return NextResponse.json(
        { error: "Assembled boxes aren't switched on yet — run the 20260915_000002 migration." },
        { status: 503 }
      );
    }

    const anchor = catalog.find((i) => i.id === anchorId);
    if (!anchor || !isBoxType(anchor)) {
      return NextResponse.json({ error: "That anchor isn't set up as a pizza box." }, { status: 400 });
    }

    let box: { id: string; name: string } | null = findReadyBox(catalog, anchor.id);
    if (!box) {
      if (requested < 0) {
        return NextResponse.json({ error: "There are no assembled boxes of that to unbox." }, { status: 400 });
      }
      const { data: created, error: createErr } = await supabaseAdmin
        .from("marketing_inventory_items")
        .insert({
          name: readyBoxName(anchor.name),
          category: "samples",
          quantity_available: 0,
          low_stock_threshold: 0,
          location: anchor.location,
          box_of: anchor.id,
        })
        .select("id,name")
        .single();
      if (created) {
        box = created as { id: string; name: string };
      } else {
        // Someone assembled the first box of this anchor a moment ago.
        const { data: again } = await supabaseAdmin
          .from("marketing_inventory_items")
          .select("id,name")
          .eq("box_of", anchor.id)
          .maybeSingle();
        if (!again) {
          return NextResponse.json({ error: createErr?.message || "Couldn't create the box item." }, { status: 500 });
        }
        box = again as { id: string; name: string };
      }
    }

    // Unboxing can only open what's on the ready count, so move the box first
    // and put back only the contents of the boxes that actually came off it.
    let boxes = requested;
    let ready = 0;
    if (requested < 0) {
      const moved = await shiftStock(box.id, requested);
      if (!moved.ok) return NextResponse.json({ error: moved.error }, { status: 409 });
      boxes = requested + moved.short;
      ready = moved.available;
      if (boxes === 0) {
        return NextResponse.json({ error: "There are no assembled boxes of that to unbox." }, { status: 400 });
      }
    }

    const short: { name: string; short: number }[] = [];
    for (const part of boxParts(anchor, catalog, extras)) {
      const moved = await shiftStock(part.item_id, -part.per_box * boxes);
      if (moved.ok && moved.short > 0) short.push({ name: part.name, short: moved.short });
    }

    if (requested > 0) {
      const moved = await shiftStock(box.id, boxes);
      if (!moved.ok) return NextResponse.json({ error: moved.error }, { status: 409 });
      ready = moved.available;
    }

    // Best-effort log of who built or opened what.
    await supabaseAdmin.from("marketing_box_assemblies").insert({
      anchor_id: anchor.id,
      box_item_id: box.id,
      anchor_name: anchor.name,
      quantity: boxes,
      short,
      created_by: auth.user.id,
      created_by_name: profile?.full_name || profile?.email || null,
    });

    return NextResponse.json({ ok: true, boxes, ready, short });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to record the boxes." }, { status: 500 });
  }
}
