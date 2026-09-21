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
// Where stock lives
//
// Location was free text, so "Shelf B3", "shelf b3" and "Warehouse shelf B3"
// were three different places to anything trying to count what's on a shelf.
// These are the real ones.
//
// The list stays OPEN: "Add a new location" writes whatever's typed, and any
// location already sitting on an item joins the dropdown the next time one is
// opened. A new cabinet doesn't need a deploy — it needs one person to type it
// once.
// ────────────────────────────────────────────────────────────────────────────

export const INVENTORY_LOCATIONS: string[] = [
  // Every anchor is on the marketing side.
  "Marketing aisle",
  "Upstairs Suite A — island left cabinet",
  "Upstairs Suite A — island right cabinet",
  "Upstairs Suite A — marketing closet",
];

// Printables all live in the island's left cabinet for now, so a new one starts
// there instead of starting nowhere. A suggestion, not a rule: it only fills a
// location that's still empty and never overwrites one that's been chosen.
const DEFAULT_LOCATION_BY_CATEGORY: Record<string, string> = {
  // "brochures" is the stored key for the Printables category.
  brochures: "Upstairs Suite A — island left cabinet",
};

export function defaultLocationForCategory(category: string | null | undefined): string {
  return (category && DEFAULT_LOCATION_BY_CATEGORY[category]) || "";
}

// Every location worth offering: the known ones in their own order, then
// anything already on an item, then the value being edited — so a one-off
// someone typed last month can't vanish from its own dropdown. Matched
// case-insensitively so "marketing aisle" doesn't become a second aisle.
export function locationOptions(
  items: readonly { location?: string | null }[],
  current?: string | null
): string[] {
  const canonical = new Map<string, string>();
  for (const l of INVENTORY_LOCATIONS) canonical.set(l.toLowerCase(), l);

  const extras = new Map<string, string>();
  const add = (v?: string | null) => {
    const t = (v || "").trim();
    if (!t) return;
    const k = t.toLowerCase();
    if (!canonical.has(k) && !extras.has(k)) extras.set(k, t);
  };
  for (const i of items) add(i.location);
  add(current);

  return [
    ...canonical.values(),
    ...[...extras.values()].sort((a, b) => a.localeCompare(b)),
  ];
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
// Pre-assembled pizza boxes
//
// Marketing builds pizza boxes ahead of time so a rep takes a finished box off
// the shelf instead of five pieces and a brochure. Each box type — one per
// anchor sample offered with a pizza box — gets ONE QR label, shared by every
// box of that type; scanning it counts one box.
//
// Assembling reserves a box's contents: the anchor, that series' pieces and the
// printables every box gets (an app setting — see settings/pizzaBoxExtras) come
// off their loose counts, and the box goes on a ready count of its own (see
// Assembled boxes below). Scanning a box out takes it off that count, and
// whatever the rep pulls back out goes back on the loose counts.
// ────────────────────────────────────────────────────────────────────────────

// A sample that can be a pre-assembled box: offered with one, and its series is
// known — without a series there's no telling which pieces are inside.
export function isBoxType(item: PackagingPieceItem & { pizza_box?: boolean | null }): boolean {
  return !!item.pizza_box && !item.packaging_role && isPackagingKit(item.packaging_kit);
}

export type BoxPartKind = "anchor" | "piece" | "extra";

// One thing inside a box, and how many of it each box holds.
export type BoxPart = {
  item_id: string;
  name: string;
  kind: BoxPartKind;
  per_box: number;
  // Which kit piece this is, on a piece.
  role?: PackagingRole;
};

const BOX_PART_ORDER: Record<BoxPartKind, number> = { anchor: 0, piece: 1, extra: 2 };

// Everything a set of scanned boxes holds, added up per item — two box types
// that share a brochure put it on one line. Anchors, then pieces, then
// printables, each in the order first met. The scan page shows this sum and the
// API subtracts it, so the two can't disagree about what was in the boxes.
export function boxTotals(
  boxes: readonly { count: number; parts: readonly BoxPart[] }[]
): (BoxPart & { packed: number })[] {
  const lines = new Map<string, BoxPart & { packed: number }>();
  for (const b of boxes) {
    const count = Math.max(0, Math.floor(b.count) || 0);
    if (!count) continue;
    for (const p of b.parts) {
      const line = lines.get(p.item_id);
      if (line) line.packed += p.per_box * count;
      else lines.set(p.item_id, { ...p, packed: p.per_box * count });
    }
  }
  return [...lines.values()].sort((a, b) => BOX_PART_ORDER[a.kind] - BOX_PART_ORDER[b.kind]);
}

// The label on a box type: the aisle link (which carries the shared token) plus
// the box. Rotating the aisle token retires these along with every other code.
export function boxScanUrl(aisleUrl: string, boxId: string): string {
  return `${aisleUrl.replace(/\/+$/, "")}/boxes?box=${encodeURIComponent(boxId)}`;
}

// Which box a scanned code names, or "" when it isn't a box label — an item's
// shelf code, or a stray QR on a delivery.
export function boxIdFromScan(text: string): string {
  try {
    const url = new URL(text.trim());
    if (!/\/grab\/[^/]+\/boxes\/?$/.test(url.pathname)) return "";
    return (url.searchParams.get("box") || "").trim();
  } catch {
    return "";
  }
}

type CatalogItem = PackagingPieceItem & {
  id: string;
  name: string;
  box_of?: string | null;
  quantity_available?: number;
};

// What one box of a type holds: the anchor, that series' pieces in assembly
// order, then the printables every box gets. The scanner, the order form and
// both inventory pages all build a box through here, so none of them can list
// a different box. An extra whose item has been deleted drops out.
export function boxParts(
  anchor: { id: string; name: string; packaging_kit?: string | null },
  items: readonly CatalogItem[],
  extras: readonly { item_id: string; quantity: number }[]
): BoxPart[] {
  const parts: BoxPart[] = [{ item_id: anchor.id, name: anchor.name, kind: "anchor", per_box: 1 }];
  for (const c of PIZZA_BOX_COMPONENTS) {
    const piece = findKitPiece(items, anchor.packaging_kit, c.key);
    if (piece) parts.push({ item_id: piece.id, name: piece.name, kind: "piece", per_box: 1, role: c.key });
  }
  for (const e of extras) {
    const it = items.find((i) => i.id === e.item_id);
    if (it) parts.push({ item_id: it.id, name: it.name, kind: "extra", per_box: e.quantity });
  }
  return parts;
}

// A box's contents past the anchor, as one line: "under insert + overlay +
// over insert + box + 1 × Booklet (New)".
export function describeBoxContents(parts: readonly BoxPart[]): string {
  const out: string[] = [];
  const pieces = describeComponents(parts.filter((p) => p.kind === "piece" && p.role).map((p) => p.role!));
  if (pieces) out.push(pieces);
  for (const p of parts) if (p.kind === "extra") out.push(`${p.per_box} × ${p.name}`);
  return out.join(" + ");
}

// How a boxed sample ships, once the rep has taken anything out of its box:
// "pizza box (…everything…)", "pizza box without 1 × Tri-Fold Brochure",
// "anchor + overlay, no box", or "anchor only". Taking the anchor itself out
// adds what replaces it: "… — 2600 Sika PVC in place of 2400 IB PVC", or
// "— no anchor". `swap` is the replacement's name as the order should read it.
// Used on the order form and in the order's own line, so what the rep picked
// is what fulfillment reads.
export function describeBoxChoice(
  parts: readonly BoxPart[],
  removed: readonly string[],
  swap?: string | null
): string {
  const gone = new Set(removed);
  const anchor = parts.find((p) => p.kind === "anchor");
  const anchorOut = !!anchor && gone.has(anchor.item_id);
  const kept = parts.filter((p) => p.kind !== "anchor" && !gone.has(p.item_id));
  const dropped = parts.filter((p) => p.kind !== "anchor" && gone.has(p.item_id));
  let out: string;
  if (!dropped.length) {
    const contents = describeBoxContents(parts);
    out = `pizza box${contents ? ` (${contents})` : ""}`;
  } else if (!kept.length) {
    out = anchorOut ? "" : "anchor only";
  } else if (kept.some((p) => p.role === "pizza_box")) {
    out = `pizza box without ${describeBoxContents(dropped)}`;
  } else {
    out = `${anchorOut ? "" : "anchor + "}${describeBoxContents(kept)}, no box`;
  }
  if (!anchorOut) return out;
  if (!out) return swap ? `${swap} only` : "nothing";
  return `${out} — ${swap ? `${swap} in place of ${anchor!.name}` : "no anchor"}`;
}

// Whether a boxed sample, as trimmed, still sends anything at all.
export function boxChoiceIsEmpty(parts: readonly BoxPart[], removed: readonly string[], swapped: boolean): boolean {
  return !swapped && parts.every((p) => removed.includes(p.item_id));
}

// A loose anchor that can go in a box in place of its own: any sample that
// isn't a kit piece or an assembled box, other than the box's own anchor.
export function isSwapAnchor(
  item: PackagingPieceItem & { id: string; category?: string | null; box_of?: string | null },
  boxAnchorId: string
): boolean {
  return item.category === "samples" && !item.packaging_role && !item.box_of && item.id !== boxAnchorId;
}

// The quick choices on a boxed sample, as the items taken out of the box:
// everything but the anchor ("anchor"), or everything but the anchor and its
// plastic overlay ("overlay").
export function boxPresetRemoval(parts: readonly BoxPart[], preset: "overlay" | "anchor"): string[] {
  return parts
    .filter((p) => p.kind !== "anchor" && !(preset === "overlay" && p.role === "overlay"))
    .map((p) => p.item_id);
}

// How many more boxes the loose stock could be assembled into, and what runs
// out first — the scarcest part decides it.
export function buildableBoxes(
  parts: readonly BoxPart[],
  items: readonly { id: string; quantity_available: number }[]
): { count: number; limitedBy: string | null } {
  let count = Infinity;
  let limitedBy: string | null = null;
  for (const p of parts) {
    const have = items.find((i) => i.id === p.item_id)?.quantity_available ?? 0;
    const n = Math.floor(Math.max(0, have) / p.per_box);
    if (n < count) {
      count = n;
      limitedBy = p.name;
    }
  }
  return { count: Number.isFinite(count) ? count : 0, limitedBy };
}

// The series an anchor's name says it is — "3400 …" is a 3000 Series anchor.
// A suggestion when setting a sample up as a box, never applied on its own.
export function seriesFromName(name: string): PackagingKit | null {
  const d = name.trim().charAt(0);
  return d === "2" ? "2000" : d === "3" ? "3000" : d === "5" ? "5000" : null;
}

// ────────────────────────────────────────────────────────────────────────────
// Assembled boxes
//
// An assembled box is its own stock. Each box type has one inventory item —
// "2400 IB PVC — Pizza Box" — pointing at its anchor through box_of, whose
// quantity_available is the boxes built and ready. Assembling takes the box's
// contents off their loose counts and adds to it; unboxing reverses that. So
// the order form, the aisle and the rep page, which all read loose counts, only
// ever see stock that's actually free: an OEM order for 100 anchors can't be
// filled by quietly opening boxes.
//
// Being an ordinary item means orders, fulfillment, aisle returns and low-stock
// alerts already work on boxes without learning anything new.
// ────────────────────────────────────────────────────────────────────────────

// The ready-box item for an anchor, if any has ever been assembled.
export function findReadyBox<T extends { box_of?: string | null }>(items: readonly T[], anchorId: string): T | null {
  return items.find((i) => i.box_of === anchorId) || null;
}

// What a ready-box item is called — named after its anchor, so it reads right
// in the item list, on a pick sheet and in the aisle log.
export function readyBoxName(anchorName: string): string {
  return `${anchorName} — Pizza Box`;
}

// One pass of the box scanner, as the admin log reads it.
export type BoxScanRow = {
  id: string;
  scanned_by_name: string;
  scanned_by_email: string;
  box_count: number;
  boxes: { item_id: string; name: string; count: number }[];
  lines: { item_id: string; name: string; packed: number; quantity: number; removed: number; short: number }[];
  created_at: string;
};

// ────────────────────────────────────────────────────────────────────────────
// Ordering samples as pizza boxes
//
// A sample on a marketing order ships one of three ways: as a whole pizza box,
// with a plastic overlay, or on its own. The rep must say which whenever there
// is a choice, and the server only honours an answer the item supports.
// ────────────────────────────────────────────────────────────────────────────

export type OrderPackaging = "box" | "overlay" | "none";

type PackagingChoiceItem = PackagingPieceItem & {
  pizza_box?: boolean | null;
  plastic_overlay?: boolean | null;
};

// The ways this item can ship, or none when there's nothing to ask.
export function packagingOptions(item: PackagingChoiceItem): OrderPackaging[] {
  const out: OrderPackaging[] = [];
  if (isBoxType(item)) out.push("box");
  if (item.plastic_overlay) out.push("overlay");
  if (out.length) out.push("none");
  return out;
}

// A requested answer, kept only if the item supports it.
export function resolvePackaging(item: PackagingChoiceItem, requested: unknown): OrderPackaging {
  if (requested === "box" && isBoxType(item)) return "box";
  if (requested === "overlay" && item.plastic_overlay) return "overlay";
  return "none";
}

// Everything an order pulls from stock, per item id: each picked item, a
// paired overlay off that sample's series, and the whole contents of every
// pizza box. Recorded on the order so fulfillment pre-fills it instead of the
// fulfiller rebuilding a box from free text.
export function orderStockPlan(
  lines: readonly {
    item: CatalogItem & PackagingChoiceItem;
    quantity: number;
    packaging: OrderPackaging;
    // Item ids taken out of a boxed sample's pizza box — the anchor included.
    remove?: readonly string[];
    // An inventory anchor that goes in the box in place of its own.
    swapItemId?: string | null;
  }[],
  items: readonly CatalogItem[],
  extras: readonly { item_id: string; quantity: number }[]
): { plan: Record<string, number>; boxes: number } {
  const plan: Record<string, number> = {};
  let boxes = 0;
  const add = (id: string, n: number) => {
    plan[id] = (plan[id] || 0) + n;
  };
  for (const l of lines) {
    const qty = Math.max(0, Math.floor(l.quantity) || 0);
    if (!qty) continue;
    if (l.packaging === "box" && isBoxType(l.item)) {
      const parts = boxParts(l.item, items, extras);
      const removed = new Set((l.remove || []).filter((id) => parts.some((p) => p.item_id === id)));
      if (l.swapItemId) removed.add(l.item.id);
      if (!parts.some((p) => p.role === "pizza_box" && removed.has(p.item_id))) boxes += qty;
      const kept = parts.filter((p) => !removed.has(p.item_id));
      const ready = findReadyBox(items, l.item.id);
      const looseCovers =
        !kept.length ||
        buildableBoxes(
          kept,
          items.map((i) => ({ id: i.id, quantity_available: i.quantity_available ?? 0 }))
        ).count >= qty;
      if (ready && (removed.size === 0 || !looseCovers)) {
        // Send assembled boxes — they're their own stock. A trimmed-down sample
        // opens one only when the loose parts it keeps can't cover it: the box
        // comes off whole, and what was taken out goes back on the shelf (a
        // negative line).
        add(ready.id, qty);
        for (const p of parts) if (removed.has(p.item_id)) add(p.item_id, -p.per_box * qty);
      } else {
        // Nothing assembled to open, or the loose parts cover a trimmed-down
        // sample: build it from the loose parts that are kept.
        for (const p of kept) add(p.item_id, p.per_box * qty);
      }
      // The anchor that went in instead. A custom anchor isn't stock, so it
      // only shows on the order's line.
      if (l.swapItemId) add(l.swapItemId, qty);
      continue;
    }
    add(l.item.id, qty);
    if (l.packaging === "overlay" && l.item.plastic_overlay) {
      const overlay = findKitPiece(items, l.item.packaging_kit, "overlay");
      if (overlay) add(overlay.id, qty);
    }
  }
  // A put-back and a take of the same item can cancel out; a zero is no row.
  for (const [id, n] of Object.entries(plan)) if (!n) delete plan[id];
  return { plan, boxes };
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
  // Set on an assembled-box item: the anchor whose pizza boxes it counts. Its
  // quantity_available is the boxes assembled and ready. Null everywhere else,
  // and absent before 20260915_000002.
  box_of?: string | null;
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
