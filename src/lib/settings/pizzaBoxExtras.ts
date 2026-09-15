// What goes in every pre-assembled pizza box besides the anchor and its series'
// four packaging pieces — the printables marketing packs into each one.
//
// One app_settings row rather than a field per sample: every box gets the same
// printables whatever anchor is inside, so it's set once, from the Pizza box
// labels window in Marketing Inventory.

export const PIZZA_BOX_EXTRAS_KEY = "pizza_box_extras";

// A sanity ceiling per box, not a business rule.
export const MAX_EXTRA_PER_BOX = 20;

export type BoxExtra = { item_id: string; quantity: number };

/** Narrow an untrusted app_settings.value ({ items: [...] }) into a clean list. */
export function parseBoxExtras(value: unknown): BoxExtra[] {
  const raw = (value as { items?: unknown } | null)?.items;
  const list = Array.isArray(raw) ? raw : [];
  const out: BoxExtra[] = [];
  for (const r of list) {
    const o = (r || {}) as Record<string, unknown>;
    const id = typeof o.item_id === "string" ? o.item_id.trim() : "";
    const qty = Math.floor(Number(o.quantity));
    if (!id || !Number.isFinite(qty) || qty <= 0) continue;
    if (out.some((e) => e.item_id === id)) continue;
    out.push({ item_id: id, quantity: Math.min(qty, MAX_EXTRA_PER_BOX) });
  }
  return out;
}
