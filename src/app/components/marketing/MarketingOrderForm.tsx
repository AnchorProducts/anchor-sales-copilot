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
import { US_STATES } from "@/lib/sales/states";

type UserProfile = {
  full_name: string | null;
  company: string | null;
  phone: string | null;
  email: string | null;
};

export default function MarketingOrderForm({ onSubmitted }: { onSubmitted?: () => void } = {}) {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const { t } = useTranslation();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [submittedByExpanded, setSubmittedByExpanded] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);
  const [items, setItems] = useState("");
  const [quantity, setQuantity] = useState("");
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

  function toggleCategory(key: string) {
    setCategories((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (categories.length === 0) return setError("Pick at least one category.");
    if (!items.trim()) return setError("Describe the item(s) you need.");
    if (!quantity.trim()) return setError("Quantity is required.");
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

    setSubmitting(true);
    try {
      const res = await fetch("/api/marketing-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categories,
          items: items.trim(),
          quantity: quantity.trim(),
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
      setItems("");
      setQuantity("");
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
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {MARKETING_CATEGORIES.map((cat) => {
                const selected = categories.includes(cat.key);
                return (
                  <button
                    key={cat.key}
                    type="button"
                    onClick={() => toggleCategory(cat.key)}
                    aria-pressed={selected}
                    title={cat.description}
                    className={
                      "rounded-[12px] border px-3 py-3 text-sm font-semibold transition " +
                      (selected
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

          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-black">Item(s) requested</span>
            <Textarea
              value={items}
              onChange={(e) => setItems(e.target.value)}
              placeholder="e.g. 25 product brochures, 3 polo shirts (size L), a roof membrane sample..."
              rows={4}
            />
          </label>

          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-black">Quantity</span>
            <Input
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="e.g. 25"
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
