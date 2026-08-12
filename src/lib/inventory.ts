// Shared types + helpers for the marketing inventory and tradeshow checkout
// tools. Both the admin UI and the rep-facing read-only view read from here so
// shapes and rules (low-stock, overdue) never drift between client and server.
//
// Inventory items reuse the Marketing Orders category list, so a "swag" item in
// stock lines up with a "swag" order.

import { MARKETING_CATEGORIES, isMarketingCategory, marketingCategoryLabel } from "@/lib/marketingOrders";

// Categories are shared with marketing orders — re-exported under inventory
// names so callers don't reach across domains.
export const INVENTORY_CATEGORIES = MARKETING_CATEGORIES;
export const isInventoryCategory = isMarketingCategory;
export const inventoryCategoryLabel = marketingCategoryLabel;

// ────────────────────────────────────────────────────────────────────────────
// Tradeshow stock
//
// The Tradeshow category exists for stock that goes out on loan and comes back —
// booth kit, displays, banners. The checkout flow IS that round trip, so a
// tradeshow item is always checkout-eligible; an item filed there with checkout
// off could be sent out and never booked back in, which is the one thing the
// category is meant to prevent.
//
// Enforced on every write in the API, not merely defaulted in the editor, so the
// rule holds no matter which path sets the category.
// ────────────────────────────────────────────────────────────────────────────

export const TRADESHOW_CATEGORY = "tradeshow";

export function isTradeshowCategory(category: string | null | undefined): boolean {
  return category === TRADESHOW_CATEGORY;
}

// The checkout flag an item ends up with: forced on for tradeshow stock,
// otherwise whatever was asked for.
export function resolveCheckoutEnabled(
  category: string | null | undefined,
  requested: boolean
): boolean {
  return isTradeshowCategory(category) ? true : requested;
}

// Which inventory item, if any, is a packaging stock pool.
export type PackagingRole = "pizza_box" | "overlay";

// ────────────────────────────────────────────────────────────────────────────
// Overlays
//
// A plastic overlay reaches a customer two ways: on its own (the pool item is
// picked straight from the catalog — how inside sales ships overlays and nothing
// else), or paired one-for-one with an anchor sample that offers one. Both come
// off the SAME inventory row, the item tagged packaging_role = 'overlay', so the
// two paths can't drift into separate counts.
//
// One function computes the total, used by the order form to preview it and by
// the API to record it. Server-side is authoritative: the client's flags are
// honored only for items that actually offer an overlay.
// ────────────────────────────────────────────────────────────────────────────

export const OVERLAY_ROLE: PackagingRole = "overlay";

export function isOverlayPool(item: { packaging_role?: string | null } | null | undefined): boolean {
  return item?.packaging_role === OVERLAY_ROLE;
}

export type OverlayLine = {
  quantity: number;
  // The item being ordered, as far as overlays are concerned.
  offersOverlay: boolean;
  isOverlayPool: boolean;
  // Whether an overlay was asked for alongside this item.
  wantsOverlay: boolean;
};

// Overlays an order consumes, split by where they came from. `paired` counts one
// overlay per unit of an anchor sample ordered with one — matching how the aisle
// QR already decrements the pool. A request for an overlay on an item that
// doesn't offer one is ignored rather than trusted.
export function overlayUnits(lines: OverlayLine[]): {
  paired: number;
  standalone: number;
  total: number;
} {
  let paired = 0;
  let standalone = 0;
  for (const l of lines) {
    const qty = Math.max(0, Math.floor(l.quantity) || 0);
    if (qty <= 0) continue;
    if (l.isOverlayPool) standalone += qty;
    else if (l.wantsOverlay && l.offersOverlay) paired += qty;
  }
  return { paired, standalone, total: paired + standalone };
}

export type InventoryItem = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  sku: string | null;
  unit_cost: number | null;
  location: string | null;
  image_path: string | null;
  // Resolved by the API for display; not stored.
  image_url?: string | null;
  quantity_available: number;
  quantity_out: number;
  low_stock_threshold: number;
  // Whether this item can be checked out for a tradeshow (admin opt-in).
  checkout_enabled: boolean;
  // Whether the item is offered with a pizza box / plastic overlay at pickup.
  pizza_box: boolean;
  plastic_overlay: boolean;
  // Tags the two items that ARE the packaging stock pools (else null).
  packaging_role: PackagingRole | null;
  created_at: string;
  updated_at: string;
  // Convenience flag computed by the API.
  low_stock?: boolean;
};

export type CheckoutStatus = "out" | "returned";

export type ItemCheckout = {
  id: string;
  item_id: string;
  item_name?: string | null;
  event_name: string;
  quantity: number;
  taken_by: string | null;
  due_back_date: string | null;
  status: CheckoutStatus;
  checked_out_at: string;
  checked_out_by_name?: string | null;
  returned_at: string | null;
  returned_by_name?: string | null;
  quantity_returned: number | null;
  quantity_damaged: number;
  notes: string | null;
  // Computed by the API.
  overdue?: boolean;
};

export function isCheckoutStatus(key: string): key is CheckoutStatus {
  return key === "out" || key === "returned";
}

// Total physical units the company owns for an item: in stock + currently out.
export function totalOwned(item: { quantity_available: number; quantity_out: number }): number {
  return (item.quantity_available || 0) + (item.quantity_out || 0);
}

// Low stock: available at or below the per-item threshold. A threshold of 0
// disables the alert for that item.
export function isLowStock(item: { quantity_available: number; low_stock_threshold: number }): boolean {
  return item.low_stock_threshold > 0 && item.quantity_available <= item.low_stock_threshold;
}

// Today's calendar date (YYYY-MM-DD), the comparison basis for overdue checks.
export function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}

// Overdue: a loan still out whose due-back date is in the past.
export function isOverdue(
  c: { status: string; due_back_date: string | null },
  today: string = todayISODate()
): boolean {
  if (c.status !== "out" || !c.due_back_date) return false;
  return c.due_back_date < today;
}

// Display a unit cost, tolerating null. Stored as numeric; comes back as number.
export function formatUnitCost(v: number | string | null | undefined): string {
  if (v === null || v === undefined || v === "") return "—";
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? `$${n.toFixed(2)}` : "—";
}
