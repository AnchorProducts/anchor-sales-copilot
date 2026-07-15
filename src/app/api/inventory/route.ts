import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isInventoryCategory } from "@/lib/inventory";
import {
  clean,
  getInventoryProfile,
  canViewInventory,
  canWriteInventory,
  signItemImage,
  notifyLowStockIfCrossed,
} from "@/lib/inventory/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ITEM_COLS =
  "id,name,description,category,sku,unit_cost,location,image_path,quantity_available,quantity_out,low_stock_threshold,checkout_enabled,pizza_box,plastic_overlay,packaging_role,created_at,updated_at";

const PACKAGING_ROLES = ["pizza_box", "overlay"] as const;
function parsePackagingRole(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  const s = String(v ?? "").trim();
  if (!s) return null;
  return (PACKAGING_ROLES as readonly string[]).includes(s) ? s : "__invalid__";
}

// Parse a non-negative integer from a request value; returns null if absent,
// or a number (clamped to >= 0). Invalid -> NaN so callers can 400.
function parseIntField(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = Math.floor(Number(v));
  if (!Number.isFinite(n)) return NaN;
  return Math.max(0, n);
}

function parseCost(v: unknown): number | null | undefined {
  if (v === undefined) return undefined;
  if (v === null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : NaN;
}

function parseBool(v: unknown): boolean {
  return v === true || v === "true" || v === 1 || v === "1";
}

// A duplicate packaging-role assignment trips the partial unique index.
function isPackagingRoleConflict(err: { code?: string; message?: string } | null): boolean {
  return err?.code === "23505" || /packaging_role_uq/i.test(err?.message || "");
}

// GET — list all items. Admins + inside reps + outside reps (read-only).
export async function GET() {
  try {
    const supabase = await supabaseRoute();
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr || !auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const profile = await getInventoryProfile(auth.user.id);
    const role = clean(profile?.role);
    if (!canViewInventory(role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const { data, error } = await supabaseAdmin
      .from("marketing_inventory_items")
      .select(ITEM_COLS)
      .order("name", { ascending: true })
      .limit(1000);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const items = await Promise.all(
      (data || []).map(async (row: any) => ({
        ...row,
        image_url: await signItemImage(row.image_path),
        low_stock:
          (row.low_stock_threshold || 0) > 0 &&
          row.quantity_available <= row.low_stock_threshold,
      }))
    );

    return NextResponse.json({ items, role });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to load inventory." }, { status: 500 });
  }
}

// POST — create an item. Admins + inside reps.
export async function POST(req: Request) {
  try {
    const supabase = await supabaseRoute();
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr || !auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const profile = await getInventoryProfile(auth.user.id);
    if (!canWriteInventory(clean(profile?.role))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

    const name = clean(body.name);
    if (!name) return NextResponse.json({ error: "Item name is required." }, { status: 400 });

    const category = clean(body.category) || null;
    if (category && !isInventoryCategory(category)) {
      return NextResponse.json({ error: "Invalid category." }, { status: 400 });
    }

    const available = parseIntField(body.quantity_available) ?? 0;
    const threshold = parseIntField(body.low_stock_threshold) ?? 0;
    const cost = parseCost(body.unit_cost);
    if (Number.isNaN(available) || Number.isNaN(threshold)) {
      return NextResponse.json({ error: "Quantities must be whole numbers." }, { status: 400 });
    }
    if (Number.isNaN(cost)) {
      return NextResponse.json({ error: "Unit cost is invalid." }, { status: 400 });
    }
    const packagingRole = parsePackagingRole(body.packaging_role);
    if (packagingRole === "__invalid__") {
      return NextResponse.json({ error: "Invalid packaging role." }, { status: 400 });
    }

    const { data: row, error } = await supabaseAdmin
      .from("marketing_inventory_items")
      .insert({
        name,
        description: clean(body.description) || null,
        category,
        sku: clean(body.sku) || null,
        unit_cost: cost === undefined ? null : cost,
        location: clean(body.location) || null,
        quantity_available: available,
        quantity_out: 0,
        low_stock_threshold: threshold,
        checkout_enabled: parseBool(body.checkout_enabled),
        pizza_box: parseBool(body.pizza_box),
        plastic_overlay: parseBool(body.plastic_overlay),
        packaging_role: packagingRole ?? null,
        created_by: auth.user.id,
        updated_by: auth.user.id,
      })
      .select(ITEM_COLS)
      .single();

    if (error || !row) {
      if (isPackagingRoleConflict(error)) {
        return NextResponse.json(
          { error: "Another item is already set as that packaging pool. Clear it there first." },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: error?.message || "Failed to create item." }, { status: 500 });
    }

    // A brand-new item that's already at/below threshold should alert.
    void notifyLowStockIfCrossed(row as any, null);

    return NextResponse.json(
      { ok: true, item: { ...row, image_url: null } },
      { status: 201 }
    );
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to create item." }, { status: 500 });
  }
}

// PATCH — edit an item's details / restock. Admins + inside reps. quantity_out
// is managed only via checkouts, never edited here.
export async function PATCH(req: Request) {
  try {
    const supabase = await supabaseRoute();
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr || !auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const profile = await getInventoryProfile(auth.user.id);
    if (!canWriteInventory(clean(profile?.role))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const id = clean(body?.id);
    if (!id) return NextResponse.json({ error: "Missing item id." }, { status: 400 });

    const { data: current, error: curErr } = await supabaseAdmin
      .from("marketing_inventory_items")
      .select("quantity_available,low_stock_threshold,name,quantity_out")
      .eq("id", id)
      .maybeSingle();
    if (curErr) return NextResponse.json({ error: curErr.message }, { status: 500 });
    if (!current) return NextResponse.json({ error: "Item not found." }, { status: 404 });
    const prevAvailable = (current as any).quantity_available as number;

    const updates: Record<string, unknown> = { updated_by: auth.user.id, updated_at: new Date().toISOString() };

    if (body?.name !== undefined) {
      const name = clean(body.name);
      if (!name) return NextResponse.json({ error: "Item name is required." }, { status: 400 });
      updates.name = name;
    }
    if (body?.description !== undefined) updates.description = clean(body.description) || null;
    if (body?.sku !== undefined) updates.sku = clean(body.sku) || null;
    if (body?.location !== undefined) updates.location = clean(body.location) || null;
    if (body?.category !== undefined) {
      const category = clean(body.category) || null;
      if (category && !isInventoryCategory(category)) {
        return NextResponse.json({ error: "Invalid category." }, { status: 400 });
      }
      updates.category = category;
    }
    if (body?.unit_cost !== undefined) {
      const cost = parseCost(body.unit_cost);
      if (Number.isNaN(cost)) return NextResponse.json({ error: "Unit cost is invalid." }, { status: 400 });
      updates.unit_cost = cost === undefined ? null : cost;
    }
    if (body?.low_stock_threshold !== undefined) {
      const threshold = parseIntField(body.low_stock_threshold);
      if (Number.isNaN(threshold)) return NextResponse.json({ error: "Threshold must be a whole number." }, { status: 400 });
      updates.low_stock_threshold = threshold ?? 0;
    }
    if (body?.quantity_available !== undefined) {
      const available = parseIntField(body.quantity_available);
      if (Number.isNaN(available)) return NextResponse.json({ error: "Quantity must be a whole number." }, { status: 400 });
      updates.quantity_available = available ?? 0;
    }
    if (body?.checkout_enabled !== undefined) updates.checkout_enabled = parseBool(body.checkout_enabled);
    if (body?.pizza_box !== undefined) updates.pizza_box = parseBool(body.pizza_box);
    if (body?.plastic_overlay !== undefined) updates.plastic_overlay = parseBool(body.plastic_overlay);
    if (body?.packaging_role !== undefined) {
      const role = parsePackagingRole(body.packaging_role);
      if (role === "__invalid__") return NextResponse.json({ error: "Invalid packaging role." }, { status: 400 });
      updates.packaging_role = role ?? null;
    }

    const { data: row, error } = await supabaseAdmin
      .from("marketing_inventory_items")
      .update(updates)
      .eq("id", id)
      .select(ITEM_COLS)
      .single();
    if (error || !row) {
      if (isPackagingRoleConflict(error)) {
        return NextResponse.json(
          { error: "Another item is already set as that packaging pool. Clear it there first." },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: error?.message || "Failed to update item." }, { status: 500 });
    }

    void notifyLowStockIfCrossed(row as any, prevAvailable);

    return NextResponse.json({ ok: true, item: { ...row, image_url: await signItemImage((row as any).image_path) } });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to update item." }, { status: 500 });
  }
}

// DELETE — remove an item (?id=). Admins + inside reps. Blocked while any units
// are still checked out, so we never orphan field stock.
export async function DELETE(req: Request) {
  try {
    const supabase = await supabaseRoute();
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr || !auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const profile = await getInventoryProfile(auth.user.id);
    if (!canWriteInventory(clean(profile?.role))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const id = clean(new URL(req.url).searchParams.get("id"));
    if (!id) return NextResponse.json({ error: "Missing item id." }, { status: 400 });

    const { data: current } = await supabaseAdmin
      .from("marketing_inventory_items")
      .select("quantity_out")
      .eq("id", id)
      .maybeSingle();
    if (current && ((current as any).quantity_out || 0) > 0) {
      return NextResponse.json(
        { error: "This item still has units checked out. Check them in before deleting." },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin.from("marketing_inventory_items").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, id });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to delete item." }, { status: 500 });
  }
}
