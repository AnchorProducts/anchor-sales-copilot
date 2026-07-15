// Server-only helpers shared by the inventory + checkout API routes. Uses the
// service-role client (RLS-bypassing) — never import from client components.

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendPushToTool } from "@/lib/push/send";
import { emailToolUsers } from "@/lib/push/recipients";
import { internalAppUrl } from "@/lib/appUrl";

// Item photos live in the same bucket as notable-project photos.
export const INVENTORY_BUCKET = "lead-uploads";

export function clean(v: unknown): string {
  return String(v ?? "").trim();
}

export type InventoryProfile = { role: string; full_name: string | null; email: string | null };

export async function getInventoryProfile(userId: string): Promise<InventoryProfile | null> {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("role,full_name,email")
    .eq("id", userId)
    .maybeSingle();
  if (!data) return null;
  return {
    role: clean((data as any).role),
    full_name: clean((data as any).full_name) || null,
    email: clean((data as any).email) || null,
  };
}

// Admins + inside (anchor) reps manage inventory and checkouts.
export function canWriteInventory(role: string): boolean {
  return role === "admin" || role === "anchor_rep";
}
// Everyone signed in as sales can view (outside reps are read-only).
export function canViewInventory(role: string): boolean {
  return role === "admin" || role === "anchor_rep" || role === "external_rep";
}

// Short-lived signed URL for an item photo (null if no image / on error).
export async function signItemImage(path: string | null | undefined): Promise<string | null> {
  const p = clean(path);
  if (!p) return null;
  const { data } = await supabaseAdmin.storage.from(INVENTORY_BUCKET).createSignedUrl(p, 60 * 60);
  return data?.signedUrl || null;
}

// Sanitize an uploaded filename for a storage key.
export function sanitizeFilename(name: string): string {
  return clean(name).replace(/\s+/g, "-").replace(/[^a-zA-Z0-9._-]/g, "") || "photo";
}

type StockItem = {
  id: string;
  name: string;
  quantity_available: number;
  quantity_out: number;
  low_stock_threshold: number;
};

// Fire the low-stock notification only on the transition INTO low stock, so a
// repeatedly-edited low item doesn't spam. `prevAvailable` is the count before
// the change (null when the item is brand new). Best-effort; never throws.
export async function notifyLowStockIfCrossed(
  item: StockItem,
  prevAvailable: number | null
): Promise<void> {
  const threshold = item.low_stock_threshold || 0;
  if (threshold <= 0) return;
  const nowLow = item.quantity_available <= threshold;
  const wasLow = prevAvailable !== null && prevAvailable <= threshold;
  if (!nowLow || wasLow) return;

  const url = "/admin/inventory";
  try {
    void sendPushToTool("inventory_low_stock", {
      title: "Low stock",
      body: `${item.name}: ${item.quantity_available} left (threshold ${threshold}).`,
      url,
      tag: `inv-low-${item.id}`,
    });
    void emailToolUsers("inventory_low_stock", {
      subject: `Low stock — ${item.name}`,
      text: `${item.name} is low: ${item.quantity_available} available (threshold ${threshold}).\n\nRestock: ${internalAppUrl(url)}`,
    });
  } catch (e: any) {
    console.warn("inventory low-stock notify failed", e?.message || e);
  }
}

// ── Marketing-aisle grab (public QR pickup) ─────────────────────────────────

export type GrabConfig = { token: string; enabled: boolean };

// Read the single-row aisle config. Returns null if the row is missing (the
// migration seeds it, so that only happens if it was deleted).
export async function getGrabConfig(): Promise<GrabConfig | null> {
  const { data } = await supabaseAdmin
    .from("marketing_grab_config")
    .select("token,enabled")
    .eq("id", 1)
    .maybeSingle();
  if (!data) return null;
  return { token: clean((data as any).token), enabled: !!(data as any).enabled };
}

// Notify the pickup channel that someone grabbed stock from the aisle.
// Best-effort; never throws. `remaining` is the item's new available count so
// recipients can see at a glance whether it needs restocking.
export async function notifyGrab(args: {
  itemName: string;
  quantity: number;
  by: string;
  email: string;
  remaining: number;
}): Promise<void> {
  const url = "/admin/inventory";
  const line = `${args.by} grabbed ${args.quantity} × ${args.itemName} (${args.remaining} left).`;
  try {
    void sendPushToTool("inventory_grab", {
      title: "Marketing aisle pickup",
      body: line,
      url,
      tag: `inv-grab-${args.itemName}`,
    });
    void emailToolUsers("inventory_grab", {
      subject: `Aisle pickup — ${args.itemName}`,
      text: `${line}\n\nTaken by: ${args.by} <${args.email}>\n\nInventory: ${internalAppUrl(url)}`,
    });
  } catch (e: any) {
    console.warn("inventory grab notify failed", e?.message || e);
  }
}

// Atomically move `qty` units available -> out for a checkout. Guarded on the
// item's current counts (optimistic concurrency): if another write changed them
// between read and write, the update affects 0 rows and we report a conflict so
// the caller can retry. Returns the new available count, or an error reason.
export async function reserveStock(
  itemId: string,
  qty: number,
  prev: { available: number; out: number }
): Promise<{ ok: true; available: number } | { ok: false; reason: "conflict" }> {
  const { data, error } = await supabaseAdmin
    .from("marketing_inventory_items")
    .update({
      quantity_available: prev.available - qty,
      quantity_out: prev.out + qty,
      updated_at: new Date().toISOString(),
    })
    .eq("id", itemId)
    .eq("quantity_available", prev.available)
    .eq("quantity_out", prev.out)
    .select("quantity_available")
    .maybeSingle();
  if (error || !data) return { ok: false, reason: "conflict" };
  return { ok: true, available: (data as any).quantity_available as number };
}

// Atomically decrement available stock for a marketing-order fulfillment
// (no checkout involved — the units leave inventory). Guarded on the current
// available count so concurrent writes can't drive it negative.
export async function consumeStock(
  itemId: string,
  qty: number,
  prevAvailable: number
): Promise<{ ok: true; available: number } | { ok: false; reason: "conflict" }> {
  const { data, error } = await supabaseAdmin
    .from("marketing_inventory_items")
    .update({
      quantity_available: prevAvailable - qty,
      updated_at: new Date().toISOString(),
    })
    .eq("id", itemId)
    .eq("quantity_available", prevAvailable)
    .select("quantity_available")
    .maybeSingle();
  if (error || !data) return { ok: false, reason: "conflict" };
  return { ok: true, available: (data as any).quantity_available as number };
}

// Atomically close a loan: remove the whole loaned `qty` from out, return
// `returnedGood` units to available (damaged/lost just leave the total).
export async function restoreStock(
  itemId: string,
  loanQty: number,
  returnedGood: number,
  prev: { available: number; out: number }
): Promise<{ ok: true; available: number } | { ok: false; reason: "conflict" }> {
  const { data, error } = await supabaseAdmin
    .from("marketing_inventory_items")
    .update({
      quantity_available: prev.available + returnedGood,
      quantity_out: Math.max(0, prev.out - loanQty),
      updated_at: new Date().toISOString(),
    })
    .eq("id", itemId)
    .eq("quantity_available", prev.available)
    .eq("quantity_out", prev.out)
    .select("quantity_available")
    .maybeSingle();
  if (error || !data) return { ok: false, reason: "conflict" };
  return { ok: true, available: (data as any).quantity_available as number };
}
