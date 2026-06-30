"use client";

import { useEffect, useMemo, useState } from "react";
import Button from "@/app/components/ui/Button";
import { Card } from "@/app/components/ui/Card";
import { Alert } from "@/app/components/ui/Alert";
import { Input, Select, Textarea } from "@/app/components/ui/Field";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { trackEvent } from "@/lib/analytics/track";
import { MARKETING_CATEGORIES } from "@/lib/marketingOrders";
import { inventoryCategoryLabel } from "@/lib/inventory";
import { US_STATES } from "@/lib/sales/states";

type UserProfile = {
  full_name: string | null;
  company: string | null;
  phone: string | null;
  email: string | null;
};

type InvItem = {
  id: string;
  name: string;
  category: string | null;
  quantity_available: number;
  image_url?: string | null;
};

// Order the catalog's category groups in the picker; unknown keys sort last.
const CATEGORY_ORDER = ["swag", "brochures", "samples", "other"];

export default function MarketingOrderForm({ onSubmitted }: { onSubmitted?: () => void } = {}) {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const { t } = useTranslation();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [submittedByExpanded, setSubmittedByExpanded] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);

  // Inventory picker state.
  const [inventory, setInventory] = useState<InvItem[]>([]);
  const [invLoading, setInvLoading] = useState(true);
  const [invError, setInvError] = useState<string | null>(null);
  const [itemSearch, setItemSearch] = useState("");
  const [selected, setSelected] = useState<Record<string, number>>({});
  const [otherRequest, setOtherRequest] = useState("");

  const [neededBy, setNeededBy] = useState("");
  const [shipName, setShipName] = useState("");
  const [shipStreet, setShipStreet] = useState("");
  const [shipCity, setShipCity] = useState("");
  const [shipState, setShipState] = useState("");
  const [shipZip, setShipZip] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Load the signed-in user's profile for the "Submitted by" block (the route
  // already attaches this info server-side; this is just the on-form display).
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!user) return;
      const { data: prof } = await supabase
        .from("profiles")
        .select("full_name,company,phone,email")
        .eq("id", user.id)
        .maybeSingle();
      if (!alive) return;
      const row = prof as {
        full_name?: string | null;
        company?: string | null;
        phone?: string | null;
        email?: string | null;
      } | null;
      setProfile(
        row
          ? {
              full_name: row.full_name || null,
              company: row.company || null,
              phone: row.phone || null,
              email: row.email || user.email || null,
            }
          : { full_name: null, company: null, phone: null, email: user.email || null }
      );
    })();
    return () => {
      alive = false;
    };
  }, [supabase]);

  // Load the inventory catalog the rep picks from. Outside reps have read
  // access to /api/inventory, so this works for every marketing-order role.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/inventory", { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (!alive) return;
        if (!res.ok) {
          setInvError(json?.error || "Couldn't load the catalog.");
        } else {
          setInventory(json?.items || []);
        }
      } catch (e: any) {
        if (alive) setInvError(e?.message || "Couldn't load the catalog.");
      } finally {
        if (alive) setInvLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  function toggleCategory(key: string) {
    if (categories.includes(key)) {
      // Deselecting a type drops its picked items so the order stays consistent
      // with the collateral types chosen above (which now filter the grid).
      setCategories((prev) => prev.filter((k) => k !== key));
      setSelected((sel) => {
        const next = { ...sel };
        for (const id of Object.keys(next)) {
          const it = inventory.find((x) => x.id === id);
          if ((it?.category || "other") === key) delete next[id];
        }
        return next;
      });
    } else {
      setCategories((prev) => [...prev, key]);
    }
  }

  function setQty(id: string, qty: number, max: number) {
    const clamped = Math.max(0, Math.min(Math.floor(qty) || 0, max));
    setSelected((prev) => {
      const next = { ...prev };
      if (clamped <= 0) delete next[id];
      else next[id] = clamped;
      return next;
    });
  }

  // Show only items in the collateral types selected above, then apply the
  // search box, then group by category in the configured order.
  const groupedItems = useMemo(() => {
    const q = itemSearch.trim().toLowerCase();
    const active = new Set(categories);
    let list = inventory.filter((it) => active.has(it.category || "other"));
    if (q) list = list.filter((it) => it.name.toLowerCase().includes(q));
    const groups: Record<string, InvItem[]> = {};
    for (const it of list) {
      const key = it.category || "other";
      (groups[key] ||= []).push(it);
    }
    return Object.entries(groups).sort((a, b) => {
      const ia = CATEGORY_ORDER.indexOf(a[0]);
      const ib = CATEGORY_ORDER.indexOf(b[0]);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
  }, [inventory, itemSearch, categories]);

  const selectedEntries = Object.entries(selected);
  const totalUnits = selectedEntries.reduce((sum, [, q]) => sum + q, 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (categories.length === 0) return setError("Pick at least one category.");
    if (selectedEntries.length === 0 && !otherRequest.trim()) {
      return setError("Add at least one item from the catalog, or describe what you need in the Other box.");
    }
    if (!neededBy) return setError("A needed-by date is required.");
    if (!shipName.trim()) return setError("A recipient name is required.");
    if (!shipStreet.trim()) return setError("A street address is required.");
    if (!shipCity.trim()) return setError("A city is required.");
    if (!shipState.trim()) return setError("A state is required.");
    if (!shipZip.trim()) return setError("A ZIP code is required.");

    const ship_to = [
      shipName.trim(),
      shipStreet.trim(),
      `${shipCity.trim()}, ${shipState.trim()} ${shipZip.trim()}`,
    ].join("\n");

    const requested_items = selectedEntries.map(([item_id, quantity]) => ({ item_id, quantity }));

    setSubmitting(true);
    try {
      const res = await fetch("/api/marketing-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categories,
          requested_items,
          other_request: otherRequest.trim(),
          needed_by: neededBy,
          ship_to,
          notes: notes.trim(),
        }),
      });
      const text = await res.text();
      const json = text ? JSON.parse(text) : {};

      if (!res.ok) {
        setError(json?.error || "Failed to submit order.");
        setSubmitting(false);
        return;
      }

      trackEvent("marketing_order_submitted", { orderId: json?.id ?? null, categories });
      setSuccess("Order submitted. The marketing team will be in touch.");
      setCategories([]);
      setSelected({});
      setItemSearch("");
      setOtherRequest("");
      setNeededBy("");
      setShipName("");
      setShipStreet("");
      setShipCity("");
      setShipState("");
      setShipZip("");
      setNotes("");
      setSubmitting(false);
      onSubmitted?.();
    } catch (e: any) {
      setError(e?.message || "Failed to submit order.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <Card className="border-t-4 border-t-[var(--anchor-green)] p-4 sm:p-5">
        {profile && (
          <div className="rounded-[14px] border border-black/10 bg-[var(--surface-soft)]">
            <button
              type="button"
              onClick={() => setSubmittedByExpanded((v) => !v)}
              aria-expanded={submittedByExpanded}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
            >
              <span className="text-sm font-semibold text-black">{t("submittedBy")}</span>
              <span className="shrink-0 text-[11px] text-black/40">{submittedByExpanded ? "▴" : "▾"}</span>
            </button>
            {submittedByExpanded && (
              <div className="px-4 pb-4">
                <div className="grid gap-1 text-sm text-[var(--anchor-gray)]">
                  {profile.full_name && <div><span className="font-medium text-black">{profile.full_name}</span></div>}
                  {profile.company && <div>{profile.company}</div>}
                  {profile.phone && <div>{profile.phone}</div>}
                  {profile.email && <div>{profile.email}</div>}
                </div>
                <div className="mt-2 text-[11px] text-black/40">{t("yourContactInfo")}</div>
              </div>
            )}
          </div>
        )}

        <div className="mt-4 grid gap-4">
          {/* Category picker — select one or more */}
          <div className="grid gap-2">
            <span className="text-sm font-medium text-black">
              What do you need? <span className="font-normal text-[var(--anchor-gray)]">(select all that apply)</span>
            </span>
            <div className="grid grid-cols-3 gap-2">
              {MARKETING_CATEGORIES.filter((cat) => cat.key !== "other").map((cat) => {
                const selectedCat = categories.includes(cat.key);
                return (
                  <button
                    key={cat.key}
                    type="button"
                    onClick={() => toggleCategory(cat.key)}
                    aria-pressed={selectedCat}
                    title={cat.description}
                    className={
                      "rounded-[12px] border px-3 py-3 text-sm font-semibold transition " +
                      (selectedCat
                        ? "border-[var(--anchor-green)] bg-[var(--anchor-green)] text-white"
                        : "border-[var(--border-default)] bg-white text-[var(--anchor-deep)] hover:border-[var(--anchor-green)]")
                    }
                  >
                    {cat.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Inventory picker — choose items + quantities (capped at stock) */}
          <div className="grid gap-2">
            <span className="text-sm font-medium text-black">
              Choose items <span className="font-normal text-[var(--anchor-gray)]">(from the types selected above)</span>
            </span>

            {invError && <Alert tone="error">{invError}</Alert>}

            <Input
              value={itemSearch}
              onChange={(e) => setItemSearch(e.target.value)}
              placeholder="Search items…"
            />

            <div className="max-h-[28rem] space-y-4 overflow-y-auto rounded-[12px] border border-[var(--border-default)] p-3">
              {invLoading ? (
                <div className="p-1 text-sm text-[var(--anchor-gray)]">Loading catalog…</div>
              ) : categories.length === 0 ? (
                <div className="p-1 text-sm text-[var(--anchor-gray)]">
                  Pick a type above to see items.
                </div>
              ) : groupedItems.length === 0 ? (
                <div className="p-1 text-sm text-[var(--anchor-gray)]">
                  {itemSearch.trim() ? `No items match “${itemSearch.trim()}”.` : "No items in the selected type(s)."}
                </div>
              ) : (
                groupedItems.map(([catKey, list]) => (
                  <div key={catKey}>
                    <div className="sticky top-0 z-10 -mx-3 mb-2 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--anchor-gray)]">
                      {inventoryCategoryLabel(catKey)}
                    </div>
                    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
                      {list.map((it) => {
                        const qty = selected[it.id] || 0;
                        const avail = it.quantity_available;
                        const out = avail <= 0;
                        const picked = qty > 0;
                        return (
                          <div
                            key={it.id}
                            className={
                              "flex flex-col overflow-hidden rounded-[12px] border bg-white transition " +
                              (picked
                                ? "border-[var(--anchor-green)] ring-1 ring-[var(--anchor-green)]"
                                : "border-[var(--border-default)]")
                            }
                          >
                            {/* Product image (placeholder until photos are added). */}
                            <div className="relative aspect-square w-full bg-[var(--surface-soft)]">
                              {it.image_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={it.image_url} alt={it.name} className="h-full w-full object-cover" />
                              ) : (
                                <div className="flex h-full w-full items-center justify-center text-[11px] text-[var(--anchor-gray)]">
                                  No photo
                                </div>
                              )}
                              {picked && (
                                <span className="absolute right-1.5 top-1.5 rounded-full bg-[var(--anchor-green)] px-2 py-0.5 text-[11px] font-semibold text-white">
                                  {qty}
                                </span>
                              )}
                            </div>

                            <div className="flex flex-1 flex-col gap-1.5 p-2.5">
                              <div className="text-sm font-medium leading-snug text-black line-clamp-2">{it.name}</div>
                              <div className="text-xs text-[var(--anchor-gray)]">
                                {out ? "Out of stock" : `${avail} in stock`}
                              </div>

                              <div className="mt-auto pt-1">
                                {out ? (
                                  <div className="text-xs text-[var(--anchor-gray)]">Unavailable</div>
                                ) : qty === 0 ? (
                                  <button
                                    type="button"
                                    onClick={() => setQty(it.id, 1, avail)}
                                    className="w-full rounded-lg border border-[var(--anchor-green)] py-1.5 text-sm font-semibold text-[var(--anchor-green)] transition hover:bg-[var(--anchor-green)] hover:text-white"
                                  >
                                    Add
                                  </button>
                                ) : (
                                  <div className="flex items-center justify-between gap-1.5">
                                    <button
                                      type="button"
                                      aria-label={`Remove one ${it.name}`}
                                      onClick={() => setQty(it.id, qty - 1, avail)}
                                      className="h-8 w-8 shrink-0 rounded-lg border border-[var(--border-default)] text-lg leading-none text-[var(--anchor-deep)]"
                                    >
                                      −
                                    </button>
                                    <input
                                      type="number"
                                      min={0}
                                      max={avail}
                                      inputMode="numeric"
                                      value={qty}
                                      onChange={(e) => setQty(it.id, Number(e.target.value), avail)}
                                      className="h-8 w-full min-w-0 rounded-lg border border-[var(--border-default)] text-center text-sm"
                                    />
                                    <button
                                      type="button"
                                      aria-label={`Add one ${it.name}`}
                                      onClick={() => setQty(it.id, qty + 1, avail)}
                                      disabled={qty >= avail}
                                      className="h-8 w-8 shrink-0 rounded-lg border border-[var(--border-default)] text-lg leading-none text-[var(--anchor-deep)] disabled:opacity-40"
                                    >
                                      +
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))
              )}
            </div>

            {selectedEntries.length > 0 && (
              <div className="rounded-[12px] bg-[var(--surface-soft)] p-3 text-sm">
                <div className="font-medium text-black">
                  {selectedEntries.length} item{selectedEntries.length !== 1 ? "s" : ""} · {totalUnits} unit
                  {totalUnits !== 1 ? "s" : ""}
                </div>
                <ul className="mt-1 grid gap-0.5 text-[var(--anchor-gray)]">
                  {selectedEntries.map(([id, q]) => {
                    const it = inventory.find((x) => x.id === id);
                    return (
                      <li key={id}>
                        {q} × {it?.name || "item"}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>

          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-black">
              Other / not listed <span className="font-normal text-[var(--anchor-gray)]">(optional)</span>
            </span>
            <Textarea
              value={otherRequest}
              onChange={(e) => setOtherRequest(e.target.value)}
              placeholder="Need something that isn't in the catalog? Describe it here (e.g. a roof membrane sample, custom signage)…"
              rows={2}
            />
          </label>

          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-black">Needed by</span>
            <Input
              type="date"
              value={neededBy}
              onChange={(e) => setNeededBy(e.target.value)}
            />
            <span className="text-xs text-[var(--anchor-gray)]">
              Have a deadline (e.g. a trade show)? Let the marketing team know.
            </span>
          </label>

          <label className="grid gap-1.5 text-sm">
            <span className="font-semibold">Recipient Name</span>
            <Input
              value={shipName}
              onChange={(e) => setShipName(e.target.value)}
              className="h-11 px-3 text-sm"
              placeholder="Full name"
              autoComplete="name"
            />
          </label>

          <label className="grid gap-1.5 text-sm">
            <span className="font-semibold">Ship-to Address</span>
            <Input
              value={shipStreet}
              onChange={(e) => setShipStreet(e.target.value)}
              className="h-11 px-3 text-sm"
              placeholder="Street address"
              autoComplete="street-address"
            />
          </label>

          <label className="grid gap-1.5 text-sm">
            <span className="font-semibold">City</span>
            <Input
              value={shipCity}
              onChange={(e) => setShipCity(e.target.value)}
              className="h-11 px-3 text-sm"
              placeholder="City"
              autoComplete="address-level2"
            />
          </label>

          <label className="grid gap-1.5 text-sm">
            <span className="font-semibold">State</span>
            <Select
              value={shipState}
              onChange={(e) => setShipState(e.target.value)}
              className="h-11 px-3 text-sm"
            >
              <option value="">State</option>
              {US_STATES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          </label>

          <label className="grid gap-1.5 text-sm">
            <span className="font-semibold">ZIP</span>
            <Input
              value={shipZip}
              onChange={(e) => setShipZip(e.target.value)}
              className="h-11 px-3 text-sm"
              placeholder="ZIP"
              autoComplete="postal-code"
              inputMode="numeric"
            />
          </label>

          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-black">Notes (optional)</span>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Deadline, event name, or anything else the marketing team should know..."
              rows={3}
            />
          </label>

          {error && <Alert tone="error">{error}</Alert>}
          {success && <Alert tone="success">{success}</Alert>}

          <div className="mt-2 flex justify-end">
            <Button type="submit" disabled={submitting}>
              {submitting ? "Submitting…" : "Submit order"}
            </Button>
          </div>
        </div>
      </Card>
    </form>
  );
}
