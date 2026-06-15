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
};

export const MARKETING_CATEGORIES: MarketingCategory[] = [
  { key: "samples", label: "Samples", description: "Product samples and demo units." },
  { key: "brochures", label: "Brochures", description: "Spec sheets, catalogs, and printed collateral." },
  { key: "swag", label: "Swag", description: "Branded apparel, giveaways, and promotional items." },
  { key: "other", label: "Other", description: "Anything else — describe it below." },
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
