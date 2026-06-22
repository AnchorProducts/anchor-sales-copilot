"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { AppNavbar } from "@/app/components/ui/AppNavbar";
import { Card } from "@/app/components/ui/Card";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { marketingCategoriesLabel, MARKETING_ORDER_STATUSES } from "@/lib/marketingOrders";
import OrderStatusTracker from "@/app/components/marketing/OrderStatusTracker";
import MarketingOrderChat from "@/app/components/marketing/MarketingOrderChat";
import { useOrderUnread } from "@/lib/marketing/useOrderUnread";
import { Input, Select, Textarea } from "@/app/components/ui/Field";

export const dynamic = "force-dynamic";

type MarketingOrder = {
  id: string;
  categories: string[] | null;
  items: string;
  quantity: string | null;
  needed_by: string | null;
  ship_to: string | null;
  notes: string | null;
  status: string | null;
  projected_ship_date: string | null;
  delay_notes: string | null;
  submitter_name: string | null;
  submitter_company: string | null;
  submitter_email: string | null;
  submitter_phone: string | null;
  created_at: string | null;
  updated_at: string | null;
  updated_by_name: string | null;
  updated_by_email: string | null;
};

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

function formatDate(s: string | null) {
  if (!s) return "—";
  try {
    // needed_by is a plain calendar date (YYYY-MM-DD); render without TZ shift.
    return new Date(`${s}T00:00:00`).toLocaleDateString("en-US", {
      month: "short",
      day: "2-digit",
      year: "numeric",
    });
  } catch {
    return s;
  }
}

export default function AdminMarketingOrdersPage() {
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const { t } = useTranslation();

  const [ready, setReady] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [items, setItems] = useState<MarketingOrder[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [updateErr, setUpdateErr] = useState<string | null>(null);
  // Per-order working drafts for the delay editor (projected ship date + notes).
  // Falls back to the saved order values when a key isn't present.
  const [delayDateDraft, setDelayDateDraft] = useState<Record<string, string>>({});
  const [delayNotesDraft, setDelayNotesDraft] = useState<Record<string, string>>({});
  // Two views: "active" (in-flight orders) and "archived" (fulfilled/cancelled).
  const [activeTab, setActiveTab] = useState<"active" | "archived">("active");
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

  const isArchived = (o: MarketingOrder) =>
    o.status === "fulfilled" || o.status === "cancelled";

  // Counts per view, so each tab can show a badge.
  const counts = useMemo(() => {
    let archived = 0;
    for (const o of items) if (isArchived(o)) archived += 1;
    return { active: items.length - archived, archived };
  }, [items]);

  const filteredItems = useMemo(
    () => items.filter((o) => (activeTab === "archived" ? isArchived(o) : !isArchived(o))),
    [items, activeTab]
  );

  async function loadOrders() {
    const res = await fetch("/api/marketing-orders", { cache: "no-store" });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      setLoadErr(json?.error || "Failed to load marketing orders.");
      return;
    }
    setLoadErr(null);
    setItems(json?.items || []);
  }

  async function updateStatus(id: string, status: string) {
    setSavingId(id);
    setUpdateErr(null);
    // Optimistic status flip for a snappy tracker; revert on failure.
    const prev = items;
    setItems((list) => list.map((o) => (o.id === id ? { ...o, status } : o)));
    try {
      const res = await fetch("/api/marketing-orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setUpdateErr(json?.error || "Failed to update status.");
        setItems(prev);
      } else {
        // Refresh so the "updated by" attribution reflects this change.
        await loadOrders();
      }
    } catch (e: any) {
      setUpdateErr(e?.message || "Failed to update status.");
      setItems(prev);
    } finally {
      setSavingId(null);
    }
  }

  // Save the delay details (projected ship date + reason) for a delayed order.
  async function saveDelay(id: string, projectedShipDate: string, delayNotes: string) {
    setSavingId(id);
    setUpdateErr(null);
    try {
      const res = await fetch("/api/marketing-orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id,
          projected_ship_date: projectedShipDate,
          delay_notes: delayNotes,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setUpdateErr(json?.error || "Failed to save delay details.");
      } else {
        // Drop the drafts so the inputs reflect the freshly saved values.
        setDelayDateDraft((d) => {
          const { [id]: _omit, ...rest } = d;
          return rest;
        });
        setDelayNotesDraft((d) => {
          const { [id]: _omit, ...rest } = d;
          return rest;
        });
        await loadOrders();
      }
    } catch (e: any) {
      setUpdateErr(e?.message || "Failed to save delay details.");
    } finally {
      setSavingId(null);
    }
  }

  async function deleteOrder(id: string) {
    if (!window.confirm("Delete this order from history? This can’t be undone.")) return;
    setSavingId(id);
    setUpdateErr(null);
    const prev = items;
    setItems((list) => list.filter((o) => o.id !== id)); // optimistic
    try {
      const res = await fetch(`/api/marketing-orders?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setUpdateErr(json?.error || "Failed to delete order.");
        setItems(prev);
      }
    } catch (e: any) {
      setUpdateErr(e?.message || "Failed to delete order.");
      setItems(prev);
    } finally {
      setSavingId(null);
    }
  }

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!alive) return;
      if (!data.user) {
        router.replace("/");
        return;
      }

      const { data: prof } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.user.id)
        .maybeSingle();

      const role = String((prof as { role?: string } | null)?.role || "");
      if (role !== "admin") {
        setAccessError("Admin access only.");
        setReady(true);
        return;
      }

      await loadOrders();
      if (!alive) return;
      setReady(true);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, supabase]);

  return (
    <main className="ds-page">
      <AppNavbar
        title="Marketing Orders"
        subtitle="Submitted order history"
        menuItems={[
          { label: t("dashboard"), href: "/dashboard" },
          { label: "Admin Console", href: "/admin" },
        ]}
      />

      <div className="ds-container py-6 pb-[calc(3rem+env(safe-area-inset-bottom))] sm:py-10">
        {!ready ? (
          <Card className="p-5 text-sm text-black/60">{t("loading")}</Card>
        ) : accessError ? (
          <Card className="border-[var(--anchor-deep)]/25 bg-[var(--anchor-mint)] p-5 text-sm text-[var(--anchor-deep)]">
            {accessError}
          </Card>
        ) : (
          <>
            <header className="mb-6 sm:mb-8">
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Marketing Orders</h1>
              <p className="mt-1 text-sm text-[var(--anchor-gray)]">
                Every samples, brochure, swag, and collateral order submitted by sales reps.
              </p>
            </header>

            {loadErr && (
              <Card className="mb-4 border-red-200 bg-red-50 p-4 text-sm text-red-700">{loadErr}</Card>
            )}
            {updateErr && (
              <Card className="mb-4 border-red-200 bg-red-50 p-4 text-sm text-red-700">{updateErr}</Card>
            )}

            {items.length > 0 && (
              <div className="mb-4 flex flex-wrap gap-2 border-b border-[var(--border-default)] pb-3">
                {([
                  { key: "active", label: "Active", count: counts.active },
                  { key: "archived", label: "Archived", count: counts.archived },
                ] as const).map((tab) => {
                  const active = activeTab === tab.key;
                  return (
                    <button
                      key={tab.key}
                      type="button"
                      onClick={() => setActiveTab(tab.key)}
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                        active
                          ? "bg-[var(--anchor-deep)] text-white"
                          : "bg-[var(--surface-soft)] text-[var(--anchor-deep)] hover:bg-[var(--anchor-mint)]/60"
                      }`}
                    >
                      {tab.label}
                      <span
                        className={`rounded-full px-1.5 text-[10px] ${
                          active ? "bg-white/20" : "bg-black/10"
                        }`}
                      >
                        {tab.count}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {items.length === 0 && !loadErr ? (
              <Card className="p-6 text-center text-sm text-[var(--anchor-gray)]">
                No marketing orders yet.
              </Card>
            ) : filteredItems.length === 0 ? (
              <Card className="p-6 text-center text-sm text-[var(--anchor-gray)]">
                {activeTab === "archived" ? "No archived orders." : "No active orders."}
              </Card>
            ) : (
              <div className="space-y-3">
                {filteredItems.map((o) => (
                  <Card key={o.id} className="p-5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <span className="rounded-full bg-[var(--anchor-mint)]/60 px-2.5 py-0.5 text-xs font-semibold text-[var(--anchor-deep)]">
                        {marketingCategoriesLabel(o.categories)}
                      </span>
                      <div className="flex items-center gap-2">
                        <Select
                          value={o.status || "new"}
                          onChange={(e) => updateStatus(o.id, e.target.value)}
                          disabled={savingId === o.id}
                          className="h-9 px-2 text-xs"
                          aria-label="Order status"
                        >
                          {MARKETING_ORDER_STATUSES.map((s) => (
                            <option key={s.key} value={s.key}>
                              {s.label}
                            </option>
                          ))}
                        </Select>
                        <span className="text-xs text-[var(--anchor-gray)]">{formatDateTime(o.created_at)}</span>
                        <button
                          type="button"
                          onClick={() => deleteOrder(o.id)}
                          disabled={savingId === o.id}
                          title="Delete this order from history"
                          className="inline-flex h-9 items-center rounded-lg border border-red-200 bg-red-50 px-3 text-xs font-semibold text-red-700 transition hover:bg-red-100 disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </div>
                    </div>

                    {o.status !== "delayed" && (
                      <div className="mt-4">
                        <OrderStatusTracker status={o.status} />
                      </div>
                    )}

                    {(o.updated_by_name || o.updated_by_email) && (
                      <div className="mt-3 text-xs text-[var(--anchor-gray)]">
                        Status last updated by{" "}
                        <span className="font-semibold text-[var(--anchor-deep)]">
                          {o.updated_by_name || o.updated_by_email}
                        </span>
                        {o.updated_by_name && o.updated_by_email ? ` · ${o.updated_by_email}` : ""}
                        {o.updated_at ? ` · ${formatDateTime(o.updated_at)}` : ""}
                      </div>
                    )}

                    {o.status === "delayed" && (
                      <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3">
                        <div className="text-xs font-semibold text-amber-900">Delay details</div>
                        <div className="mt-2 grid gap-3 sm:grid-cols-[auto,1fr] sm:items-start">
                          <label className="text-xs text-amber-900">
                            <span className="font-semibold">Projected ship date</span>
                            <Input
                              type="date"
                              value={delayDateDraft[o.id] ?? o.projected_ship_date ?? ""}
                              onChange={(e) =>
                                setDelayDateDraft((d) => ({ ...d, [o.id]: e.target.value }))
                              }
                              className="mt-1 h-9 text-sm"
                            />
                          </label>
                          <label className="text-xs text-amber-900">
                            <span className="font-semibold">Reason for delay</span>
                            <Textarea
                              value={delayNotesDraft[o.id] ?? o.delay_notes ?? ""}
                              onChange={(e) =>
                                setDelayNotesDraft((d) => ({ ...d, [o.id]: e.target.value }))
                              }
                              rows={2}
                              placeholder="e.g. Vendor backordered until 6/30; waiting on artwork approval."
                              className="mt-1 text-sm"
                            />
                          </label>
                        </div>
                        <div className="mt-2">
                          <button
                            type="button"
                            onClick={() =>
                              saveDelay(
                                o.id,
                                delayDateDraft[o.id] ?? o.projected_ship_date ?? "",
                                delayNotesDraft[o.id] ?? o.delay_notes ?? ""
                              )
                            }
                            disabled={savingId === o.id}
                            className="inline-flex h-9 items-center rounded-lg bg-amber-600 px-3 text-xs font-semibold text-white transition hover:bg-amber-700 disabled:opacity-50"
                          >
                            Save delay details
                          </button>
                        </div>
                      </div>
                    )}

                    <div className="mt-4 text-sm text-black">{o.items}</div>

                    <dl className="mt-3 grid gap-x-6 gap-y-1 text-xs text-[var(--anchor-gray)] sm:grid-cols-2">
                      <div>
                        <dt className="inline font-semibold text-[var(--anchor-deep)]">Quantity: </dt>
                        <dd className="inline">{o.quantity || "—"}</dd>
                      </div>
                      <div>
                        <dt className="inline font-semibold text-[var(--anchor-deep)]">Needed by: </dt>
                        <dd className="inline">{formatDate(o.needed_by)}</dd>
                      </div>
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

                    <div className="mt-3 border-t border-[var(--border-default)] pt-3 text-xs text-[var(--anchor-gray)]">
                      <span className="font-semibold text-[var(--anchor-deep)]">
                        {o.submitter_name || "—"}
                      </span>
                      {o.submitter_company ? ` · ${o.submitter_company}` : ""}
                      {o.submitter_email ? ` · ${o.submitter_email}` : ""}
                      {o.submitter_phone ? ` · ${o.submitter_phone}` : ""}
                    </div>

                    <div className="mt-3 border-t border-[var(--border-default)] pt-3">
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
                            Chat with {o.submitter_name || "the rep"} about this order — clarify details or share photos.
                          </p>
                          <MarketingOrderChat orderId={o.id} />
                        </div>
                      )}
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
