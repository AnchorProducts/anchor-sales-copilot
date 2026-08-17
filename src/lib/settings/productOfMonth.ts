// "Product of the Month" — the green pill at the top of the Resource Library.
//
// An admin points it at either one product (links straight to that tackle box)
// or a whole solution group (expands and scrolls to that section). Stored as a
// single row in app_settings so the two shapes can share one setting.

export const PRODUCT_OF_MONTH_KEY = "product_of_month";

export type ProductOfMonth =
  | { kind: "product"; productId: string; note?: string }
  | { kind: "group"; group: string; note?: string };

/** Narrow an untrusted app_settings.value into a usable setting, or null. */
export function parseProductOfMonth(value: unknown): ProductOfMonth | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const note = typeof v.note === "string" && v.note.trim() ? v.note.trim() : undefined;

  if (v.kind === "product" && typeof v.productId === "string" && v.productId.trim()) {
    return { kind: "product", productId: v.productId.trim(), note };
  }
  if (v.kind === "group" && typeof v.group === "string" && v.group.trim()) {
    return { kind: "group", group: v.group.trim(), note };
  }
  return null;
}
