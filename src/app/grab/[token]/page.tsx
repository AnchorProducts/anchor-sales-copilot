"use client";

// PUBLIC (no login) marketing-aisle pickup page, opened by scanning the aisle
// QR code. A cart: enter name + email ONCE, set a quantity on any number of
// items, then take them all in one tap. Recording a pickup decrements stock.
// The name/email are remembered in localStorage so the next visit is prefilled.
//
// Reached at /grab/<token>; the token gates access via the public grab API.
// ?cat=<key> filters to a category (per-category QR); ?item=<id> focuses one
// item (per-item shelf QR). Uses only presentational UI — no auth context.

import { use, useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/app/components/ui/Card";
import Button from "@/app/components/ui/Button";
import { Input } from "@/app/components/ui/Field";
import { inventoryCategoryLabel, isInventoryCategory } from "@/lib/inventory";

export const dynamic = "force-dynamic";

type GrabItem = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  quantity_available: number;
  image_url: string | null;
};

const ID_KEY = "anchor-grab-identity";

export default function GrabPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ cat?: string; item?: string }>;
}) {
  const { token } = use(params);
  const { cat, item } = use(searchParams);
  const category = cat && isInventoryCategory(cat) ? cat : "";
  const categoryLabel = category ? inventoryCategoryLabel(category) : "";
  const singleItem = (item || "").trim();

  const [items, setItems] = useState<GrabItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [qty, setQty] = useState<Record<string, number>>({}); // item id -> units
  const [busy, setBusy] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ count: number; units: number; failed: string[] } | null>(null);

  // Restore a remembered identity so repeat pickups skip the typing.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(ID_KEY) || "null");
      if (saved?.name) setName(String(saved.name));
      if (saved?.email) setEmail(String(saved.email));
    } catch {
      /* ignore */
    }
  }, []);

  const load = useCallback(async () => {
    setLoadErr(null);
    try {
      const q = singleItem
        ? `&item=${encodeURIComponent(singleItem)}`
        : category
          ? `&cat=${encodeURIComponent(category)}`
          : "";
      const res = await fetch(`/api/public/grab?token=${encodeURIComponent(token)}${q}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setLoadErr(json?.error || "This pickup link is invalid or disabled.");
        return;
      }
      const list: GrabItem[] = json?.items || [];
      setItems(list);
      // A per-item QR lands on one item — start it at 1 so it's one tap to take.
      if (singleItem && list.length === 1 && list[0].quantity_available > 0) {
        setQty({ [list[0].id]: 1 });
      }
    } catch {
      setLoadErr("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [token, category, singleItem]);

  useEffect(() => {
    load();
  }, [load]);

  function setItemQty(it: GrabItem, next: number) {
    const clamped = Math.max(0, Math.min(next, it.quantity_available));
    setQty((prev) => {
      const copy = { ...prev };
      if (clamped <= 0) delete copy[it.id];
      else copy[it.id] = clamped;
      return copy;
    });
  }

  const selected = useMemo(
    () => items.filter((it) => (qty[it.id] || 0) > 0),
    [items, qty]
  );
  const totalUnits = useMemo(
    () => selected.reduce((n, it) => n + (qty[it.id] || 0), 0),
    [selected, qty]
  );

  async function submit() {
    setFormErr(null);
    if (!selected.length) return setFormErr("Add a quantity to at least one item.");
    if (!name.trim()) return setFormErr("Enter your name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setFormErr("Enter a valid email.");

    setBusy(true);
    try {
      const res = await fetch("/api/public/grab", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          name: name.trim(),
          email: email.trim(),
          website,
          items: selected.map((it) => ({ item_id: it.id, quantity: qty[it.id] })),
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setFormErr(json?.error || "Couldn't record that pickup.");
        if (res.status === 409) void load(); // stock moved under us — refresh
        return;
      }
      try {
        localStorage.setItem(ID_KEY, JSON.stringify({ name: name.trim(), email: email.trim() }));
      } catch {
        /* ignore */
      }
      const taken = (json?.taken || []) as { quantity: number }[];
      const failed = (json?.failed || []) as { item_name: string; error: string }[];
      setDone({
        count: taken.length,
        units: taken.reduce((n, t) => n + (t.quantity || 0), 0),
        failed: failed.map((f) => `${f.item_name}: ${f.error}`),
      });
      setQty({});
      await load(); // refresh remaining counts
    } catch {
      setFormErr("Couldn't reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[var(--surface-soft,#f6f7f5)] px-4 pb-28 pt-6">
      <div className="mx-auto max-w-md">
        <header className="mb-4 text-center">
          <h1 className="text-xl font-bold text-[var(--anchor-deep,#0f2e2a)]">
            {categoryLabel ? `Marketing Aisle — ${categoryLabel}` : "Marketing Aisle"}
          </h1>
          <p className="mt-1 text-sm text-[var(--anchor-gray,#5b6b66)]">
            Set how many of each you&apos;re taking, add your name once, and tap Take.
          </p>
        </header>

        {done && (
          <Card className="mb-4 border-green-200 bg-green-50 p-4 text-sm text-green-800">
            Thanks! Recorded <strong>{done.units}</strong> unit{done.units === 1 ? "" : "s"} across{" "}
            <strong>{done.count}</strong> item{done.count === 1 ? "" : "s"}.
            {done.failed.length > 0 && (
              <div className="mt-2 text-amber-800">
                Couldn&apos;t take: {done.failed.join("; ")}.
              </div>
            )}
          </Card>
        )}

        {/* Identity — entered once for everything in the cart. */}
        {!loading && !loadErr && items.length > 0 && (
          <Card className="mb-4 p-4">
            <div className="grid gap-2.5">
              <label className="block text-sm">
                <span className="font-medium">Your name</span>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="First and last" />
              </label>
              <label className="block text-sm">
                <span className="font-medium">Your email</span>
                <Input
                  type="email"
                  inputMode="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                />
              </label>
              {/* Honeypot — off-screen; bots fill it, humans don't. */}
              <input
                type="text"
                tabIndex={-1}
                autoComplete="off"
                aria-hidden="true"
                value={website}
                onChange={(e) => setWebsite(e.target.value)}
                className="absolute left-[-9999px] h-0 w-0 opacity-0"
              />
            </div>
          </Card>
        )}

        {formErr && <Card className="mb-3 border-red-200 bg-red-50 p-3 text-sm text-red-700">{formErr}</Card>}

        {loading ? (
          <Card className="p-5 text-sm text-black/60">Loading…</Card>
        ) : loadErr ? (
          <Card className="border-red-200 bg-red-50 p-4 text-sm text-red-700">{loadErr}</Card>
        ) : items.length === 0 ? (
          <Card className="p-6 text-center text-sm text-[var(--anchor-gray,#5b6b66)]">
            {categoryLabel ? `No ${categoryLabel.toLowerCase()} in stock right now.` : "Nothing in stock right now."}
          </Card>
        ) : (
          <div className="grid gap-2.5">
            {items.map((it) => {
              const n = qty[it.id] || 0;
              const out = it.quantity_available <= 0;
              return (
                <Card key={it.id} className={`flex items-center gap-3 p-3 ${n > 0 ? "ring-2 ring-[var(--anchor-green,#1f8a4c)]" : ""}`}>
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-black/5">
                    {it.image_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={it.image_url} alt={it.name} className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-[10px] text-black/40">
                        No photo
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-sm font-bold text-[var(--anchor-deep,#0f2e2a)]">{it.name}</h3>
                    {it.description && (
                      <p className="truncate text-xs text-[var(--anchor-gray,#5b6b66)]">{it.description}</p>
                    )}
                    {out ? (
                      <p className="mt-0.5 text-xs font-semibold text-[var(--anchor-gray,#5b6b66)]">Out of stock</p>
                    ) : (
                      <p className="mt-0.5 text-xs font-semibold text-green-700">{it.quantity_available} in stock</p>
                    )}
                  </div>

                  {/* Quantity stepper */}
                  {!out && (
                    <div className="flex shrink-0 items-center gap-1.5">
                      <button
                        type="button"
                        aria-label={`Remove one ${it.name}`}
                        onClick={() => setItemQty(it, n - 1)}
                        disabled={n <= 0}
                        className="flex h-9 w-9 items-center justify-center rounded-full border border-black/15 text-lg font-bold text-[var(--anchor-deep,#0f2e2a)] disabled:opacity-30"
                      >
                        −
                      </button>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={it.quantity_available}
                        value={n === 0 ? "" : n}
                        placeholder="0"
                        onChange={(e) => setItemQty(it, Math.floor(Number(e.target.value) || 0))}
                        className="h-9 w-11 rounded-lg border border-black/15 text-center text-sm"
                      />
                      <button
                        type="button"
                        aria-label={`Add one ${it.name}`}
                        onClick={() => setItemQty(it, n + 1)}
                        disabled={n >= it.quantity_available}
                        className="flex h-9 w-9 items-center justify-center rounded-full border border-black/15 text-lg font-bold text-[var(--anchor-deep,#0f2e2a)] disabled:opacity-30"
                      >
                        +
                      </button>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}

        <p className="mt-5 text-center text-[11px] text-black/35">Anchor Products · Marketing inventory</p>
      </div>

      {/* Sticky action bar — appears once something is selected. */}
      {selected.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 border-t border-black/10 bg-white/95 p-3 backdrop-blur">
          <div className="mx-auto flex max-w-md items-center gap-3">
            <div className="min-w-0 flex-1 text-sm">
              <div className="font-semibold text-[var(--anchor-deep,#0f2e2a)]">
                {totalUnits} unit{totalUnits === 1 ? "" : "s"} · {selected.length} item{selected.length === 1 ? "" : "s"}
              </div>
              <button
                type="button"
                onClick={() => setQty({})}
                className="text-xs text-[var(--anchor-gray,#5b6b66)] underline"
              >
                Clear
              </button>
            </div>
            <Button onClick={submit} disabled={busy} className="shrink-0">
              {busy ? "Recording…" : `Take ${totalUnits}`}
            </Button>
          </div>
        </div>
      )}
    </main>
  );
}
