"use client";

import { useEffect, useState } from "react";
import { Card } from "@/app/components/ui/Card";
import { marketingCategoriesLabel, CUSTOM_ORDER_REP_NOTICE } from "@/lib/marketingOrders";
import OrderStatusTracker from "./OrderStatusTracker";
import OrderDelayBanner from "./OrderDelayBanner";
import MarketingOrderChat from "./MarketingOrderChat";
import { useOrderUnread } from "@/lib/marketing/useOrderUnread";

type MarketingOrder = {
  id: string;
  categories: string[] | null;
  items: string;
  quantity: string | null;
  needed_by: string | null;
  ship_to: string | null;
  notes: string | null;
  status: string | null;
  // Inside sales tagged this one as ordered in specially rather than pulled from
  // stock — the reason it takes longer, called out on the card below.
  needs_custom_order: boolean | null;
  // Overlays on this order — paired with samples and ordered alone, combined.
  overlay_units: number | null;
  projected_ship_date: string | null;
  delay_notes: string | null;
  created_at: string | null;
  updated_at: string | null;
  updated_by_name: string | null;
  updated_by_email: string | null;
  assigned_to_name: string | null;
  assigned_to_email: string | null;
};

function formatDate(s: string | null) {
  if (!s) return "—";
  try {
    return new Date(`${s}T00:00:00`).toLocaleDateString("en-US", {
      month: "short",
      day: "2-digit",
      year: "numeric",
    });
  } catch {
    return s;
  }
}

function formatDateTime(s: string | null) {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString("en-US", {
      month: "short",
      day: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return s;
  }
}

// Rep-facing order history + live status tracker. Fetches the current user's own
// marketing orders. `refreshKey` lets the parent force a reload after a new
// submission.
export default function MarketingOrderHistory({ refreshKey = 0 }: { refreshKey?: number }) {
  const [items, setItems] = useState<MarketingOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Which order's chat thread is currently expanded.
  const [openChatId, setOpenChatId] = useState<string | null>(null);
  const { counts: unread, markRead } = useOrderUnread();

  function toggleChat(orderId: string) {
    setOpenChatId((cur) => {
      const next = cur === orderId ? null : orderId;
      if (next) markRead(orderId);
      return next;
    });
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/marketing-orders", { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (!alive) return;
        if (!res.ok) {
          setError(json?.error || "Failed to load your orders.");
        } else {
          setItems(json?.items || []);
        }
      } catch (e: any) {
        if (alive) setError(e?.message || "Failed to load your orders.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [refreshKey]);

  return (
    <Card className="mt-4 p-6">
      <div className="ds-caption">Order history</div>
      <h2 className="mt-2 text-xl">Track your orders</h2>
      <p className="mt-1 text-sm text-[var(--anchor-gray)]">
        Follow each marketing order from submission through fulfillment.
      </p>

      {loading ? (
        <div className="mt-4 text-sm text-[var(--anchor-gray)]">Loading…</div>
      ) : error ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      ) : items.length === 0 ? (
        <div className="mt-4 rounded-xl border border-[var(--border-default)] bg-[var(--surface-soft)] p-4 text-sm text-[var(--anchor-gray)]">
          You haven&apos;t submitted any marketing orders yet.
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {items.map((o) => (
            <div
              key={o.id}
              className="rounded-2xl border border-[var(--border-default)] bg-white p-4 sm:p-5"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="rounded-full bg-[var(--anchor-mint)]/60 px-2.5 py-0.5 text-xs font-semibold text-[var(--anchor-deep)]">
                    {marketingCategoriesLabel(o.categories)}
                  </span>
                  {o.needs_custom_order && (
                    <span
                      className="rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900"
                      title="Ordered in specially rather than shipped from stock"
                    >
                      ⚑ Custom order
                    </span>
                  )}
                </div>
                <span className="text-xs text-[var(--anchor-gray)]">
                  Ordered {formatDateTime(o.created_at)}
                </span>
              </div>

              {/* Who at Anchor owns this order — the rep's point of contact once
                  an admin has assigned it. */}
              {o.assigned_to_name && (
                <div className="mt-3 flex flex-wrap items-center gap-1.5 rounded-xl border border-[var(--anchor-deep)]/15 bg-[var(--anchor-mint)]/30 px-3 py-2 text-xs text-[var(--anchor-gray)]">
                  <span aria-hidden>👤</span>
                  <span>
                    Handled by{" "}
                    <span className="font-semibold text-[var(--anchor-deep)]">{o.assigned_to_name}</span>
                  </span>
                  {o.assigned_to_email && (
                    <a
                      href={`mailto:${o.assigned_to_email}`}
                      className="font-semibold text-[var(--anchor-green)] underline"
                    >
                      {o.assigned_to_email}
                    </a>
                  )}
                </div>
              )}

              <div className="mt-4">
                {o.status === "delayed" ? (
                  <OrderDelayBanner
                    projectedShipDate={o.projected_ship_date}
                    notes={o.delay_notes}
                    byName={o.updated_by_name}
                    at={o.updated_at}
                    contactEmail={o.updated_by_email}
                  />
                ) : (
                  <OrderStatusTracker status={o.status} />
                )}
              </div>

              {o.status !== "delayed" && (o.updated_by_name || o.updated_by_email) && (
                <div className="mt-3 rounded-xl border border-[var(--border-default)] bg-[var(--surface-soft)] px-3 py-2 text-xs text-[var(--anchor-gray)]">
                  Status updated by{" "}
                  <span className="font-semibold text-[var(--anchor-deep)]">
                    {o.updated_by_name || o.updated_by_email}
                  </span>
                  {o.updated_at ? ` on ${formatDateTime(o.updated_at)}` : ""}.
                  {o.updated_by_email && (
                    <>
                      {" "}
                      Questions?{" "}
                      <a
                        href={`mailto:${o.updated_by_email}`}
                        className="font-semibold text-[var(--anchor-green)] underline"
                      >
                        {o.updated_by_email}
                      </a>
                    </>
                  )}
                </div>
              )}

              {/* Why this one is slower. The whole reason the tag exists: the
                  rep shouldn't have to chase inside sales to find out. */}
              {o.needs_custom_order && (
                <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3">
                  <div className="text-xs font-bold uppercase tracking-wide text-amber-900">
                    ⚑ Custom order
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-amber-900">
                    {CUSTOM_ORDER_REP_NOTICE}
                  </p>
                  <p className="mt-1.5 text-xs text-amber-900/80">
                    Need it by a certain date? Message the team below.
                  </p>
                </div>
              )}

              <div className="mt-4 whitespace-pre-line text-sm text-black">{o.items}</div>

              <dl className="mt-2 grid gap-x-6 gap-y-1 text-xs text-[var(--anchor-gray)] sm:grid-cols-2">
                <div>
                  <dt className="inline font-semibold text-[var(--anchor-deep)]">Quantity: </dt>
                  <dd className="inline">{o.quantity || "—"}</dd>
                </div>
                <div>
                  <dt className="inline font-semibold text-[var(--anchor-deep)]">Needed by: </dt>
                  <dd className="inline">{formatDate(o.needed_by)}</dd>
                </div>
                {(o.overlay_units || 0) > 0 && (
                  <div>
                    <dt className="inline font-semibold text-[var(--anchor-deep)]">Plastic overlays: </dt>
                    <dd className="inline">{o.overlay_units}</dd>
                  </div>
                )}
                <div className="sm:col-span-2">
                  <dt className="inline font-semibold text-[var(--anchor-deep)]">Ship to: </dt>
                  <dd className="inline whitespace-pre-line">{o.ship_to || "—"}</dd>
                </div>
                {o.notes && (
                  <div className="sm:col-span-2">
                    <dt className="inline font-semibold text-[var(--anchor-deep)]">Notes: </dt>
                    <dd className="inline whitespace-pre-line">{o.notes}</dd>
                  </div>
                )}
              </dl>

              <div className="mt-4 border-t border-[var(--border-default)] pt-3">
                <button
                  type="button"
                  onClick={() => toggleChat(o.id)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-default)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--anchor-deep)] transition hover:bg-[var(--anchor-mint)]/40"
                >
                  💬 {openChatId === o.id ? "Hide messages" : "Messages"}
                  {unread[o.id] > 0 && openChatId !== o.id && (
                    <span className="inline-flex min-w-[18px] items-center justify-center rounded-full bg-[var(--anchor-green)] px-1.5 text-[10px] font-bold text-white">
                      {unread[o.id]}
                    </span>
                  )}
                </button>
                {openChatId === o.id && (
                  <div className="mt-3">
                    <p className="mb-2 text-xs text-[var(--anchor-gray)]">
                      Message the Anchor team about this order — ask questions, clarify details, or share photos.
                    </p>
                    <MarketingOrderChat orderId={o.id} />
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
