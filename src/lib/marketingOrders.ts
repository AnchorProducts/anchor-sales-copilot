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

// The per-category recipient map persisted on notification_settings. Keys are
// category keys (above) plus the special "default" fallback. Values are emails.
export type MarketingRecipients = Record<string, string>;
