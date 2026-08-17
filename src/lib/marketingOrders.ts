// Shared catalog for the Marketing Orders tool. Both the rep-facing form and the
// admin recipient-routing UI read from this list so category keys never drift.
//
// Email routing is per-category: admins map each `key` to a recipient address on
// the Notifications page (stored in notification_settings.marketing_orders_recipients).
// A category with no mapping falls back to the "default" key, then to env vars.

export type MarketingCategory = {
  key: string;
  label: string;
  description: string;
  // Whether a rep can request this type on a marketing order. The inventory tool
  // shares this list, so a category can exist purely to organize stock without
  // being something anyone orders — see "tradeshow" below.
  orderable: boolean;
};

export const MARKETING_CATEGORIES: MarketingCategory[] = [
  { key: "samples", label: "Samples", description: "Product samples and demo units.", orderable: true },
  {
    // Key stays "brochures": it's the stored value on every inventory item and
    // the mapping key for this category's recipient address. Only the label
    // changed, so nothing has to be re-filed or re-mapped.
    key: "brochures",
    label: "Printables",
    description: "Spec sheets, catalogs, and printed collateral.",
    orderable: true,
  },
  {
    key: "swag",
    label: "Swag",
    description: "Branded apparel, giveaways, and promotional items.",
    orderable: true,
  },
  {
    key: "tradeshow",
    label: "Tradeshow",
    description: "Booth kit, displays, banners — loaned out for an event and returned.",
    // Not orderable: this stock is borrowed and comes back, so it moves through
    // the tradeshow checkout flow rather than a marketing order that ships it
    // away and decrements it for good.
    orderable: false,
  },
  // Keep "other" last — it's the catch-all. Orderable so it appears as a chip
  // alongside the rest; the free-text "Other / not listed" box on the form
  // complements it for anything that isn't in the catalog at all.
  { key: "other", label: "Other", description: "Anything else — describe it below.", orderable: true },
];

export const MARKETING_CATEGORY_KEYS = MARKETING_CATEGORIES.map((c) => c.key);

export function isMarketingCategory(key: string): boolean {
  return MARKETING_CATEGORY_KEYS.includes(key);
}

export function marketingCategoryLabel(key: string): string {
  return MARKETING_CATEGORIES.find((c) => c.key === key)?.label || key;
}

// Label a list of category keys for display/email, e.g. "Samples, Swag".
export function marketingCategoriesLabel(keys: string[] | null | undefined): string {
  if (!keys || keys.length === 0) return "—";
  return keys.map(marketingCategoryLabel).join(", ");
}

// The per-category recipient map persisted on notification_settings. Keys are
// category keys (above) plus the special "default" fallback. Each category can
// route to MULTIPLE emails.
export type MarketingRecipients = Record<string, string[]>;

// Coerce a stored value into a clean email list. Tolerates the legacy single-
// string shape (pre-multi-recipient data in the JSONB column), a string[], or
// a comma/semicolon/newline-separated string. Lowercases, trims, and dedupes.
export function normalizeRecipientEmails(value: unknown): string[] {
  const raw: string[] = Array.isArray(value)
    ? value.map((v) => String(v ?? ""))
    : typeof value === "string"
      ? value.split(/[,;\n]/)
      : [];
  const out: string[] = [];
  for (const item of raw) {
    const email = item.trim().toLowerCase();
    if (email && !out.includes(email)) out.push(email);
  }
  return out;
}

// Normalize a whole stored recipients map (legacy strings → arrays).
export function normalizeMarketingRecipients(
  raw: Record<string, unknown> | null | undefined
): MarketingRecipients {
  const out: MarketingRecipients = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [key, value] of Object.entries(raw)) {
    const list = normalizeRecipientEmails(value);
    if (list.length > 0) out[key] = list;
  }
  return out;
}

// ────────────────────────────────────────────────────────────────────────────
// Large orders
//
// Past this many units OF A SINGLE TYPE (samples, printables, swag — counted per
// type, never summed across them), an order is big enough that pulling it from
// marketing stock is the wrong move. The order-notification email says so and
// points at NetSuite; nothing is blocked or flagged automatically. Whether it
// actually needs a custom run is the marketing admin's or inside rep's call,
// made by tagging the order in the queue.
// ────────────────────────────────────────────────────────────────────────────

export const MARKETING_LARGE_TYPE_THRESHOLD = 10;

// The types in an order that are over the threshold, biggest first, as
// `{ key, label, units }`. Input is units keyed by category. Empty = nothing to
// recommend, which is the common case.
export function typesOverThreshold(
  unitsByCategory: Record<string, number>
): { key: string; label: string; units: number }[] {
  return Object.entries(unitsByCategory)
    .filter(([, units]) => units > MARKETING_LARGE_TYPE_THRESHOLD)
    .map(([key, units]) => ({ key, label: marketingCategoryLabel(key), units }))
    .sort((a, b) => b.units - a.units);
}

// ────────────────────────────────────────────────────────────────────────────
// Custom orders
//
// A marketing admin or inside sales rep tags an order "needs custom order" when
// it can't be filled from marketing stock — the samples have to be ordered in
// specially. The tag does two things and nothing else:
//
//   1. Inventory stays unchanged. Fulfilling a custom order never decrements
//      marketing stock, because none of it was used.
//   2. The outside rep is told, on their tracker and by email, that this one
//      takes longer than a stock order.
//
// There is no separate request to file and no status of its own — the order's
// own status workflow below carries it.
// ────────────────────────────────────────────────────────────────────────────

// What the outside rep is told when their order is tagged. One sentence, used by
// the tracker banner, the email, and the push so the wording never drifts.
export const CUSTOM_ORDER_REP_NOTICE =
  "Inside sales is custom-ordering these samples rather than shipping them from stock, so this order takes longer than usual.";

// ────────────────────────────────────────────────────────────────────────────
// Order status workflow
//
// `new → processing → shipped → fulfilled` is the linear progress path the
// tracker renders as a stepper. `delayed` and `cancelled` are off-path states
// shown as banners instead of steps; `delayed` carries a projected ship date and
// a reason. Both the rep history view and the admin status editor read from this
// list so the allowed values never drift from the DB check constraint.
// ────────────────────────────────────────────────────────────────────────────

export type MarketingOrderStatus = {
  key: string;
  label: string;
  description: string;
};

// Ordered progress steps shown in the tracker (excludes "cancelled").
export const MARKETING_ORDER_PROGRESS: MarketingOrderStatus[] = [
  { key: "new", label: "New", description: "Order received." },
  { key: "processing", label: "Processing", description: "Being prepared by the marketing team." },
  { key: "shipped", label: "Shipped", description: "On its way to you." },
  { key: "fulfilled", label: "Fulfilled", description: "Delivered and complete." },
];

// Off-path: order is held up. Carries projected_ship_date + delay_notes.
export const MARKETING_ORDER_DELAYED: MarketingOrderStatus = {
  key: "delayed",
  label: "Delayed",
  description: "Held up — see the projected ship date and reason.",
};

export const MARKETING_ORDER_CANCELLED: MarketingOrderStatus = {
  key: "cancelled",
  label: "Cancelled",
  description: "This order was cancelled.",
};

// Every assignable status (progress steps + delayed + cancelled).
export const MARKETING_ORDER_STATUSES: MarketingOrderStatus[] = [
  ...MARKETING_ORDER_PROGRESS,
  MARKETING_ORDER_DELAYED,
  MARKETING_ORDER_CANCELLED,
];

export const MARKETING_ORDER_STATUS_KEYS = MARKETING_ORDER_STATUSES.map((s) => s.key);

export function isMarketingOrderStatus(key: string): boolean {
  return MARKETING_ORDER_STATUS_KEYS.includes(key);
}

export function marketingOrderStatusLabel(key: string | null | undefined): string {
  if (!key) return MARKETING_ORDER_PROGRESS[0].label;
  return MARKETING_ORDER_STATUSES.find((s) => s.key === key)?.label || key;
}

// Index of a status within the progress path; -1 for cancelled/unknown.
export function marketingOrderProgressIndex(key: string | null | undefined): number {
  if (!key) return 0;
  return MARKETING_ORDER_PROGRESS.findIndex((s) => s.key === key);
}

// Tailwind classes for a scannable colored status pill (used in list/card UIs).
export function marketingOrderStatusPill(key: string | null | undefined): string {
  switch (key) {
    case "delayed":
      return "bg-amber-100 text-amber-800";
    case "cancelled":
      return "bg-red-100 text-red-700";
    case "fulfilled":
      return "bg-[var(--anchor-mint)] text-[var(--anchor-deep)]";
    case "shipped":
    case "processing":
      return "bg-green-100 text-green-700";
    default: // new / unknown
      return "bg-[var(--surface-strong)] text-[var(--anchor-gray)]";
  }
}
