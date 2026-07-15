// Admin: the marketing-aisle pickup log — who grabbed what from the aisle QR.
// Fulfillment team only (admins + inside reps), same gate as checkouts.
//
//   GET → { items: [{ id, item_id, item_name, grabbed_by_name, grabbed_by_email,
//                      quantity, created_at }] }

import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { clean, getInventoryProfile, canWriteInventory } from "@/lib/inventory/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await supabaseRoute();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const profile = await getInventoryProfile(auth.user.id);
    if (!canWriteInventory(clean(profile?.role))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data, error } = await supabaseAdmin
      .from("marketing_item_grabs")
      .select("id,item_id,item_name,grabbed_by_name,grabbed_by_email,quantity,pizza_box,plastic_overlay,created_at")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ items: data || [] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to load pickups." }, { status: 500 });
  }
}
