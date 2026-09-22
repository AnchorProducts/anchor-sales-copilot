"use client";

import { useEffect, useMemo, useState } from "react";
import { Icon, Pill, Segmented, Surface } from "@/app/components/ui/kit";
import {
  marketingCategoriesLabel,
  marketingOrderStatusLabel,
  marketingOrderStatusPill,
  CUSTOM_ORDER_REP_NOTICE,
} from "@/lib/marketingOrders";
import { normalizeOemSpec, oemBoxes, oemUnits } from "@/lib/marketing/oemOrder";
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
  pizza_boxes?: number | null;
  // "customer" (from stock) or "oem" (custom-printed pizza box). Absent before
  // 20260922_000001, when every order was a customer order.
  order_type?: string | null;
  oem_spec?: Record<string, unknown> | null;
  projected_ship_date: string | null;
  delay_notes: string | null;
  created_at: string | null;
  updated_at: string | null;
  updated_by_name: string | null;
  updated_by_email: string | null;
  assigned_to_name: string | null;
  assigned_to_email: string | null;
};

type StatusFilter = "active" | "done" | "all";
type TypeFilter = "all" | "customer" | "oem";

const DONE = new Set(["fulfilled", "cancelled"]);

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

function isOem(o: MarketingOrder) {
  return o.order_type === "oem";
}

// Rep-facing order history + live status tracker. Fetches the current user's own
// marketing orders. `refreshKey` lets the parent force a reload after a new
// submission; `showType` adds the customer/OEM split for internal sales.
export default function MarketingOrderHistory({
  refreshKey = 0,
  showType = false,
}: {
  refreshKey?: number;
  showType?: boolean;
}) {
  const [items, setItems] = useState<MarketingOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("active");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  // Which orders have their full detail open, and whose chat thread is open.
  const [openDetails, setOpenDetails] = useState<Record<string, boolean>>({});
  const [openChatId, setOpenChatId] = useState<string | null>(null);
  // Which order is being confirmed as received, and the last failure if one came
  // back — shown on the order itself rather than at the top of a long list.
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [confirmErr, setConfirmErr] = useState<{ id: string; msg: string } | null>(null);
  const { counts: unread, markRead } = useOrderUnread();

  // Confirm a shipped order arrived. Only the rep who placed it can do this, and
  // only from shipped — the API enforces both. It's the step the "your order has
  // shipped" email asks for: nobody at Anchor can see the box land, so an order
  // sits in shipped until the person who opened it says so.
  async function markReceived(orderId: string) {
    setConfirmingId(orderId);
    setConfirmErr(null);
    try {
      const res = await fetch("/api/marketing-orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: orderId, status: "fulfilled", note: "Confirmed the order arrived." }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setConfirmErr({ id: orderId, msg: json?.error || "Couldn't mark that as received." });
        return;
      }
      // Reflect it immediately; the list reloads on the next refreshKey anyway.
      setItems((prev) =>
        prev.map((o) => (o.id === orderId ? { ...o, status: "fulfilled", updated_at: new Date().toISOString() } : o))
      );
    } catch (e: any) {
      setConfirmErr({ id: orderId, msg: e?.message || "Couldn't mark that as received." });
    } finally {
      setConfirmingId(null);
    }
  }

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

  const counts = useMemo(() => {
    const ofType = items.filter((o) => typeFilter === "all" || (typeFilter === "oem") === isOem(o));
    return {
      active: ofType.filter((o) => !DONE.has(o.status || "new")).length,
      done: ofType.filter((o) => DONE.has(o.status || "new")).length,
      all: ofType.length,
      customer: items.filter((o) => !isOem(o)).length,
      oem: items.filter(isOem).length,
    };
  }, [items, typeFilter]);

  const visible = items.filter((o) => {
    if (typeFilter !== "all" && (typeFilter === "oem") !== isOem(o)) return false;
    const done = DONE.has(o.status || "new");
    return statusFilter === "all" || (statusFilter === "done") === done;
  });

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Segmented
          ariaLabel="Which orders"
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            {
              value: "active" as StatusFilter,
              label: (
                <>
                  Active <span className="tabular-nums opacity-50">{counts.active}</span>
                </>
              ),
            },
            {
              value: "done" as StatusFilter,
              label: (
                <>
                  Completed <span className="tabular-nums opacity-50">{counts.done}</span>
                </>
              ),
            },
            { value: "all" as StatusFilter, label: "All" },
          ]}
        />
        {showType && counts.oem > 0 && (
          <Segmented
            ariaLabel="Order type"
            size="sm"
            value={typeFilter}
            onChange={setTypeFilter}
            options={[
              { value: "all" as TypeFilter, label: "All types" },
              { value: "customer" as TypeFilter, label: "Customer" },
              { value: "oem" as TypeFilter, label: "OEM" },
            ]}
          />
        )}
      </div>

      {loading ? (
        <Surface className="p-6 text-center text-[14px] text-[var(--anchor-gray)]">Loading your orders…</Surface>
      ) : error ? (
        <div className="rounded-[14px] bg-red-500/10 p-3.5 text-[14px] text-red-700">{error}</div>
      ) : items.length === 0 ? (
        <Surface className="flex flex-col items-center gap-2 px-6 py-12 text-center">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--mo-fill)] text-[var(--anchor-gray)]">
            <Icon name="box" className="h-7 w-7" />
          </span>
          <p className="mt-1 text-[17px] font-semibold text-black">No orders yet</p>
          <p className="text-[14px] text-[var(--anchor-gray)]">Anything you order shows up here, from checkout to delivery.</p>
        </Surface>
      ) : visible.length === 0 ? (
        <Surface className="p-8 text-center text-[14px] text-[var(--anchor-gray)]">
          {statusFilter === "active" ? "Nothing in progress. Every order is complete." : "No orders match this filter."}
        </Surface>
      ) : (
        <div className="grid gap-4">
          {visible.map((o) => {
            const oem = isOem(o);
            const spec = oem ? normalizeOemSpec(o.oem_spec) : null;
            // Signed links the API attached to each artwork file.
            const artworkLinks = (Array.isArray((o.oem_spec as any)?.artwork) ? (o.oem_spec as any).artwork : []) as {
              filename?: string;
              url?: string | null;
            }[];
            const title = oem
              ? `${spec?.company || "OEM partner"}${spec?.project ? ` · ${spec.project}` : ""}`
              : (o.items || "").split("\n")[0];
            const open = !!openDetails[o.id];
            return (
              <Surface key={o.id} className="overflow-hidden">
                <div className="p-5 sm:p-6">
                  <div className="flex items-start gap-3.5">
                    <span
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] ${
                        oem ? "bg-violet-500/12 text-violet-600" : "bg-[var(--anchor-green)]/10 text-[var(--anchor-green)]"
                      }`}
                    >
                      <Icon name={oem ? "building" : "box"} className="h-5 w-5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-[var(--anchor-gray)]">
                        {showType && (
                          <span className={`font-semibold ${oem ? "text-violet-700" : "text-[var(--anchor-green)]"}`}>
                            {oem ? "OEM order" : "Customer order"}
                          </span>
                        )}
                        <span>#{o.id.slice(0, 8)}</span>
                        <span>{formatDateTime(o.created_at)}</span>
                      </div>
                      <h3 className="mt-0.5 line-clamp-2 text-[17px] font-semibold leading-snug tracking-[-0.015em] text-black">
                        {title || "Marketing order"}
                      </h3>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[13px] text-[var(--anchor-gray)]">
                        {oem && spec ? (
                          <>
                            <span>{oemUnits(spec)} custom-printed samples</span>
                            {oemBoxes(spec) > 0 && <span>{oemBoxes(spec)} fully built boxes</span>}
                          </>
                        ) : (
                          <>
                            <span>{marketingCategoriesLabel(o.categories)}</span>
                            {o.quantity && <span>{o.quantity} units</span>}
                          </>
                        )}
                        <span>Needed by {formatDate(o.needed_by)}</span>
                      </div>
                    </div>
                    <span className={`shrink-0 rounded-full px-2.5 py-1 text-[12px] font-semibold ${marketingOrderStatusPill(o.status)}`}>
                      {marketingOrderStatusLabel(o.status)}
                    </span>
                  </div>

                  <div className="mt-5">
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

                  {/* The ask from the shipped email, in the place they land. */}
                  {o.status === "shipped" && (
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[16px] bg-[var(--anchor-green)]/[0.08] p-3.5">
                      <p className="min-w-0 flex-1 text-[14px] leading-snug text-black">
                        <span className="font-semibold">On its way.</span> Once it arrives, mark it received to close the
                        order out.
                      </p>
                      <Pill size="sm" onClick={() => markReceived(o.id)} disabled={confirmingId === o.id}>
                        {confirmingId === o.id ? "Confirming…" : "Mark as Received"}
                      </Pill>
                      {confirmErr?.id === o.id && (
                        <div className="w-full rounded-[10px] bg-red-500/10 p-2 text-[12px] text-red-700">{confirmErr.msg}</div>
                      )}
                    </div>
                  )}

                  {/* Why this one is slower: an OEM order is printed to order;
                      a customer order tagged custom is being ordered in. */}
                  {oem ? (
                    <p className="mt-4 text-[13px] leading-snug text-[var(--anchor-gray)]">
                      Printed to order for the partner
                      {spec?.proof_required ? ", with a proof for sign-off before production" : ""}. Artwork questions
                      and proofs come through Messages.
                    </p>
                  ) : (
                    o.needs_custom_order && (
                      <div className="mt-4 flex items-start gap-2.5 rounded-[14px] bg-amber-500/10 px-3.5 py-3 text-[13px] leading-snug text-amber-900">
                        <Icon name="flag" className="mt-px h-4 w-4 text-amber-600" />
                        <span>
                          <span className="font-semibold">Custom order.</span> {CUSTOM_ORDER_REP_NOTICE}
                        </span>
                      </div>
                    )
                  )}

                  {/* Who at Anchor owns this order, or whoever last moved it. */}
                  {(o.assigned_to_name || (o.status !== "delayed" && (o.updated_by_name || o.updated_by_email))) && (
                    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-[var(--anchor-gray)]">
                      {o.assigned_to_name && (
                        <span className="inline-flex items-center gap-1.5">
                          <Icon name="person" className="h-4 w-4" />
                          <span>
                            Handled by <span className="font-medium text-black">{o.assigned_to_name}</span>
                          </span>
                          {o.assigned_to_email && (
                            <a href={`mailto:${o.assigned_to_email}`} className="font-medium text-[var(--anchor-green)]">
                              {o.assigned_to_email}
                            </a>
                          )}
                        </span>
                      )}
                      {o.status !== "delayed" && (o.updated_by_name || o.updated_by_email) && (
                        <span>
                          Updated by <span className="font-medium text-black">{o.updated_by_name || o.updated_by_email}</span>
                          {o.updated_at ? ` · ${formatDateTime(o.updated_at)}` : ""}
                        </span>
                      )}
                    </div>
                  )}

                  {open && (
                    <div className="mt-5 grid gap-4 border-t border-[var(--mo-sep)] pt-4">
                      <div className="whitespace-pre-line text-[14px] leading-relaxed text-black">{o.items}</div>

                      {oem && (artworkLinks.some((f) => f.url) || spec?.artwork_link) && (
                        <div>
                          <div className="text-[12px] font-semibold uppercase tracking-[0.04em] text-[var(--anchor-gray)]">
                            Artwork
                          </div>
                          <div className="mt-1.5 flex flex-wrap gap-2">
                            {artworkLinks
                              .filter((f) => f.url)
                              .map((f, i) => (
                                <a
                                  key={i}
                                  href={f.url!}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-1.5 rounded-full bg-[var(--mo-fill)] px-3 py-1.5 text-[13px] font-medium text-black transition hover:bg-[var(--mo-fill-strong)]"
                                >
                                  <Icon name="download" className="h-4 w-4 text-violet-600" />
                                  {f.filename || "file"}
                                </a>
                              ))}
                            {spec?.artwork_link && /^https?:\/\//i.test(spec.artwork_link) && (
                              <a
                                href={spec.artwork_link}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1.5 rounded-full bg-[var(--mo-fill)] px-3 py-1.5 text-[13px] font-medium text-black transition hover:bg-[var(--mo-fill-strong)]"
                              >
                                <Icon name="link" className="h-4 w-4 text-violet-600" />
                                Shared files
                              </a>
                            )}
                          </div>
                        </div>
                      )}

                      <dl className="grid gap-x-6 gap-y-3 text-[13px] sm:grid-cols-2">
                        {(o.overlay_units || 0) > 0 && (
                          <div>
                            <dt className="text-[var(--anchor-gray)]">Plastic overlays</dt>
                            <dd className="text-black">{o.overlay_units}</dd>
                          </div>
                        )}
                        <div className="sm:col-span-2">
                          <dt className="text-[var(--anchor-gray)]">Ship to</dt>
                          <dd className="whitespace-pre-line text-black">{o.ship_to || "—"}</dd>
                        </div>
                        {o.notes && (
                          <div className="sm:col-span-2">
                            <dt className="text-[var(--anchor-gray)]">Notes</dt>
                            <dd className="whitespace-pre-line text-black">{o.notes}</dd>
                          </div>
                        )}
                      </dl>
                    </div>
                  )}
                </div>

                <div className="flex border-t border-[var(--mo-sep)]">
                  <button
                    type="button"
                    onClick={() => setOpenDetails((prev) => ({ ...prev, [o.id]: !prev[o.id] }))}
                    aria-expanded={open}
                    className="flex flex-1 items-center justify-center gap-1.5 py-3 text-[14px] font-medium text-[var(--anchor-green)] transition hover:bg-black/[0.03]"
                  >
                    {open ? "Hide Details" : "Details"}
                    <Icon name="chevronDown" className={`h-4 w-4 transition-transform ${open ? "rotate-180" : ""}`} strokeWidth={2.2} />
                  </button>
                  <span className="w-px bg-[var(--mo-sep)]" aria-hidden />
                  <button
                    type="button"
                    onClick={() => toggleChat(o.id)}
                    className="flex flex-1 items-center justify-center gap-1.5 py-3 text-[14px] font-medium text-[var(--anchor-green)] transition hover:bg-black/[0.03]"
                  >
                    <Icon name="message" className="h-4 w-4" />
                    {openChatId === o.id ? "Hide Messages" : "Messages"}
                    {unread[o.id] > 0 && openChatId !== o.id && (
                      <span className="inline-flex min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[11px] font-semibold text-white">
                        {unread[o.id]}
                      </span>
                    )}
                  </button>
                </div>
                {openChatId === o.id && (
                  <div className="border-t border-[var(--mo-sep)] p-5 sm:p-6">
                    <p className="mb-3 text-[13px] text-[var(--anchor-gray)]">
                      Message the Anchor team about this order: ask questions, clarify details, or share photos.
                    </p>
                    <MarketingOrderChat orderId={o.id} />
                  </div>
                )}
              </Surface>
            );
          })}
        </div>
      )}
    </div>
  );
}
