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

// ────────────────────────────────────────────────────────────────────────────
// Pizza box kits
//
// A finished pizza box is five physical pieces, not one: the anchor sample
// itself plus four packaging pieces. And there is a full set of those pieces per
// anchor series — the 2000 Series box is not the 3000 Series box.
//
// So a piece is addressed by a PAIR: which kit (series) and which role. Each
// piece is its own inventory item — its own photo, count, low-stock threshold
// and restock — tagged with packaging_kit + packaging_role, so taking a sample
// "for a pizza box" subtracts exactly the pieces, of exactly the series, the
// person says they need. The anchor is deliberately NOT one of the roles: it's
// the item being picked, and its own count already moved.
//
// packaging_kit means two related things depending on the row:
//   • on a packaging piece (packaging_role set) — which kit this piece belongs to
//   • on a sample (packaging_role null)         — which kit its box comes from
//
// One item per (kit, role); a partial unique index enforces it.
// ────────────────────────────────────────────────────────────────────────────

// The anchor series a pizza box is built for.
export type PackagingKit = "2000" | "3000" | "5000";

export type PizzaBoxKit = {
  key: PackagingKit;
  label: string;
  // The 5000 Series hasn't launched. Nothing is stocked for it, so it stays out
  // of the aisle on its own — this only softens the admin card's empty state
  // from "nobody set this up" to "there's nothing to set up yet", and stops
  // mattering the moment a piece exists.
  preLaunch?: boolean;
};

export const PIZZA_BOX_KITS: PizzaBoxKit[] = [
  { key: "2000", label: "2000 Series" },
  { key: "3000", label: "3000 Series" },
  { key: "5000", label: "5000 Series", preLaunch: true },
];

export const PACKAGING_KITS: PackagingKit[] = PIZZA_BOX_KITS.map((k) => k.key);

export function isPackagingKit(v: unknown): v is PackagingKit {
  return typeof v === "string" && (PACKAGING_KITS as string[]).includes(v);
}

export function packagingKitLabel(kit: string | null | undefined): string {
  return PIZZA_BOX_KITS.find((k) => k.key === kit)?.label || "";
}

// Which inventory item, if any, is a packaging stock pool.
export type PackagingRole = "pizza_box" | "overlay" | "insert_under" | "insert_over";

export type PizzaBoxComponent = {
  key: PackagingRole;
  // What the person picking stock sees on the aisle page.
  label: string;
  // The piece named as a noun, for "This item IS <the box> for …" in the editor.
  adminLabel: string;
  // A short badge for item cards and the pickup log.
  short: string;
};

// Assembly order, outside in — the order the pieces are laid up in the box, and
// the order they're listed everywhere they appear.
export const PIZZA_BOX_COMPONENTS: PizzaBoxComponent[] = [
  {
    key: "insert_under",
    label: "Under-anchor insert",
    adminLabel: "the under-anchor insert",
    short: "Under insert",
  },
  {
    key: "overlay",
    label: "Plastic overlay",
    adminLabel: "the plastic overlay",
    short: "Overlay",
  },
  {
    key: "insert_over",
    label: "Over-anchor insert (foldable)",
    adminLabel: "the over-anchor insert (foldable)",
    short: "Over insert",
  },
  {
    key: "pizza_box",
    label: "The box",
    adminLabel: "the box",
    short: "Box",
  },
];

export const PACKAGING_ROLES: PackagingRole[] = PIZZA_BOX_COMPONENTS.map((c) => c.key);

export function isPackagingRole(v: unknown): v is PackagingRole {
  return typeof v === "string" && (PACKAGING_ROLES as string[]).includes(v);
}

export function packagingRoleLabel(role: string | null | undefined): string {
  return PIZZA_BOX_COMPONENTS.find((c) => c.key === role)?.label || "";
}

export function packagingRoleShort(role: string | null | undefined): string {
  return PIZZA_BOX_COMPONENTS.find((c) => c.key === role)?.short || "";
}

// Keep a caller's component list honest: real roles only, no duplicates, always
// in assembly order. Optionally narrowed to a set of allowed roles (the aisle
// API passes the pieces that actually exist as inventory items).
export function normalizeComponents(
  raw: unknown,
  allowed?: readonly string[]
): PackagingRole[] {
  const list = Array.isArray(raw) ? raw : [];
  const wanted = new Set(list.filter(isPackagingRole));
  return PACKAGING_ROLES.filter(
    (k) => wanted.has(k) && (!allowed || allowed.includes(k))
  );
}

// The human sentence for a set of pieces: "box + overlay + under insert".
export function describeComponents(components: readonly string[]): string {
  return PIZZA_BOX_COMPONENTS.filter((c) => components.includes(c.key))
    .map((c) => c.short.toLowerCase())
    .join(" + ");
}

// An item that IS a packaging piece, as far as any lookup cares.
export type PackagingPieceItem = {
  packaging_kit?: string | null;
  packaging_role?: string | null;
};

// The item that is one kit's piece — the single address for "the 3000 Series
// overlay". Both the aisle and the order path resolve pools through here so
// they can't disagree about which count a piece comes off.
export function findKitPiece<T extends PackagingPieceItem>(
  items: readonly T[],
  kit: string | null | undefined,
  role: PackagingRole
): T | null {
  if (!kit) return null;
  return items.find((i) => i.packaging_kit === kit && i.packaging_role === role) || null;
}

// The kits that have at least one piece set up — the ones the aisle can actually
// subtract from, and the reason the unlaunched 5000 Series needs no flag to stay
// hidden there.
export function stockedKits(items: readonly PackagingPieceItem[]): PackagingKit[] {
  return PACKAGING_KITS.filter((kit) =>
    items.some((i) => i.packaging_kit === kit && !!i.packaging_role)
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Overlays
//
// A plastic overlay reaches a customer two ways: on its own (the pool item is
// picked straight from the catalog — how inside sales ships overlays and nothing
// else), or paired one-for-one with an anchor sample that offers one. Both come
// off the same inventory row FOR THAT SERIES — the item tagged packaging_role =
// 'overlay' with that packaging_kit — so the two paths can't drift into separate
// counts, and a 3000 Series sample can't quietly spend 2000 Series overlays.
//
// One function computes the totals, used by the order form to preview them and
// by the API to record them. Server-side is authoritative: the client's flags
// are honored only for items that actually offer an overlay.
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
  // Which kit's overlay this line spends: the sample's own kit when paired, the
  // pool item's kit when ordered on its own. Null when the item has no kit set,
  // which is why the split can total less than `total`.
  kit?: string | null;
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
  // Overlays per kit — which count each one actually comes off. An item with no
  // kit set contributes to the totals but to no kit, so `byKit` can sum to less
  // than `total`; that gap is the signal that something needs a kit assigned.
  byKit: Record<string, number>;
} {
  let paired = 0;
  let standalone = 0;
  const byKit: Record<string, number> = {};
  const spend = (kit: string | null | undefined, qty: number) => {
    if (!isPackagingKit(kit)) return;
    byKit[kit] = (byKit[kit] || 0) + qty;
  };
  for (const l of lines) {
    const qty = Math.max(0, Math.floor(l.quantity) || 0);
    if (qty <= 0) continue;
    if (l.isOverlayPool) {
      standalone += qty;
      spend(l.kit, qty);
    } else if (l.wantsOverlay && l.offersOverlay) {
      paired += qty;
      spend(l.kit, qty);
    }
  }
  return { paired, standalone, total: paired + standalone, byKit };
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
  // Belongs to the current Product of the Month — surfaced by the order form's
  // chip of that name, on top of the item's own category.
  product_of_month: boolean;
  // Tags an item that IS one of a kit's packaging pieces (else null).
  packaging_role: PackagingRole | null;
  // Which pizza box kit this item belongs to: the piece's own kit when it IS a
  // piece, or the kit a sample's box comes from. Null when neither applies.
  packaging_kit: PackagingKit | null;
  created_at: string;
  updated_at: string;
  // Convenience flag computed by the API.
  low_stock?: boolean;
};

// ────────────────────────────────────────────────────────────────────────────
// Aisle pickups
//
// A pickup used to be permanent. It isn't: people take a stack for a job, use
// some, and bring the rest back to the shelf. `quantity_returned` is how much of
// a pickup has come back, so `grabOutstanding` is what that person is still
// holding — which is exactly what the public return page lists and caps against.
// ────────────────────────────────────────────────────────────────────────────

export type GrabRecord = {
  id: string;
  item_id: string | null;
  item_name: string;
  grabbed_by_name: string;
  grabbed_by_email: string;
  quantity: number;
  quantity_returned?: number;
  // Kit pieces that went out with this line, in assembly order, and the series
  // they came from.
  components?: string[];
  packaging_kit?: string | null;
  // Kept in step with `components` for the pre-kit reading of the log.
  pizza_box?: boolean;
  plastic_overlay?: boolean;
  created_at: string;
};

// Units of a pickup still in someone's hands.
export function grabOutstanding(g: { quantity: number; quantity_returned?: number | null }): number {
  return Math.max(0, (g.quantity || 0) - (g.quantity_returned || 0));
}

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
