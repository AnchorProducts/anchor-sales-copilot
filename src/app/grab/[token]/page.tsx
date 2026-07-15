"use client";

// PUBLIC (no login) marketing-aisle pickup page, opened by scanning the aisle
// QR code. Shows an in-stock pick-list; tapping an item asks for name, email,
// and quantity, then records the pickup (which decrements stock). The name/email
// are remembered in localStorage so repeat pickups don't retype them.
//
// Reached at /grab/<token>; the token gates access via the public grab API.
// Uses only presentational UI (Card/Button/Input) — no auth context.

import { use, useCallback, useEffect, useState } from "react";
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

  const [openId, setOpenId] = useState<string | null>(null);
  const [qty, setQty] = useState("1");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [busy, setBusy] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ name: string; qty: number } | null>(null);

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
      // A per-item QR lands straight on that one item — open its form.
      if (singleItem && list.length === 1 && list[0].quantity_available > 0) {
        setOpenId(list[0].id);
        setQty("1");
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

  function openItem(it: GrabItem) {
    setFormErr(null);
    setDone(null);
    setQty("1");
    setOpenId(it.id);
  }

  async function submit(it: GrabItem) {
    setFormErr(null);
    const q = Math.floor(Number(qty));
    if (!name.trim()) return setFormErr("Enter your name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setFormErr("Enter a valid email.");
    if (!Number.isFinite(q) || q <= 0) return setFormErr("Enter a quantity of 1 or more.");
    if (q > it.quantity_available) return setFormErr(`Only ${it.quantity_available} left.`);

    setBusy(true);
    try {
      const res = await fetch("/api/public/grab", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          item_id: it.id,
          name: name.trim(),
          email: email.trim(),
          quantity: q,
          website,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setFormErr(json?.error || "Couldn't record that pickup.");
        // Stock may have changed under us — refresh the list.
        if (res.status === 409) void load();
        return;
      }
      try {
        localStorage.setItem(ID_KEY, JSON.stringify({ name: name.trim(), email: email.trim() }));
      } catch {
        /* ignore */
      }
      setDone({ name: it.name, qty: q });
      setOpenId(null);
      // Reflect the new count locally without a full reload.
      setItems((prev) =>
        prev
          .map((x) =>
            x.id === it.id ? { ...x, quantity_available: json?.quantity_available ?? x.quantity_available - q } : x
          )
          .filter((x) => x.quantity_available > 0)
      );
    } catch {
      setFormErr("Couldn't reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen bg-[var(--surface-soft,#f6f7f5)] px-4 py-6">
      <div className="mx-auto max-w-md">
        <header className="mb-4 text-center">
          <h1 className="text-xl font-bold text-[var(--anchor-deep,#0f2e2a)]">
            {categoryLabel ? `Marketing Aisle — ${categoryLabel}` : "Marketing Aisle"}
          </h1>
          <p className="mt-1 text-sm text-[var(--anchor-gray,#5b6b66)]">
            Taking something? Tap it, tell us who you are, and we&apos;ll update stock.
          </p>
        </header>

        {done && (
          <Card className="mb-4 border-green-200 bg-green-50 p-4 text-sm text-green-800">
            Thanks! Recorded <strong>{done.qty}</strong> × <strong>{done.name}</strong>. Grab another below if you need it.
          </Card>
        )}

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
              const open = openId === it.id;
              return (
                <Card key={it.id} className="overflow-hidden p-0">
                  <button
                    type="button"
                    onClick={() => (open ? setOpenId(null) : openItem(it))}
                    aria-expanded={open}
                    className="flex w-full items-center gap-3 p-3 text-left"
                  >
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
                      {it.quantity_available > 0 ? (
                        <p className="mt-0.5 text-xs font-semibold text-green-700">{it.quantity_available} in stock</p>
                      ) : (
                        <p className="mt-0.5 text-xs font-semibold text-[var(--anchor-gray,#5b6b66)]">Out of stock</p>
                      )}
                    </div>
                    <span className={`shrink-0 text-black/30 transition-transform ${open ? "rotate-180" : ""}`} aria-hidden>
                      ▾
                    </span>
                  </button>

                  {open && it.quantity_available <= 0 && (
                    <div className="border-t border-black/10 p-3 text-sm text-[var(--anchor-gray,#5b6b66)]">
                      This item is out of stock right now.
                    </div>
                  )}

                  {open && it.quantity_available > 0 && (
                    <div className="border-t border-black/10 p-3">
                      {formErr && (
                        <div className="mb-2 rounded-lg bg-red-50 p-2 text-xs text-red-700">{formErr}</div>
                      )}
                      <div className="grid gap-2.5">
                        <label className="block text-sm">
                          <span className="font-medium">How many?</span>
                          <Input
                            type="number"
                            inputMode="numeric"
                            min={1}
                            max={it.quantity_available}
                            step={1}
                            value={qty}
                            onChange={(e) => setQty(e.target.value)}
                          />
                        </label>
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
                        {/* Honeypot — visually hidden, off-screen; bots fill it, humans don't. */}
                        <input
                          type="text"
                          tabIndex={-1}
                          autoComplete="off"
                          aria-hidden="true"
                          value={website}
                          onChange={(e) => setWebsite(e.target.value)}
                          className="absolute left-[-9999px] h-0 w-0 opacity-0"
                        />
                        <Button onClick={() => submit(it)} disabled={busy}>
                          {busy ? "Saving…" : `I'm taking ${qty || 1}`}
                        </Button>
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}

        <p className="mt-5 text-center text-[11px] text-black/35">Anchor Products · Marketing inventory</p>
      </div>
    </main>
  );
}
