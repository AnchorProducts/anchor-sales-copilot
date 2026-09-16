"use client";

import { useEffect, useMemo, useState } from "react";
import { Card } from "@/app/components/ui/Card";
import { AppNavbar } from "@/app/components/ui/AppNavbar";
import Button from "@/app/components/ui/Button";
import Modal from "@/app/components/ui/Modal";
import { Input, Textarea } from "@/app/components/ui/Field";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { useFormAccess } from "@/lib/role/useFormAccess";
import {
  INVENTORY_CATEGORIES,
  PIZZA_BOX_KITS,
  TRADESHOW_CATEGORY,
  boxParts,
  describeBoxContents,
  findReadyBox,
  inventoryCategoryLabel,
  isBoxType,
  packagingKitLabel,
  todayISODate,
  type InventoryItem,
} from "@/lib/inventory";
import type { BoxExtra } from "@/lib/settings/pizzaBoxExtras";

// The chip for pre-assembled pizza boxes on their own — not a real category.
const BOXES_FILTER = "boxes";

// A boxed anchor's stock: the pizza boxes it's already packed in, plus any loose
// anchors. "Out of stock" for 41 anchors sitting in boxes told reps the wrong
// thing.
function BoxedStock({ ready, loose }: { ready: number; loose: number }) {
  if (ready + loose <= 0) return <span className="font-semibold text-[var(--anchor-gray)]">Out of stock</span>;
  return (
    <span className="font-semibold text-green-700">
      🍕 {ready} in pizza boxes
      {loose > 0 && <span className="font-normal text-[var(--anchor-gray)]"> · {loose} loose</span>}
    </span>
  );
}

export const dynamic = "force-dynamic";

export default function MarketingInventoryPage() {
  const { ready, effectiveRole } = useFormAccess("sales");
  const { t } = useTranslation();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [catFilter, setCatFilter] = useState("");
  // The printables every pizza box gets, and — for inside reps — the box
  // scanner's link.
  const [boxExtras, setBoxExtras] = useState<BoxExtra[]>([]);
  const [scannerUrl, setScannerUrl] = useState("");

  // ?cat=<key> so the order form's "check out tradeshow items" link lands on
  // the tradeshow shelf rather than on everything. ?cat=boxes opens on the
  // pizza boxes.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const cat = new URLSearchParams(window.location.search).get("cat") || "";
    if (cat === BOXES_FILTER || INVENTORY_CATEGORIES.some((c) => c.key === cat)) setCatFilter(cat);
  }, []);

  // Tradeshow stock goes out on loan and comes back, and inside reps are the
  // ones taking it to the show — the checkout API has always let them
  // (canWriteInventory covers anchor_rep), they just had no way to say so from
  // their own page. Outside reps stay read-only: the API refuses them, so
  // offering the button would only produce a 403.
  const canCheckOut = effectiveRole === "anchor_rep";

  // For someone who can check out, Tradeshow is the reason they're here — it's
  // the only category on this page that is theirs to act on. Everything else
  // keeps its order.
  const orderedCategories = useMemo(
    () =>
      canCheckOut
        ? [
            ...INVENTORY_CATEGORIES.filter((c) => c.key === TRADESHOW_CATEGORY),
            ...INVENTORY_CATEGORIES.filter((c) => c.key !== TRADESHOW_CATEGORY),
          ]
        : INVENTORY_CATEGORIES,
    [canCheckOut]
  );

  const [checkoutItem, setCheckoutItem] = useState<InventoryItem | null>(null);
  const [eventName, setEventName] = useState("");
  const [qty, setQty] = useState("1");
  const [dueBack, setDueBack] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [modalErr, setModalErr] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  function openCheckout(it: InventoryItem) {
    setCheckoutItem(it);
    setEventName("");
    setQty("1");
    setDueBack("");
    setNotes("");
    setModalErr(null);
  }

  async function submitCheckout() {
    if (!checkoutItem) return;
    setSaving(true);
    setModalErr(null);
    try {
      const res = await fetch("/api/inventory/checkouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item_id: checkoutItem.id,
          event_name: eventName,
          quantity: Number(qty),
          due_back_date: dueBack || null,
          notes: notes || null,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setModalErr(json?.error || "Couldn't check this out.");
        return;
      }
      setDone(`${checkoutItem.name} checked out for ${eventName}.`);
      setCheckoutItem(null);
      await reload();
    } catch (e) {
      setModalErr(e instanceof Error ? e.message : "Couldn't check this out.");
    } finally {
      setSaving(false);
    }
  }

  async function reload() {
    const res = await fetch("/api/inventory", { cache: "no-store" });
    const json = await res.json().catch(() => null);
    if (res.ok) {
      setItems(json?.items || []);
      setBoxExtras(json?.box_extras || []);
    }
  }

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      // Assembled boxes are shown as boxes, in the section above — not as a
      // second copy of each anchor in the stock list.
      if (it.box_of) return false;
      if (catFilter && it.category !== catFilter) return false;
      if (!q) return true;
      return (
        it.name.toLowerCase().includes(q) ||
        (it.sku || "").toLowerCase().includes(q) ||
        (it.description || "").toLowerCase().includes(q)
      );
    });
  }, [items, search, catFilter]);

  // Pre-assembled pizza boxes, one per anchor that ships as one. An assembled
  // box is its own stock — its anchor and pieces already came off the loose
  // counts below — so "ready" is exactly the boxes on the shelf.
  const hasBoxes = useMemo(() => items.some(isBoxType), [items]);
  const boxes = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items
      .filter(isBoxType)
      .filter((it) => !q || it.name.toLowerCase().includes(q))
      .map((it) => ({ it, ready: findReadyBox(items, it.id)?.quantity_available ?? 0 }));
  }, [items, search]);
  const boxContents = useMemo(
    () =>
      PIZZA_BOX_KITS.filter((k) => boxes.some((b) => b.it.packaging_kit === k.key)).map((k) => ({
        key: k.key,
        label: k.label,
        contents: describeBoxContents(boxParts({ id: "", name: "", packaging_kit: k.key }, items, boxExtras)),
      })),
    [boxes, items, boxExtras]
  );
  const showBoxes =
    boxes.length > 0 && (catFilter === "" || catFilter === BOXES_FILTER || catFilter === "samples");

  // Inside reps take boxes off the shelf themselves, so they get the scanner.
  // Its link carries the aisle token, which only the fulfillment team can read.
  useEffect(() => {
    if (!ready || !canCheckOut) return;
    let alive = true;
    (async () => {
      const res = await fetch("/api/inventory/aisle-qr", { cache: "no-store" }).catch(() => null);
      const json = res ? await res.json().catch(() => null) : null;
      if (alive && res?.ok && json?.url) setScannerUrl(`${json.url}/boxes`);
    })();
    return () => {
      alive = false;
    };
  }, [ready, canCheckOut]);

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
        setBoxExtras(json?.box_extras || []);
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

      <div className="mx-auto max-w-5xl px-5 pt-6 pb-[calc(6rem+env(safe-area-inset-bottom))] lg:pb-6">
        <Card className="mb-4 border-t-4 border-t-[var(--anchor-green)] p-6">
          <div className="ds-caption">Marketing Inventory</div>
          <h1 className="mt-2 text-2xl">Available marketing stock</h1>
          <p className="mt-1 text-sm text-[var(--anchor-gray)]">
            {canCheckOut
              ? "Marketing items currently in stock. To request items, submit a marketing order — tradeshow gear is checked out here instead, and booked back in when it returns."
              : "A read-only view of marketing items currently in stock. To request items, submit a marketing order."}
          </p>
        </Card>

        {!ready || loading ? (
          <Card className="p-5 text-sm text-black/60">{t("loading")}</Card>
        ) : err ? (
          <Card className="border-red-200 bg-red-50 p-4 text-sm text-red-700">{err}</Card>
        ) : items.length === 0 ? (
          <Card className="p-6 text-sm text-[var(--anchor-gray)]">No items in stock yet.</Card>
        ) : (
          <>
            <div className="mb-3 flex flex-col gap-2">
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or SKU…"
              />
              <div className="flex flex-wrap gap-1.5">
                <button
                  type="button"
                  onClick={() => setCatFilter("")}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    catFilter === ""
                      ? "bg-[var(--anchor-green)] text-white"
                      : "border border-[var(--border-default)] bg-white text-[var(--anchor-deep)]"
                  }`}
                >
                  All
                </button>
                {hasBoxes && (
                  <button
                    type="button"
                    onClick={() => setCatFilter(BOXES_FILTER)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      catFilter === BOXES_FILTER
                        ? "bg-[var(--anchor-green)] text-white"
                        : "border border-[var(--border-default)] bg-white text-[var(--anchor-deep)]"
                    }`}
                  >
                    🍕 Pizza boxes
                  </button>
                )}
                {orderedCategories.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setCatFilter(c.key)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${
                      catFilter === c.key
                        ? "bg-[var(--anchor-green)] text-white"
                        : "border border-[var(--border-default)] bg-white text-[var(--anchor-deep)]"
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            {showBoxes && (
              <Card className="mb-4 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-base font-bold text-[var(--anchor-deep)]">🍕 Pizza boxes</h2>
                    <p className="mt-0.5 text-xs text-[var(--anchor-gray)]">
                      Anchor samples are packed in their pizza boxes. On a marketing order a sample ships in its
                      box — take anything out of it, or ask for just the anchor
                      {canCheckOut ? ". Taking boxes off the shelf yourself? Scan them out." : "."}
                    </p>
                    {boxContents.map((k) => (
                      <p key={k.key} className="mt-0.5 text-xs text-[var(--anchor-deep)]">
                        <strong>{k.label}:</strong> the anchor{k.contents ? ` + ${k.contents}` : ""}
                      </p>
                    ))}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {scannerUrl && (
                      <a
                        href={scannerUrl}
                        className="inline-flex items-center rounded-xl bg-[var(--anchor-green)] px-3 py-2 text-xs font-semibold text-white"
                      >
                        📷 Scan boxes out
                      </a>
                    )}
                    <a
                      href="/marketing-orders"
                      className="inline-flex items-center rounded-xl border border-[var(--border-default)] bg-white px-3 py-2 text-xs font-semibold text-[var(--anchor-deep)]"
                    >
                      Order boxes
                    </a>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {boxes.map(({ it, ready }) => (
                    <div
                      key={it.id}
                      className="flex min-w-0 items-center gap-3 rounded-xl border border-[var(--border-default)] p-2.5"
                    >
                      <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-[var(--surface-soft)]">
                        {it.image_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={it.image_url} alt="" className="h-full w-full object-cover" />
                        ) : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-[var(--anchor-deep)]">{it.name}</div>
                        <div className="text-[11px] text-[var(--anchor-gray)]">{packagingKitLabel(it.packaging_kit)}</div>
                        <div className={`truncate text-xs font-semibold ${ready > 0 ? "text-green-700" : "text-amber-700"}`}>
                          {ready > 0 ? `${ready} in pizza boxes` : "None boxed right now"}
                          {it.quantity_available > 0 && (
                            <span className="font-normal text-[var(--anchor-gray)]"> · {it.quantity_available} loose</span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {canCheckOut && catFilter === TRADESHOW_CATEGORY && (
              <Card className="mb-3 border-[var(--anchor-deep)]/20 bg-[var(--anchor-mint)]/30 p-3 text-sm text-[var(--anchor-deep)]">
                Tradeshow gear is a loan, not an order: check it out for the show, and marketing books
                it back in when it returns.
              </Card>
            )}

            {done && (
              <Card className="mb-3 border-green-200 bg-green-50 p-3 text-sm text-green-800">
                {done} It&apos;s booked out to you until the marketing team checks it back in.
              </Card>
            )}

            {catFilter === BOXES_FILTER ? (
              !showBoxes && (
                <Card className="p-6 text-sm text-[var(--anchor-gray)]">No pizza boxes match your search.</Card>
              )
            ) : filteredItems.length === 0 ? (
              <Card className="p-6 text-sm text-[var(--anchor-gray)]">No items match your search.</Card>
            ) : (
              <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {filteredItems.map((it) => (
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
                        <h3 className="text-base font-bold leading-snug text-[var(--anchor-deep)] break-words">
                          {it.name}
                        </h3>
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
                        {isBoxType(it) ? (
                          <BoxedStock
                            ready={findReadyBox(items, it.id)?.quantity_available ?? 0}
                            loose={it.quantity_available}
                          />
                        ) : it.quantity_available > 0 ? (
                          <span className="font-semibold text-green-700">
                            In stock: {it.quantity_available}
                          </span>
                        ) : (
                          <span className="font-semibold text-[var(--anchor-gray)]">Out of stock</span>
                        )}
                        {it.quantity_out > 0 && (
                          <span className="ml-2 text-[var(--anchor-gray)]">· {it.quantity_out} out on loan</span>
                        )}
                      </p>
                      {canCheckOut && it.checkout_enabled && (
                        <Button
                          variant="secondary"
                          className="mt-2"
                          disabled={it.quantity_available <= 0}
                          onClick={() => openCheckout(it)}
                        >
                          {it.quantity_available > 0 ? "Check out" : "None available"}
                        </Button>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <Modal open={!!checkoutItem} onClose={() => setCheckoutItem(null)} className="max-w-md">
        {checkoutItem && (
          <div className="p-5">
            <h2 className="text-lg font-bold text-[var(--anchor-deep)]">Check out</h2>
            <p className="mt-0.5 text-sm text-[var(--anchor-gray)]">
              {checkoutItem.name} · {checkoutItem.quantity_available} available
            </p>
            {modalErr && <div className="mt-2 rounded-lg bg-red-50 p-2 text-sm text-red-700">{modalErr}</div>}
            <div className="mt-3 grid gap-3">
              <label className="block text-sm">
                <span className="font-medium">Event *</span>
                <Input
                  value={eventName}
                  onChange={(e) => setEventName(e.target.value)}
                  placeholder="e.g. IRE Orlando"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm">
                  <span className="font-medium">Quantity</span>
                  <Input
                    type="number"
                    min="1"
                    step="1"
                    value={qty}
                    onChange={(e) => setQty(e.target.value)}
                  />
                </label>
                <label className="block text-sm">
                  <span className="font-medium">Back by</span>
                  <Input
                    type="date"
                    min={todayISODate()}
                    value={dueBack}
                    onChange={(e) => setDueBack(e.target.value)}
                  />
                </label>
              </div>
              <label className="block text-sm">
                <span className="font-medium">Notes</span>
                <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setCheckoutItem(null)} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={submitCheckout} disabled={saving || !eventName.trim()}>
                {saving ? "Checking out…" : "Check out"}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </main>
  );
}
