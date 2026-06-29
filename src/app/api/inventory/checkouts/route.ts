import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { isOverdue, todayISODate } from "@/lib/inventory";
import {
  clean,
  getInventoryProfile,
  canWriteInventory,
  reserveStock,
  restoreStock,
  notifyLowStockIfCrossed,
} from "@/lib/inventory/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CHECKOUT_COLS =
  "id,item_id,event_name,quantity,taken_by,due_back_date,status,checked_out_by,checked_out_at,returned_by,returned_at,quantity_returned,quantity_damaged,notes";

function parsePosInt(v: unknown): number {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? n : NaN;
}

function validDate(s: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s));
}

// GET — the loan log. Fulfillment team only (admins + inside reps).
export async function GET() {
  try {
    const supabase = await supabaseRoute();
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr || !auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const profile = await getInventoryProfile(auth.user.id);
    if (!canWriteInventory(clean(profile?.role))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data, error } = await supabaseAdmin
      .from("marketing_item_checkouts")
      .select(CHECKOUT_COLS)
      .order("status", { ascending: true }) // 'out' before 'returned'
      .order("checked_out_at", { ascending: false })
      .limit(500);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const rows = (data || []) as any[];

    // Resolve item names and actor names in two batched lookups.
    const itemIds = Array.from(new Set(rows.map((r) => r.item_id).filter(Boolean)));
    const itemNames = new Map<string, string>();
    if (itemIds.length) {
      const { data: items } = await supabaseAdmin
        .from("marketing_inventory_items")
        .select("id,name")
        .in("id", itemIds);
      for (const it of (items || []) as any[]) itemNames.set(it.id, clean(it.name));
    }

    const userIds = Array.from(
      new Set(rows.flatMap((r) => [r.checked_out_by, r.returned_by]).filter(Boolean))
    );
    const userNames = new Map<string, string>();
    if (userIds.length) {
      const { data: people } = await supabaseAdmin
        .from("profiles")
        .select("id,full_name,email")
        .in("id", userIds);
      for (const p of (people || []) as any[]) {
        userNames.set(p.id, clean(p.full_name) || clean(p.email) || "");
      }
    }

    const today = todayISODate();
    const items = rows.map((r) => {
      const { checked_out_by, returned_by, ...rest } = r;
      return {
        ...rest,
        item_name: itemNames.get(r.item_id) || null,
        checked_out_by_name: checked_out_by ? userNames.get(checked_out_by) || null : null,
        returned_by_name: returned_by ? userNames.get(returned_by) || null : null,
        overdue: isOverdue(r, today),
      };
    });

    return NextResponse.json({ items });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to load checkouts." }, { status: 500 });
  }
}

// POST — check items out to an event. Reserves stock (available -> out).
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

    const itemId = clean(body.item_id);
    const eventName = clean(body.event_name);
    const quantity = parsePosInt(body.quantity);
    const dueBack = clean(body.due_back_date) || null;
    const takenBy = clean(body.taken_by) || null;
    const notes = clean(body.notes) || null;

    if (!itemId) return NextResponse.json({ error: "Pick an item." }, { status: 400 });
    if (!eventName) return NextResponse.json({ error: "Event name is required." }, { status: 400 });
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return NextResponse.json({ error: "Quantity must be a positive whole number." }, { status: 400 });
    }
    if (dueBack && !validDate(dueBack)) {
      return NextResponse.json({ error: "Due-back date is invalid." }, { status: 400 });
    }

    const { data: item } = await supabaseAdmin
      .from("marketing_inventory_items")
      .select("id,name,quantity_available,quantity_out,low_stock_threshold")
      .eq("id", itemId)
      .maybeSingle();
    if (!item) return NextResponse.json({ error: "Item not found." }, { status: 404 });

    const available = (item as any).quantity_available as number;
    const out = (item as any).quantity_out as number;
    if (quantity > available) {
      return NextResponse.json(
        { error: `Only ${available} in stock — can't check out ${quantity}.` },
        { status: 400 }
      );
    }

    const moved = await reserveStock(itemId, quantity, { available, out });
    if (!moved.ok) {
      return NextResponse.json(
        { error: "Stock changed while saving — please retry." },
        { status: 409 }
      );
    }

    const { data: row, error: insErr } = await supabaseAdmin
      .from("marketing_item_checkouts")
      .insert({
        item_id: itemId,
        event_name: eventName,
        quantity,
        taken_by: takenBy,
        due_back_date: dueBack,
        status: "out",
        checked_out_by: auth.user.id,
        notes,
      })
      .select(CHECKOUT_COLS)
      .single();

    if (insErr || !row) {
      // Roll the reservation back so a failed insert doesn't strand stock.
      await restoreStock(itemId, quantity, quantity, { available: moved.available, out: out + quantity });
      return NextResponse.json({ error: insErr?.message || "Failed to record checkout." }, { status: 500 });
    }

    void notifyLowStockIfCrossed(
      {
        id: itemId,
        name: clean((item as any).name),
        quantity_available: moved.available,
        quantity_out: out + quantity,
        low_stock_threshold: (item as any).low_stock_threshold || 0,
      },
      available
    );

    return NextResponse.json({ ok: true, checkout: row, quantity_available: moved.available }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to check out." }, { status: 500 });
  }
}

// PATCH — check a loan back in, or edit an open loan's details.
//   { id, action: "checkin", quantity_returned?, quantity_damaged? }
//   { id, event_name?, due_back_date?, taken_by?, notes? }   (open loans only)
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
    if (!id) return NextResponse.json({ error: "Missing checkout id." }, { status: 400 });

    const { data: loan } = await supabaseAdmin
      .from("marketing_item_checkouts")
      .select("id,item_id,quantity,status")
      .eq("id", id)
      .maybeSingle();
    if (!loan) return NextResponse.json({ error: "Checkout not found." }, { status: 404 });

    const isCheckin = clean(body?.action) === "checkin";

    if (isCheckin) {
      if ((loan as any).status !== "out") {
        return NextResponse.json({ error: "This loan is already closed." }, { status: 400 });
      }
      const loanQty = (loan as any).quantity as number;
      const damaged = body?.quantity_damaged === undefined ? 0 : parsePosInt(body?.quantity_damaged);
      const returned =
        body?.quantity_returned === undefined ? loanQty - (Number.isFinite(damaged) ? damaged : 0) : parsePosInt(body?.quantity_returned);
      if (!Number.isFinite(returned) || !Number.isFinite(damaged) || returned < 0 || damaged < 0) {
        return NextResponse.json({ error: "Return counts must be whole numbers." }, { status: 400 });
      }
      if (returned + damaged > loanQty) {
        return NextResponse.json(
          { error: `Returned + damaged can't exceed the ${loanQty} checked out.` },
          { status: 400 }
        );
      }

      const itemId = (loan as any).item_id as string;
      const { data: item } = await supabaseAdmin
        .from("marketing_inventory_items")
        .select("quantity_available,quantity_out")
        .eq("id", itemId)
        .maybeSingle();
      if (!item) return NextResponse.json({ error: "Item no longer exists." }, { status: 404 });

      const moved = await restoreStock(itemId, loanQty, returned, {
        available: (item as any).quantity_available,
        out: (item as any).quantity_out,
      });
      if (!moved.ok) {
        return NextResponse.json({ error: "Stock changed while saving — please retry." }, { status: 409 });
      }

      const { data: row, error } = await supabaseAdmin
        .from("marketing_item_checkouts")
        .update({
          status: "returned",
          returned_by: auth.user.id,
          returned_at: new Date().toISOString(),
          quantity_returned: returned,
          quantity_damaged: damaged,
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select(CHECKOUT_COLS)
        .single();
      if (error || !row) {
        return NextResponse.json({ error: error?.message || "Failed to check in." }, { status: 500 });
      }
      return NextResponse.json({ ok: true, checkout: row, quantity_available: moved.available });
    }

    // Edit an open loan's metadata (no stock movement).
    if ((loan as any).status !== "out") {
      return NextResponse.json({ error: "Closed loans can't be edited." }, { status: 400 });
    }
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body?.event_name !== undefined) {
      const ev = clean(body.event_name);
      if (!ev) return NextResponse.json({ error: "Event name is required." }, { status: 400 });
      updates.event_name = ev;
    }
    if (body?.taken_by !== undefined) updates.taken_by = clean(body.taken_by) || null;
    if (body?.notes !== undefined) updates.notes = clean(body.notes) || null;
    if (body?.due_back_date !== undefined) {
      const d = clean(body.due_back_date);
      if (d && !validDate(d)) return NextResponse.json({ error: "Due-back date is invalid." }, { status: 400 });
      updates.due_back_date = d || null;
    }
    if (Object.keys(updates).length === 1) {
      return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
    }

    const { data: row, error } = await supabaseAdmin
      .from("marketing_item_checkouts")
      .update(updates)
      .eq("id", id)
      .select(CHECKOUT_COLS)
      .single();
    if (error || !row) {
      return NextResponse.json({ error: error?.message || "Failed to update loan." }, { status: 500 });
    }
    return NextResponse.json({ ok: true, checkout: row });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to update checkout." }, { status: 500 });
  }
}
