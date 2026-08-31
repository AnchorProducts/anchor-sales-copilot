// Admin: the marketing-aisle traffic log — what left the aisle via the QR code
// and what came back. Fulfillment team only (admins + inside reps), same gate as
// checkouts.
//
//   GET → { items: [...pickups], returns: [...drop-offs] }
//
// Each pickup carries the pizza-box pieces that went out with it (`components`),
// which series they came from (`packaging_kit`), and how much of it has been
// returned — so the log answers both "who has our samples" and "where did the
// 3000 Series boxes go".

import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { clean, getInventoryProfile, canWriteInventory } from "@/lib/inventory/server";
import { grabOutstanding, normalizeComponents } from "@/lib/inventory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const GRAB_COLS_BASE =
  "id,item_id,item_name,grabbed_by_name,grabbed_by_email,quantity,pizza_box,plastic_overlay,created_at";
// Columns added by 20260831_000001. Split out so a deploy that lands before the
// migration still shows the log instead of 500ing the whole Inventory page.
const GRAB_COLS = `${GRAB_COLS_BASE},components,packaging_kit,quantity_returned`;

function isMissingColumn(error: { code?: string; message?: string } | null): boolean {
  return !!error && (error.code === "42703" || /components|quantity_returned|packaging_kit/.test(error.message || ""));
}

export async function GET() {
  try {
    const supabase = await supabaseRoute();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const profile = await getInventoryProfile(auth.user.id);
    if (!canWriteInventory(clean(profile?.role))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const listGrabs = (cols: string) =>
      supabaseAdmin
        .from("marketing_item_grabs")
        .select(cols)
        .order("created_at", { ascending: false })
        .limit(500);

    let { data, error } = await listGrabs(GRAB_COLS);
    if (isMissingColumn(error)) ({ data, error } = await listGrabs(GRAB_COLS_BASE));
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const items = (data || []).map((row: any) => ({
      ...row,
      components: normalizeComponents(row.components),
      quantity_returned: (row.quantity_returned || 0) as number,
      outstanding: grabOutstanding(row),
    }));

    // The return log is best-effort: an un-migrated database simply has none.
    const { data: returns } = await supabaseAdmin
      .from("marketing_item_returns")
      .select(
        "id,grab_id,item_id,item_name,quantity,components,packaging_kit,returned_by_name,returned_by_email,created_at"
      )
      .order("created_at", { ascending: false })
      .limit(500);

    return NextResponse.json({
      items,
      returns: (returns || []).map((row: any) => ({ ...row, components: normalizeComponents(row.components) })),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to load pickups." }, { status: 500 });
  }
}
