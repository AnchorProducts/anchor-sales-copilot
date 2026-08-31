"use client";

// PUBLIC (no login) marketing-aisle page, opened by scanning the aisle QR code.
// Two halves of the same honor system:
//
//   Take    — a cart: enter name + email ONCE, set a quantity on any number of
//             items, then take them all in one tap. Stock drops immediately.
//             A sample offered with a pizza box asks whether these are FOR a
//             pizza box and, if so, which pieces of the box are needed. Each
//             piece is its own inventory item, one set per anchor series, so the
//             aisle keeps a real count of 2000 Series boxes separately from
//             3000 Series ones instead of guessing at them.
//   Return  — look up what you still have out (by the email you used) and put
//             the unused part back on the shelf, pieces and all. Without this
//             the count only ever went down and the aisle drifted low on its own.
//
// The name/email are remembered in localStorage so the next visit is prefilled.
//
// Reached at /grab/<token>; the token gates access via the public grab API.
// ?cat=<key> filters to a category (per-category QR); ?item=<id> focuses one
// item (per-item shelf QR). Uses only presentational UI — no auth context.

import { use, useCallback, useEffect, useMemo, useState } from "react";
import { Card } from "@/app/components/ui/Card";
import Button from "@/app/components/ui/Button";
import { Input } from "@/app/components/ui/Field";
import {
  inventoryCategoryLabel,
  isInventoryCategory,
  packagingKitLabel,
  PIZZA_BOX_COMPONENTS,
  type PackagingRole,
} from "@/lib/inventory";

export const dynamic = "force-dynamic";

type GrabItem = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  quantity_available: number;
  pizza_box: boolean;
  plastic_overlay: boolean;
  packaging_role: string | null;
  // Which pizza box kit this sample's box comes from, when it has one.
  packaging_kit: string | null;
  image_url: string | null;
};

// A pizza-box piece the aisle actually stocks, as the API reports it.
type PackagingPiece = {
  key: PackagingRole;
  label: string;
  name: string;
  quantity_available: number;
  image_url: string | null;
};

// One anchor series' kit — only kits with pieces set up are sent, so an
// unlaunched series simply isn't offered.
type KitPayload = {
  kit: string;
  label: string;
  pieces: PackagingPiece[];
};

type Pickup = {
  id: string;
  item_name: string;
  quantity: number;
  quantity_returned: number;
  outstanding: number;
  components: PackagingRole[];
  packaging_kit: string | null;
  kit_label: string;
  created_at: string;
};

const ID_KEY = "anchor-grab-identity";

function fmtDate(s: string) {
  try {
    return new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return s;
  }
}

// A piece checkbox with its photo — the same control in both halves of the page.
function PieceRow({
  piece,
  checked,
  onToggle,
  showStock,
}: {
  piece: PackagingPiece;
  checked: boolean;
  onToggle: () => void;
  showStock: boolean;
}) {
  return (
    <label className="flex items-center gap-2 rounded-lg border border-black/10 bg-white px-2 py-1.5">
      <input type="checkbox" checked={checked} onChange={onToggle} />
      <span className="h-8 w-8 shrink-0 overflow-hidden rounded bg-black/5">
        {piece.image_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={piece.image_url} alt="" className="h-full w-full object-cover" />
        ) : null}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-xs font-medium text-[var(--anchor-deep,#0f2e2a)]">{piece.label}</span>
        {showStock && (
          <span
            className={`block text-[10px] ${
              piece.quantity_available > 0 ? "text-[var(--anchor-gray,#5b6b66)]" : "text-amber-700"
            }`}
          >
            {piece.quantity_available > 0 ? `${piece.quantity_available} in stock` : "none on the shelf"}
          </span>
        )}
      </span>
    </label>
  );
}

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

  const [mode, setMode] = useState<"take" | "return">("take");
  const [items, setItems] = useState<GrabItem[]>([]);
  const [kits, setKits] = useState<KitPayload[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [qty, setQty] = useState<Record<string, number>>({}); // item id -> units
  // Per item: whether this pick is FOR a pizza box, and which pieces are needed.
  // undefined = not answered yet, so neither Yes nor No reads as chosen.
  const [forBox, setForBox] = useState<Record<string, boolean | undefined>>({});
  const [comps, setComps] = useState<Record<string, PackagingRole[]>>({});
  // Which series a line's box comes from, for a sample that hasn't been assigned
  // one in admin. An item that knows its own kit never consults this.
  const [lineKit, setLineKit] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [formErr, setFormErr] = useState<string | null>(null);
  const [done, setDone] = useState<{ count: number; units: number; failed: string[] } | null>(null);

  // Return half: the person's outstanding pickups and what's coming back.
  const [pickups, setPickups] = useState<Pickup[] | null>(null);
  const [retQty, setRetQty] = useState<Record<string, number>>({});
  const [retComps, setRetComps] = useState<Record<string, PackagingRole[]>>({});
  const [retDone, setRetDone] = useState<{ units: number; failed: string[] } | null>(null);

  const kitByKey = useMemo(() => {
    const m = new Map<string, KitPayload>();
    for (const k of kits) m.set(k.kit, k);
    return m;
  }, [kits]);

  // Which series a line draws from: the item's own kit, then whatever the person
  // picked for it, then the only stocked kit if there's just one. An item that
  // knows its series is never overridden — not even when that series has no
  // pieces set up yet, because substituting another series' box is worse than
  // offering none.
  const kitFor = useCallback(
    (it: GrabItem): string =>
      it.packaging_kit || lineKit[it.id] || (kits.length === 1 ? kits[0].kit : ""),
    [lineKit, kits]
  );

  // The pieces of one series, in assembly order — the checkbox list shown once
  // someone says a pick is for a pizza box.
  const piecesFor = useCallback(
    (kit: string): PackagingPiece[] => kitByKey.get(kit)?.pieces || [],
    [kitByKey]
  );

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
      setKits(json?.kits || []);
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

  // Saying yes to "for a pizza box?" pre-checks every piece of that series: a
  // complete box needs all of them, and unticking what you already have is
  // quicker than ticking four boxes each time.
  function setForPizzaBox(it: GrabItem, on: boolean) {
    setForBox((prev) => ({ ...prev, [it.id]: on }));
    const keys = on ? piecesFor(kitFor(it)).map((p) => p.key) : [];
    setComps((prev) => ({ ...prev, [it.id]: keys }));
  }

  // Choosing the series for a line re-ticks that series' pieces, so switching
  // from 2000 to 3000 can't leave a piece the new kit doesn't stock ticked.
  function chooseKit(it: GrabItem, kit: string) {
    setLineKit((prev) => ({ ...prev, [it.id]: kit }));
    setComps((prev) => ({ ...prev, [it.id]: piecesFor(kit).map((p) => p.key) }));
  }

  function toggleComp(itemId: string, key: PackagingRole) {
    setComps((prev) => {
      const cur = prev[itemId] || [];
      const next = cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key];
      return { ...prev, [itemId]: next };
    });
  }

  function toggleRetComp(grabId: string, key: PackagingRole) {
    setRetComps((prev) => {
      const cur = prev[grabId] || [];
      const next = cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key];
      return { ...prev, [grabId]: next };
    });
  }

  const selected = useMemo(() => items.filter((it) => (qty[it.id] || 0) > 0), [items, qty]);
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
          items: selected.map((it) => ({
            item_id: it.id,
            quantity: qty[it.id],
            kit: kitFor(it) || null,
            components: comps[it.id] || [],
          })),
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
      setComps({});
      setForBox({});
      setLineKit({});
      setPickups(null); // the return list is stale now
      await load(); // refresh remaining counts
    } catch {
      setFormErr("Couldn't reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  }

  // ── Return half ────────────────────────────────────────────────────────────

  const lookupPickups = useCallback(async () => {
    setFormErr(null);
    setRetDone(null);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setFormErr("Enter the email you used when you took them.");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(
        `/api/public/grab/return?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email.trim())}`,
        { cache: "no-store" }
      );
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setFormErr(json?.error || "Couldn't look that up.");
        return;
      }
      setPickups(json?.pickups || []);
      setRetQty({});
      setRetComps({});
    } catch {
      setFormErr("Couldn't reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  }, [email, token]);

  // Bringing units back pre-checks the pieces that went out with them, the same
  // way taking pre-checks a whole box — untick the insert you already folded.
  function setReturnQty(p: Pickup, next: number) {
    const clamped = Math.max(0, Math.min(next, p.outstanding));
    setRetQty((prev) => {
      const copy = { ...prev };
      if (clamped <= 0) delete copy[p.id];
      else copy[p.id] = clamped;
      return copy;
    });
    setRetComps((prev) => {
      if (clamped <= 0) {
        const copy = { ...prev };
        delete copy[p.id];
        return copy;
      }
      return prev[p.id] ? prev : { ...prev, [p.id]: [...p.components] };
    });
  }

  const returning = useMemo(
    () => (pickups || []).filter((p) => (retQty[p.id] || 0) > 0),
    [pickups, retQty]
  );
  const returningUnits = useMemo(
    () => returning.reduce((n, p) => n + (retQty[p.id] || 0), 0),
    [returning, retQty]
  );

  async function submitReturn() {
    setFormErr(null);
    if (!returning.length) return setFormErr("Set how many you're bringing back.");
    if (!name.trim()) return setFormErr("Enter your name.");

    setBusy(true);
    try {
      const res = await fetch("/api/public/grab/return", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token,
          name: name.trim(),
          email: email.trim(),
          website,
          returns: returning.map((p) => ({
            grab_id: p.id,
            quantity: retQty[p.id],
            components: retComps[p.id] || [],
          })),
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setFormErr(json?.error || "Couldn't record that return.");
        if (res.status === 409) void lookupPickups();
        return;
      }
      try {
        localStorage.setItem(ID_KEY, JSON.stringify({ name: name.trim(), email: email.trim() }));
      } catch {
        /* ignore */
      }
      const back = (json?.returned || []) as { quantity: number }[];
      const failed = (json?.failed || []) as { item_name: string; error: string }[];
      setRetDone({
        units: back.reduce((n, r) => n + (r.quantity || 0), 0),
        failed: failed.map((f) => `${f.item_name}: ${f.error}`),
      });
      setRetQty({});
      setRetComps({});
      await lookupPickups();
      void load(); // the shelf counts just went up
    } catch {
      setFormErr("Couldn't reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  }

  function switchMode(next: "take" | "return") {
    setMode(next);
    setFormErr(null);
    setDone(null);
    setRetDone(null);
  }

  const identityCard = (
    <Card className="mb-4 p-4">
      <div className="grid grid-cols-1 gap-2.5">
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
        {mode === "return" && (
          <Button variant="secondary" onClick={lookupPickups} disabled={busy}>
            {busy ? "Looking…" : "Find what I have out"}
          </Button>
        )}
      </div>
    </Card>
  );

  return (
    <main className="min-h-screen bg-[var(--surface-soft,#f6f7f5)] px-4 pb-28 pt-6">
      <div className="mx-auto max-w-md">
        <header className="mb-4 text-center">
          <h1 className="text-xl font-bold text-[var(--anchor-deep,#0f2e2a)]">
            {categoryLabel ? `Marketing Aisle — ${categoryLabel}` : "Marketing Aisle"}
          </h1>
          <p className="mt-1 text-sm text-[var(--anchor-gray,#5b6b66)]">
            {mode === "take"
              ? "Set how many of each you're taking, add your name once, and tap Take."
              : "Bringing some back? Look up what you have out and put it back on the count."}
          </p>
        </header>

        {/* Take / Return — the same aisle, both directions. */}
        <div className="mb-4 grid grid-cols-2 gap-2">
          {(["take", "return"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => switchMode(m)}
              className={`rounded-xl px-3 py-2 text-sm font-semibold ${
                mode === m
                  ? "bg-[var(--anchor-green,#1f8a4c)] text-white"
                  : "border border-black/15 bg-white text-[var(--anchor-deep,#0f2e2a)]"
              }`}
            >
              {m === "take" ? "Take items" : "Return items"}
            </button>
          ))}
        </div>

        {done && (
          <Card className="mb-4 border-green-200 bg-green-50 p-4 text-sm text-green-800">
            Thanks! Recorded <strong>{done.units}</strong> unit{done.units === 1 ? "" : "s"} across{" "}
            <strong>{done.count}</strong> item{done.count === 1 ? "" : "s"}.
            {done.failed.length > 0 && (
              <div className="mt-2 text-amber-800">Couldn&apos;t take: {done.failed.join("; ")}.</div>
            )}
          </Card>
        )}

        {retDone && (
          <Card className="mb-4 border-green-200 bg-green-50 p-4 text-sm text-green-800">
            Thanks! Put <strong>{retDone.units}</strong> unit{retDone.units === 1 ? "" : "s"} back on the shelf.
            {retDone.failed.length > 0 && (
              <div className="mt-2 text-amber-800">Couldn&apos;t return: {retDone.failed.join("; ")}.</div>
            )}
          </Card>
        )}

        {/* Identity — entered once, and it's also the return lookup. */}
        {!loadErr && (mode === "return" || (!loading && items.length > 0)) && identityCard}

        {formErr && <Card className="mb-3 border-red-200 bg-red-50 p-3 text-sm text-red-700">{formErr}</Card>}

        {loading ? (
          <Card className="p-5 text-sm text-black/60">Loading…</Card>
        ) : loadErr ? (
          <Card className="border-red-200 bg-red-50 p-4 text-sm text-red-700">{loadErr}</Card>
        ) : mode === "return" ? (
          pickups === null ? (
            <Card className="p-6 text-center text-sm text-[var(--anchor-gray,#5b6b66)]">
              Enter the email you used when you took them, then tap “Find what I have out”.
            </Card>
          ) : pickups.length === 0 ? (
            <Card className="p-6 text-center text-sm text-[var(--anchor-gray,#5b6b66)]">
              Nothing out under that email in the last six months.
            </Card>
          ) : (
            <div className="grid grid-cols-1 gap-2.5">
              {pickups.map((p) => {
                const n = retQty[p.id] || 0;
                const chosen = retComps[p.id] || [];
                return (
                  <Card
                    key={p.id}
                    className={`flex flex-col gap-2 p-3 ${n > 0 ? "ring-2 ring-[var(--anchor-green,#1f8a4c)]" : ""}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <h3 className="text-sm font-bold leading-snug text-[var(--anchor-deep,#0f2e2a)] break-words">
                          {p.item_name}
                        </h3>
                        <p className="mt-0.5 text-xs text-[var(--anchor-gray,#5b6b66)]">
                          Taken {fmtDate(p.created_at)} · {p.quantity} unit{p.quantity === 1 ? "" : "s"}
                          {p.quantity_returned > 0 ? ` · ${p.quantity_returned} back` : ""}
                        </p>
                        <p className="mt-0.5 text-xs font-semibold text-green-700">{p.outstanding} still out</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <button
                          type="button"
                          aria-label={`Return one fewer ${p.item_name}`}
                          onClick={() => setReturnQty(p, n - 1)}
                          disabled={n <= 0}
                          className="flex h-9 w-9 items-center justify-center rounded-full border border-black/15 text-lg font-bold text-[var(--anchor-deep,#0f2e2a)] disabled:opacity-30"
                        >
                          −
                        </button>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={p.outstanding}
                          value={n === 0 ? "" : n}
                          placeholder="0"
                          onChange={(e) => setReturnQty(p, Math.floor(Number(e.target.value) || 0))}
                          className="h-9 w-11 rounded-lg border border-black/15 text-center text-sm"
                        />
                        <button
                          type="button"
                          aria-label={`Return one more ${p.item_name}`}
                          onClick={() => setReturnQty(p, n + 1)}
                          disabled={n >= p.outstanding}
                          className="flex h-9 w-9 items-center justify-center rounded-full border border-black/15 text-lg font-bold text-[var(--anchor-deep,#0f2e2a)] disabled:opacity-30"
                        >
                          +
                        </button>
                      </div>
                    </div>

                    {/* Which pieces are coming back with them. */}
                    {n > 0 && p.components.length > 0 && (
                      <div className="border-t border-black/10 pt-2">
                        <p className="mb-1.5 text-xs font-semibold text-[var(--anchor-deep,#0f2e2a)]">
                          Bringing back unused {p.kit_label ? `${p.kit_label} ` : ""}pizza-box pieces?
                        </p>
                        <div className="grid grid-cols-1 gap-1.5">
                          {p.components.map((key) => {
                            const piece =
                              piecesFor(p.packaging_kit || "").find((x) => x.key === key) ||
                              ({
                                key,
                                label: PIZZA_BOX_COMPONENTS.find((c) => c.key === key)?.label || key,
                                name: key,
                                quantity_available: 0,
                                image_url: null,
                              } as PackagingPiece);
                            return (
                              <PieceRow
                                key={key}
                                piece={piece}
                                checked={chosen.includes(key)}
                                onToggle={() => toggleRetComp(p.id, key)}
                                showStock={false}
                              />
                            );
                          })}
                        </div>
                        <p className="mt-1 text-[11px] text-[var(--anchor-gray,#5b6b66)]">
                          Untick anything you used — only ticked pieces go back on the count.
                        </p>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )
        ) : items.length === 0 ? (
          <Card className="p-6 text-center text-sm text-[var(--anchor-gray,#5b6b66)]">
            {categoryLabel ? `No ${categoryLabel.toLowerCase()} in stock right now.` : "Nothing in stock right now."}
          </Card>
        ) : (
          // grid-cols-1, not a bare `grid`: an implicit auto track sizes to
          // max-content, and the descriptions below are `truncate`
          // (white-space: nowrap), so max-content is the whole untruncated
          // string. That blew every card out to ~840px inside a 448px column and
          // pushed the quantity steppers off the side of a phone. grid-cols-1 is
          // minmax(0, 1fr), which caps the track at the container.
          <div className="grid grid-cols-1 gap-2.5">
            {items.map((it) => {
              const n = qty[it.id] || 0;
              const out = it.quantity_available <= 0;
              const chosen = comps[it.id] || [];
              const boxed = forBox[it.id];
              const itemKit = kitFor(it);
              const overlayPiece = piecesFor(itemKit).find((p) => p.key === "overlay") || null;
              return (
                <Card
                  key={it.id}
                  className={`flex flex-col gap-2 p-3 ${n > 0 ? "ring-2 ring-[var(--anchor-green,#1f8a4c)]" : ""}`}
                >
                  <div className="flex items-center gap-3">
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
                      <h3 className="text-sm font-bold leading-snug text-[var(--anchor-deep,#0f2e2a)] break-words">
                        {it.name}
                      </h3>
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
                  </div>

                  {/* Pizza box: the question first, the pieces only if it's a
                      yes — and the series in between when the item doesn't
                      already know which one it belongs to. */}
                  {!out && n > 0 && it.pizza_box && kits.length > 0 && (
                    <div className="border-t border-black/10 pt-2">
                      <p className="text-xs font-semibold text-[var(--anchor-deep,#0f2e2a)]">
                        Are these for a pizza box?
                      </p>
                      <div className="mt-1.5 flex gap-2">
                        {([true, false] as const).map((v) => (
                          <button
                            key={String(v)}
                            type="button"
                            onClick={() => setForPizzaBox(it, v)}
                            className={`rounded-lg px-3 py-1 text-xs font-semibold ${
                              boxed === v
                                ? "bg-[var(--anchor-green,#1f8a4c)] text-white"
                                : "border border-black/15 bg-white text-[var(--anchor-deep,#0f2e2a)]"
                            }`}
                          >
                            {v ? "Yes" : "No"}
                          </button>
                        ))}
                      </div>

                      {boxed === true && (
                        <div className="mt-2">
                          {/* An item assigned to a series says so; one that
                              isn't asks, rather than quietly spending another
                              series' pieces. */}
                          {it.packaging_kit ? (
                            <p className="mb-1.5 text-[11px] text-[var(--anchor-gray,#5b6b66)]">
                              {packagingKitLabel(it.packaging_kit)} kit
                            </p>
                          ) : (
                            <div className="mb-2">
                              <p className="mb-1 text-xs font-semibold text-[var(--anchor-deep,#0f2e2a)]">
                                Which pizza box?
                              </p>
                              <div className="flex flex-wrap gap-1.5">
                                {kits.map((k) => (
                                  <button
                                    key={k.kit}
                                    type="button"
                                    onClick={() => chooseKit(it, k.kit)}
                                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${
                                      itemKit === k.kit
                                        ? "bg-[var(--anchor-green,#1f8a4c)] text-white"
                                        : "border border-black/15 bg-white text-[var(--anchor-deep,#0f2e2a)]"
                                    }`}
                                  >
                                    {k.label}
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}

                          {itemKit && piecesFor(itemKit).length === 0 ? (
                            <p className="text-[11px] text-amber-700">
                              No {packagingKitLabel(itemKit) || "kit"} pieces are set up in the aisle
                              yet — take the anchors and let marketing know.
                            </p>
                          ) : itemKit ? (
                            <>
                              <p className="mb-1.5 text-xs font-semibold text-[var(--anchor-deep,#0f2e2a)]">
                                Which pieces do you need? ({n} of each)
                              </p>
                              <div className="grid grid-cols-1 gap-1.5">
                                {piecesFor(itemKit).map((piece) => (
                                  <PieceRow
                                    key={piece.key}
                                    piece={piece}
                                    checked={chosen.includes(piece.key)}
                                    onToggle={() => toggleComp(it.id, piece.key)}
                                    showStock
                                  />
                                ))}
                              </div>
                              <p className="mt-1 text-[11px] text-[var(--anchor-gray,#5b6b66)]">
                                The anchor itself is the {n} you&apos;re taking above.
                              </p>
                            </>
                          ) : (
                            <p className="text-[11px] text-[var(--anchor-gray,#5b6b66)]">
                              Pick a series to see its pieces.
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* An item offered an overlay but not a box: just the overlay,
                      from that item's series. */}
                  {!out && n > 0 && !it.pizza_box && it.plastic_overlay && overlayPiece && (
                    <div className="border-t border-black/10 pt-2">
                      <PieceRow
                        piece={overlayPiece}
                        checked={chosen.includes("overlay")}
                        onToggle={() => toggleComp(it.id, "overlay")}
                        showStock
                      />
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
      {mode === "take" && selected.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 border-t border-black/10 bg-white/95 p-3 backdrop-blur">
          <div className="mx-auto flex max-w-md items-center gap-3">
            <div className="min-w-0 flex-1 text-sm">
              <div className="font-semibold text-[var(--anchor-deep,#0f2e2a)]">
                {totalUnits} unit{totalUnits === 1 ? "" : "s"} · {selected.length} item
                {selected.length === 1 ? "" : "s"}
              </div>
              <button
                type="button"
                onClick={() => {
                  setQty({});
                  setComps({});
                  setForBox({});
                  setLineKit({});
                }}
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

      {mode === "return" && returning.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 border-t border-black/10 bg-white/95 p-3 backdrop-blur">
          <div className="mx-auto flex max-w-md items-center gap-3">
            <div className="min-w-0 flex-1 text-sm">
              <div className="font-semibold text-[var(--anchor-deep,#0f2e2a)]">
                {returningUnits} unit{returningUnits === 1 ? "" : "s"} going back
              </div>
              <button
                type="button"
                onClick={() => {
                  setRetQty({});
                  setRetComps({});
                }}
                className="text-xs text-[var(--anchor-gray,#5b6b66)] underline"
              >
                Clear
              </button>
            </div>
            <Button onClick={submitReturn} disabled={busy} className="shrink-0">
              {busy ? "Recording…" : `Return ${returningUnits}`}
            </Button>
          </div>
        </div>
      )}
    </main>
  );
}
