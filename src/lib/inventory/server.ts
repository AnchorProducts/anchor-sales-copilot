// Server-only helpers shared by the inventory + checkout API routes. Uses the
// service-role client (RLS-bypassing) — never import from client components.

import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendPushToTool } from "@/lib/push/send";
import { emailToolUsers } from "@/lib/push/recipients";
import { internalAppUrl } from "@/lib/appUrl";
import {
  PACKAGING_ROLES,
  describeComponents,
  packagingKitLabel,
  type PackagingKit,
  type PackagingRole,
} from "@/lib/inventory";

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

// Notify the pickup channel that someone grabbed stock from the aisle — one
// alert per pickup even when several items are taken at once. Best-effort;
// never throws. Each line's `remaining` is that item's new available count so
// recipients can see at a glance whether anything needs restocking.
export async function notifyGrab(args: {
  by: string;
  email: string;
  items: { name: string; quantity: number; remaining: number; components?: string[]; kit?: string | null }[];
}): Promise<void> {
  if (!args.items.length) return;
  const url = "/admin/inventory";

  // A short "+ 2000 Series box + overlay" suffix naming the kit pieces that went
  // with it, and which series they came off.
  const pkg = (i: { components?: string[]; kit?: string | null }) => {
    const extras = describeComponents(i.components || []);
    if (!extras) return "";
    const series = packagingKitLabel(i.kit);
    return ` + ${series ? `${series} ` : ""}${extras}`;
  };

  const parts = args.items.map((i) => `${i.quantity} × ${i.name}${pkg(i)} (${i.remaining} left)`);
  const totalUnits = args.items.reduce((n, i) => n + i.quantity, 0);

  // Push: a compact one-liner. Email: an itemized list.
  const pushBody =
    args.items.length === 1
      ? `${args.by} grabbed ${parts[0]}.`
      : `${args.by} grabbed ${args.items.length} items (${totalUnits} units): ${parts.join(", ")}.`;
  const subject =
    args.items.length === 1
      ? `Aisle pickup — ${args.items[0].name}`
      : `Aisle pickup — ${args.items.length} items`;
  const emailText =
    `${args.by} <${args.email}> grabbed:\n` +
    args.items.map((i) => `  • ${i.quantity} × ${i.name}${pkg(i)} (${i.remaining} left)`).join("\n") +
    `\n\nInventory: ${internalAppUrl(url)}`;

  try {
    void sendPushToTool("inventory_grab", {
      title: "Marketing aisle pickup",
      body: pushBody,
      url,
      tag: `inv-grab-${args.email}`,
    });
    void emailToolUsers("inventory_grab", { subject, text: emailText });
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

// ── Pizza-box kit pools ─────────────────────────────────────────────────────
//
// Each kit piece (box, overlay, under-anchor insert, over-anchor insert) is an
// ordinary inventory item tagged with packaging_kit + packaging_role, so it
// carries its own photo, count and low-stock threshold. A piece is addressed by
// the PAIR — the 2000 Series box and the 3000 Series box are different rows —
// so pools are keyed kit first. Resolving them once per request keeps the aisle
// endpoints from re-querying per line.

export type PackagingPool = {
  id: string;
  name: string;
  quantity_available: number;
  image_path: string | null;
};

export type KitPools = Partial<Record<PackagingRole, PackagingPool>>;
export type PackagingPools = Partial<Record<PackagingKit, KitPools>>;

// True when a query failed only because a column added by 20260831_000001 isn't
// there yet (42703 = column does not exist). The aisle is a public shelf page —
// it degrades to "no kit pieces offered" rather than 500ing at someone holding a
// phone, and starts working the moment the migration lands.
export function isMissingKitColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === "42703" ||
    /packaging_kit|components|quantity_returned/.test(error.message || "")
  );
}

export async function getPackagingPools(): Promise<PackagingPools> {
  const { data, error } = await supabaseAdmin
    .from("marketing_inventory_items")
    .select("id,name,quantity_available,image_path,packaging_role,packaging_kit")
    .in("packaging_role", PACKAGING_ROLES as string[]);
  // No kit column means no piece is addressable yet — offer none rather than
  // guessing which series a pool belongs to.
  if (isMissingKitColumn(error)) return {};
  const pools: PackagingPools = {};
  for (const row of (data || []) as any[]) {
    const kit = clean(row.packaging_kit) as PackagingKit;
    const role = row.packaging_role as PackagingRole;
    if (!kit || !role) continue;
    const forKit = (pools[kit] ||= {});
    forKit[role] = {
      id: row.id,
      name: clean(row.name),
      quantity_available: row.quantity_available as number,
      image_path: clean(row.image_path) || null,
    };
  }
  return pools;
}

// One kit's pieces, or an empty set for a kit that isn't stocked yet.
export function kitPools(pools: PackagingPools, kit: string | null | undefined): KitPools {
  if (!kit) return {};
  return pools[kit as PackagingKit] || {};
}

// Move a kit piece's count by `delta` (negative takes, positive puts back).
// Optimistic-concurrency retries; a take clamps to what's on hand so an
// unstocked piece never blocks — or negates — the sample pickup it rides along
// with. Best-effort by design: the anchor moving is what matters.
export async function adjustPoolStock(poolId: string | null | undefined, delta: number): Promise<void> {
  if (!poolId || !delta) return;
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data } = await supabaseAdmin
      .from("marketing_inventory_items")
      .select("quantity_available")
      .eq("id", poolId)
      .maybeSingle();
    if (!data) return;
    const avail = (data as any).quantity_available as number;
    const next = Math.max(0, avail + delta);
    if (next === avail) return; // nothing left to take
    const { data: moved } = await supabaseAdmin
      .from("marketing_inventory_items")
      .update({ quantity_available: next, updated_at: new Date().toISOString() })
      .eq("id", poolId)
      .eq("quantity_available", avail)
      .select("quantity_available")
      .maybeSingle();
    if (moved) return;
    // conflict → retry with a fresh read
  }
}

// Atomically add units back to an item's available count — the aisle return,
// the mirror of consumeStock. Guarded on the current count so a concurrent
// pickup can't be overwritten.
export async function returnStock(
  itemId: string,
  qty: number,
  prevAvailable: number
): Promise<{ ok: true; available: number } | { ok: false; reason: "conflict" }> {
  const { data, error } = await supabaseAdmin
    .from("marketing_inventory_items")
    .update({
      quantity_available: prevAvailable + qty,
      updated_at: new Date().toISOString(),
    })
    .eq("id", itemId)
    .eq("quantity_available", prevAvailable)
    .select("quantity_available")
    .maybeSingle();
  if (error || !data) return { ok: false, reason: "conflict" };
  return { ok: true, available: (data as any).quantity_available as number };
}

// Tell the pickup channel that stock came BACK to the aisle. Deliberately the
// same "inventory_grab" channel a pickup uses: the people who want to know the
// shelf emptied are the people who want to know it refilled, and a separate
// topic would silently notify nobody until an admin assigned recipients to it.
export async function notifyReturn(args: {
  by: string;
  email: string;
  items: { name: string; quantity: number; remaining: number; components?: string[]; kit?: string | null }[];
}): Promise<void> {
  if (!args.items.length) return;
  const url = "/admin/inventory";

  const pkg = (i: { components?: string[]; kit?: string | null }) => {
    const extras = describeComponents(i.components || []);
    if (!extras) return "";
    const series = packagingKitLabel(i.kit);
    return ` + ${series ? `${series} ` : ""}${extras}`;
  };

  const parts = args.items.map((i) => `${i.quantity} × ${i.name}${pkg(i)} (${i.remaining} on hand)`);
  const totalUnits = args.items.reduce((n, i) => n + i.quantity, 0);

  const pushBody =
    args.items.length === 1
      ? `${args.by} returned ${parts[0]}.`
      : `${args.by} returned ${args.items.length} items (${totalUnits} units): ${parts.join(", ")}.`;
  const subject =
    args.items.length === 1
      ? `Aisle return — ${args.items[0].name}`
      : `Aisle return — ${args.items.length} items`;
  const emailText =
    `${args.by} <${args.email}> returned to the marketing aisle:\n` +
    args.items.map((i) => `  • ${i.quantity} × ${i.name}${pkg(i)} (${i.remaining} on hand)`).join("\n") +
    `\n\nInventory: ${internalAppUrl(url)}`;

  try {
    void sendPushToTool("inventory_grab", {
      title: "Marketing aisle return",
      body: pushBody,
      url,
      tag: `inv-return-${args.email}`,
    });
    void emailToolUsers("inventory_grab", { subject, text: emailText });
  } catch (e: any) {
    console.warn("inventory return notify failed", e?.message || e);
  }
}
