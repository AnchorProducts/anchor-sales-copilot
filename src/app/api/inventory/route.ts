import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  isInventoryCategory,
  isPackagingKit,
  isPackagingRole,
  isTradeshowCategory,
  resolveCheckoutEnabled,
} from "@/lib/inventory";
import {
  clean,
  getInventoryProfile,
  canViewInventory,
  canWriteInventory,
  signItemImage,
  notifyLowStockIfCrossed,
  INVENTORY_BUCKET,
} from "@/lib/inventory/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Columns added after the table shipped: product_of_month (20260817_000002) and
// packaging_kit (20260831_000001). Kept separate so a deploy that lands before
// its migration still serves the catalog instead of 500ing the order form — see
// the fallback in GET.
const LATER_COLS = ["product_of_month", "packaging_kit"] as const;

const ITEM_COLS_BASE =
  "id,name,description,category,sku,unit_cost,location,image_path,quantity_available,quantity_out,low_stock_threshold,checkout_enabled,pizza_box,plastic_overlay,packaging_role,created_at,updated_at";

const ITEM_COLS = `${ITEM_COLS_BASE},${LATER_COLS.join(",")}`;

// True when the failure is just an un-migrated later column (42703 = column does
// not exist), rather than a real problem with the write.
function isMissingLaterColumn(error: { code?: string; message?: string } | null) {
  if (!error) return false;
  return error.code === "42703" || LATER_COLS.some((c) => error.message?.includes(c));
}

function withoutLaterCols<T extends Record<string, unknown>>(payload: T) {
  const next = { ...payload };
  for (const c of LATER_COLS) delete next[c];
  return next;
}

// The four pizza-box kit pieces (box, overlay, under-anchor insert, foldable
// over-anchor insert), one set per anchor series. A piece is addressed by the
// PAIR — one item per (kit, role), which the partial unique index enforces.
function parsePackagingRole(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  const s = String(v ?? "").trim();
  if (!s) return null;
  return isPackagingRole(s) ? s : "__invalid__";
}

function parsePackagingKit(v: unknown): string | null | undefined {
  if (v === undefined) return undefined;
  const s = String(v ?? "").trim();
  if (!s) return null;
  return isPackagingKit(s) ? s : "__invalid__";
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

// A second item claiming the same (kit, role) trips the partial unique index.
function isPackagingRoleConflict(err: { code?: string; message?: string } | null): boolean {
  return err?.code === "23505" || /packaging_(kit_)?role_uq/i.test(err?.message || "");
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

    const listItems = (cols: string) =>
      supabaseAdmin
        .from("marketing_inventory_items")
        .select(cols)
        .order("name", { ascending: true })
        .limit(1000);

    let { data, error } = await listItems(ITEM_COLS);
    // Retry without the newest columns so an un-migrated database degrades to
    // "nothing is flagged, no kits" rather than knocking out the whole catalog.
    if (isMissingLaterColumn(error)) {
      ({ data, error } = await listItems(ITEM_COLS_BASE));
    }
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
    const packagingKit = parsePackagingKit(body.packaging_kit);
    if (packagingKit === "__invalid__") {
      return NextResponse.json({ error: "Invalid pizza box kit." }, { status: 400 });
    }
    // A piece with no kit can't be found by the aisle, so it isn't a piece.
    if (packagingRole && !packagingKit) {
      return NextResponse.json(
        { error: "Pick which pizza box kit this piece belongs to." },
        { status: 400 }
      );
    }

    const insertPayload: Record<string, unknown> = {
        name,
        description: clean(body.description) || null,
        category,
        sku: clean(body.sku) || null,
        unit_cost: cost === undefined ? null : cost,
        location: clean(body.location) || null,
        quantity_available: available,
        quantity_out: 0,
        low_stock_threshold: threshold,
        // Tradeshow stock is loaned and returned, so it's always checkout-eligible.
        checkout_enabled: resolveCheckoutEnabled(category, parseBool(body.checkout_enabled)),
        pizza_box: parseBool(body.pizza_box),
        plastic_overlay: parseBool(body.plastic_overlay),
        product_of_month: parseBool(body.product_of_month),
        packaging_role: packagingRole ?? null,
        packaging_kit: packagingKit ?? null,
        created_by: auth.user.id,
        updated_by: auth.user.id,
    };

    const insertItem = (payload: Record<string, unknown>, cols: string) =>
      supabaseAdmin.from("marketing_inventory_items").insert(payload).select(cols).single();

    let { data: row, error } = await insertItem(insertPayload, ITEM_COLS);
    if (isMissingLaterColumn(error)) {
      ({ data: row, error } = await insertItem(withoutLaterCols(insertPayload), ITEM_COLS_BASE));
    }

    if (error || !row) {
      if (isPackagingRoleConflict(error)) {
        return NextResponse.json(
          { error: "Another item is already set as that piece of that kit. Clear it there first." },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: error?.message || "Failed to create item." }, { status: 500 });
    }

    // A brand-new item that's already at/below threshold should alert.
    void notifyLowStockIfCrossed(row as any, null);

    return NextResponse.json(
      { ok: true, item: { ...(row as unknown as Record<string, unknown>), image_url: null } },
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
      .select("quantity_available,low_stock_threshold,name,quantity_out,category,packaging_role,packaging_kit")
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
    // Re-apply the tradeshow rule against the category the item will HAVE after
    // this update, not the one it had before — so moving an item into Tradeshow
    // turns checkout on even when the request never mentions the flag, and an
    // item moved out of Tradeshow keeps whatever was explicitly asked for.
    const effectiveCategory =
      body?.category !== undefined ? (updates.category as string | null) : ((current as any).category ?? null);
    if (isTradeshowCategory(effectiveCategory)) updates.checkout_enabled = true;
    if (body?.pizza_box !== undefined) updates.pizza_box = parseBool(body.pizza_box);
    if (body?.plastic_overlay !== undefined) updates.plastic_overlay = parseBool(body.plastic_overlay);
    if (body?.product_of_month !== undefined) updates.product_of_month = parseBool(body.product_of_month);
    if (body?.packaging_role !== undefined) {
      const role = parsePackagingRole(body.packaging_role);
      if (role === "__invalid__") return NextResponse.json({ error: "Invalid packaging role." }, { status: 400 });
      updates.packaging_role = role ?? null;
    }
    if (body?.packaging_kit !== undefined) {
      const kit = parsePackagingKit(body.packaging_kit);
      if (kit === "__invalid__") return NextResponse.json({ error: "Invalid pizza box kit." }, { status: 400 });
      updates.packaging_kit = kit ?? null;
    }
    // Check the pair the item will HAVE after this update, not the half of it
    // this request happens to mention — clearing the kit on an existing piece is
    // as broken as adding a piece without one, and the DB constraint would
    // reject it with a message nobody can act on.
    const effectiveRole =
      body?.packaging_role !== undefined
        ? (updates.packaging_role as string | null)
        : ((current as any).packaging_role ?? null);
    const effectiveKit =
      body?.packaging_kit !== undefined
        ? (updates.packaging_kit as string | null)
        : ((current as any).packaging_kit ?? null);
    if (effectiveRole && !effectiveKit) {
      return NextResponse.json(
        { error: "Pick which pizza box kit this piece belongs to." },
        { status: 400 }
      );
    }

    const updateItem = (payload: Record<string, unknown>, cols: string) =>
      supabaseAdmin.from("marketing_inventory_items").update(payload).eq("id", id).select(cols).single();

    let { data: row, error } = await updateItem(updates, ITEM_COLS);
    if (isMissingLaterColumn(error)) {
      ({ data: row, error } = await updateItem(withoutLaterCols(updates), ITEM_COLS_BASE));
    }
    if (error || !row) {
      if (isPackagingRoleConflict(error)) {
        return NextResponse.json(
          { error: "Another item is already set as that piece of that kit. Clear it there first." },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: error?.message || "Failed to update item." }, { status: 500 });
    }

    void notifyLowStockIfCrossed(row as any, prevAvailable);

    return NextResponse.json({
      ok: true,
      item: { ...(row as unknown as Record<string, unknown>), image_url: await signItemImage((row as any).image_path) },
    });
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
      .select("quantity_out,image_path")
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

    // The row is gone, so nothing points at the photo any more — drop it too,
    // or the bucket accumulates files no item can ever reference. Best-effort:
    // a failed cleanup leaves a stray file, which must not fail the delete.
    const imagePath = clean((current as any)?.image_path);
    if (imagePath) void supabaseAdmin.storage.from(INVENTORY_BUCKET).remove([imagePath]);

    return NextResponse.json({ ok: true, id });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to delete item." }, { status: 500 });
  }
}
