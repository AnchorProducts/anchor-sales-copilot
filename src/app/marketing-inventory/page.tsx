"use client";

import { useEffect, useState } from "react";
import { Card } from "@/app/components/ui/Card";
import { AppNavbar } from "@/app/components/ui/AppNavbar";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { useFormAccess } from "@/lib/role/useFormAccess";
import { inventoryCategoryLabel, type InventoryItem } from "@/lib/inventory";

export const dynamic = "force-dynamic";

export default function MarketingInventoryPage() {
  const { ready } = useFormAccess("sales");
  const { t } = useTranslation();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/inventory", { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (!alive) return;
        if (!res.ok) {
          setErr(json?.error || "Failed to load inventory.");
          return;
        }
        setItems(json?.items || []);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [ready]);

  return (
    <main className="ds-page">
      <AppNavbar
        title="Marketing Inventory"
        subtitle="What's in stock"
        menuItems={[{ label: t("dashboard"), href: "/dashboard" }]}
      />

      <div className="mx-auto max-w-5xl px-5 py-6">
        <Card className="mb-4 border-t-4 border-t-[var(--anchor-green)] p-6">
          <div className="ds-caption">Marketing Inventory</div>
          <h1 className="mt-2 text-2xl">Available marketing stock</h1>
          <p className="mt-1 text-sm text-[var(--anchor-gray)]">
            A read-only view of marketing items currently in stock. To request items, submit a marketing
            order.
          </p>
        </Card>

        {!ready || loading ? (
          <Card className="p-5 text-sm text-black/60">{t("loading")}</Card>
        ) : err ? (
          <Card className="border-red-200 bg-red-50 p-4 text-sm text-red-700">{err}</Card>
        ) : items.length === 0 ? (
          <Card className="p-6 text-sm text-[var(--anchor-gray)]">No items in stock yet.</Card>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {items.map((it) => (
              <Card key={it.id} className="flex gap-4 p-4">
                <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-[var(--surface-soft)]">
                  {it.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={it.image_url} alt={it.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-xs text-[var(--anchor-gray)]">
                      No photo
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-bold text-[var(--anchor-deep)]">{it.name}</h3>
                    {it.category && (
                      <span className="rounded-full bg-[var(--surface-strong)] px-2 py-0.5 text-xs text-[var(--anchor-gray)]">
                        {inventoryCategoryLabel(it.category)}
                      </span>
                    )}
                  </div>
                  {it.description && (
                    <p className="mt-0.5 text-sm text-[var(--anchor-gray)]">{it.description}</p>
                  )}
                  <p className="mt-2 text-sm">
                    {it.quantity_available > 0 ? (
                      <span className="font-semibold text-green-700">
                        In stock: {it.quantity_available}
                      </span>
                    ) : (
                      <span className="font-semibold text-[var(--anchor-gray)]">Out of stock</span>
                    )}
                  </p>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
