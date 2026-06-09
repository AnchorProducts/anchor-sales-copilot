"use client";

import { useState } from "react";
import Button from "@/app/components/ui/Button";
import { Card } from "@/app/components/ui/Card";
import { Alert } from "@/app/components/ui/Alert";
import { Input, Textarea } from "@/app/components/ui/Field";
import { trackEvent } from "@/lib/analytics/track";
import { MARKETING_CATEGORIES } from "@/lib/marketingOrders";

export default function MarketingOrderForm() {
  const [category, setCategory] = useState("");
  const [items, setItems] = useState("");
  const [quantity, setQuantity] = useState("");
  const [shipTo, setShipTo] = useState("");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!category) return setError("Pick a category.");
    if (!items.trim()) return setError("Describe the item(s) you need.");
    if (!shipTo.trim()) return setError("A shipping address is required.");

    setSubmitting(true);
    try {
      const res = await fetch("/api/marketing-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          items: items.trim(),
          quantity: quantity.trim(),
          ship_to: shipTo.trim(),
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

      trackEvent("marketing_order_submitted", { orderId: json?.id ?? null, category });
      setSuccess("Order submitted. The marketing team will be in touch.");
      setCategory("");
      setItems("");
      setQuantity("");
      setShipTo("");
      setNotes("");
      setSubmitting(false);
    } catch (e: any) {
      setError(e?.message || "Failed to submit order.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <Card className="border-t-4 border-t-[var(--anchor-green)] p-4 sm:p-5">
        <div className="text-sm font-semibold text-black">New marketing order</div>
        <div className="mt-1 text-sm text-[var(--anchor-gray)]">
          Request samples, brochures, swag, or anything else. Your order is emailed to the right
          marketing contact.
        </div>

        <div className="mt-5 grid gap-4">
          {/* Category picker */}
          <div className="grid gap-2">
            <span className="text-sm font-medium text-black">What do you need?</span>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {MARKETING_CATEGORIES.map((cat) => {
                const selected = category === cat.key;
                return (
                  <button
                    key={cat.key}
                    type="button"
                    onClick={() => setCategory(cat.key)}
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
            <span className="font-medium text-black">Quantity (optional)</span>
            <Input
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              placeholder="e.g. 25"
            />
          </label>

          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-black">Ship to</span>
            <Textarea
              value={shipTo}
              onChange={(e) => setShipTo(e.target.value)}
              placeholder="Name, street address, city, state, ZIP"
              rows={3}
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
