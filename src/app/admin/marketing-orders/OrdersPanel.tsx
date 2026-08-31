"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { AppNavbar } from "@/app/components/ui/AppNavbar";
import { Card } from "@/app/components/ui/Card";
import Modal from "@/app/components/ui/Modal";
import { useTranslation } from "@/lib/i18n/useTranslation";
import {
  marketingCategoriesLabel,
  marketingOrderStatusLabel,
  marketingOrderStatusPill,
  MARKETING_ORDER_STATUSES,
} from "@/lib/marketingOrders";
import OrderStatusTracker from "@/app/components/marketing/OrderStatusTracker";
import MarketingOrderChat from "@/app/components/marketing/MarketingOrderChat";
import MarketingOrderActivity from "@/app/components/marketing/MarketingOrderActivity";
import { useOrderUnread } from "@/lib/marketing/useOrderUnread";
import { packagingKitLabel } from "@/lib/inventory";
import { Input, Select, Textarea } from "@/app/components/ui/Field";

type MarketingOrder = {
  id: string;
  categories: string[] | null;
  items: string;
  quantity: string | null;
  needed_by: string | null;
  ship_to: string | null;
  notes: string | null;
  status: string | null;
  // Tagged by hand — by a marketing admin or the inside rep working it — to say
  // the samples are being ordered in rather than pulled from stock. Never derived
  // from quantity. Tagging leaves inventory untouched on fulfillment and warns
  // the outside rep that this one takes longer.
  needs_custom_order: boolean | null;
  custom_order_tagged_at: string | null;
  // Plastic overlays this order needs, paired + standalone combined. Both draw
  // from the one overlay stock item, so this is a single number.
  overlay_units: number | null;
  // The overlay total split by anchor series ({"2000": 12}), since each series
  // has its own overlay item and the total alone doesn't say which to pull.
  overlay_kits?: Record<string, number> | null;
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
  assigned_to: string | null;
  assigned_to_name: string | null;
  assigned_to_email: string | null;
  last_activity: {
    note: string;
    to_status: string | null;
    created_at: string | null;
    admin_name: string | null;
    admin_email: string | null;
  } | null;
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

function escapeHtml(s: string) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// One printable sheet per order, so the pick list doesn't have to be copied out
// by hand. Opens a window carrying its own styles and prints itself — the same
// approach the inventory QR sheet uses, and it needs no server route.
//
// The ship-to block is boxed with a cut line under it: fold or cut there and the
// address goes straight on the carton, so this doubles as the label.
function printOrder(o: MarketingOrder) {
  const w = window.open("", "_blank", "width=800,height=1000");
  if (!w) return; // popup blocked — nothing to clean up

  const shortId = o.id.slice(0, 8);
  // `items` is the newline-separated text the API composed. Each line becomes a
  // row with a tick box to check off while packing.
  const itemRows = (o.items || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => `<div class="item"><span class="box"></span><span>${escapeHtml(l)}</span></div>`)
    .join("");

  const shipLines = (o.ship_to || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => `<div>${escapeHtml(l)}</div>`)
    .join("");

  const meta = [
    ["Needed by", formatDate(o.needed_by)],
    ["Ordered", o.created_at ? new Date(o.created_at).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }) : "—"],
    ["Status", marketingOrderStatusLabel(o.status)],
    ["Type", marketingCategoriesLabel(o.categories)],
    ...(o.overlay_units ? [["Plastic overlays", String(o.overlay_units)]] : []),
    ...(o.assigned_to_name ? [["Assigned to", o.assigned_to_name]] : []),
  ]
    .map(
      ([k, v]) =>
        `<div class="metaRow"><span class="k">${escapeHtml(k)}</span><span class="v">${escapeHtml(v)}</span></div>`
    )
    .join("");

  const from = [o.submitter_name, o.submitter_company, o.submitter_phone, o.submitter_email]
    .filter(Boolean)
    .map((v) => escapeHtml(String(v)))
    .join(" · ");

  w.document.write(
    `<!doctype html><html><head><title>Marketing order ${escapeHtml(shortId)}</title>` +
      `<style>` +
      `@page{size:letter;margin:0.5in}` +
      `*{box-sizing:border-box}` +
      `body{font-family:system-ui,-apple-system,sans-serif;margin:0;color:#0f2e2a;font-size:13px}` +
      `h1{font-size:22px;margin:0}` +
      `.sub{color:#76777B;font-size:12px;margin-top:2px}` +
      `.hdr{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #11500F;padding-bottom:8px}` +
      `.flag{display:inline-block;background:#fef3c7;color:#92400e;border:1px solid #fcd34d;` +
      `border-radius:999px;padding:3px 10px;font-size:11px;font-weight:700;text-transform:uppercase}` +
      `.ship{border:2px solid #0f2e2a;border-radius:10px;padding:14px 16px;margin-top:14px}` +
      `.ship .lbl{font-size:10px;font-weight:700;letter-spacing:.14em;color:#76777B;text-transform:uppercase}` +
      `.ship .addr{font-size:19px;line-height:1.35;font-weight:600;margin-top:6px}` +
      `.cut{border-top:1px dashed #9aa0a6;margin:12px 0 16px;position:relative}` +
      `.cut span{position:absolute;top:-8px;left:50%;transform:translateX(-50%);background:#fff;` +
      `padding:0 8px;font-size:9px;letter-spacing:.1em;color:#9aa0a6;text-transform:uppercase}` +
      `.sec{font-size:10px;font-weight:700;letter-spacing:.14em;color:#76777B;text-transform:uppercase;margin:0 0 6px}` +
      `.item{display:flex;gap:9px;align-items:flex-start;padding:7px 0;border-bottom:1px solid #eef2f5;` +
      `font-size:15px;break-inside:avoid}` +
      `.box{width:14px;height:14px;border:1.5px solid #0f2e2a;border-radius:3px;flex:0 0 auto;margin-top:2px}` +
      `.metaRow{display:flex;gap:10px;padding:3px 0}` +
      `.k{color:#76777B;min-width:110px}` +
      `.v{font-weight:600}` +
      `.cols{display:flex;gap:28px;margin-top:16px}` +
      `.col{flex:1;min-width:0}` +
      `.notes{white-space:pre-line;border:1px solid #eef2f5;border-radius:8px;padding:10px;background:#fafbfa}` +
      `.foot{margin-top:22px;border-top:1px solid #eef2f5;padding-top:8px;color:#9aa0a6;font-size:10px}` +
      `</style></head><body>` +
      `<div class="hdr"><div><h1>Marketing Order</h1>` +
      `<div class="sub">#${escapeHtml(shortId)}</div></div>` +
      (o.needs_custom_order ? `<div class="flag">Custom order</div>` : "") +
      `</div>` +
      `<div class="ship"><div class="lbl">Ship to</div>` +
      `<div class="addr">${shipLines || "—"}</div></div>` +
      `<div class="cut"><span>cut here for the carton</span></div>` +
      `<div class="cols"><div class="col"><div class="sec">Items — tick as you pack</div>` +
      (itemRows || `<div class="item"><span class="box"></span><span>—</span></div>`) +
      `</div><div class="col" style="flex:0 0 265px"><div class="sec">Details</div>${meta}` +
      (from ? `<div class="sec" style="margin-top:14px">Requested by</div><div>${from}</div>` : "") +
      `</div></div>` +
      (o.notes ? `<div style="margin-top:16px"><div class="sec">Notes</div><div class="notes">${escapeHtml(o.notes)}</div></div>` : "") +
      `<div class="foot">Anchor Co-Pilot · printed ${escapeHtml(new Date().toLocaleString("en-US"))}</div>` +
      `<script>window.onload=function(){window.print()}</script></body></html>`
  );
  w.document.close();
}

export default function AdminMarketingOrdersPage({
  embedded = false,
}: { embedded?: boolean } = {}) {
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const { t } = useTranslation();

  const [ready, setReady] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [role, setRole] = useState<string>("");
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [items, setItems] = useState<MarketingOrder[]>([]);
  // Internal sales reps an admin can assign an order to (id + name), from the API.
  const [assignees, setAssignees] = useState<
    { id: string; full_name: string | null; email: string | null }[]
  >([]);
  // "Assigned to me" filter — narrows both tabs to the current user's own orders.
  const [mineOnly, setMineOnly] = useState(false);
  // "Custom orders" filter — the live orders being ordered in specially.
  const [customOnly, setCustomOnly] = useState(false);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [updateErr, setUpdateErr] = useState<string | null>(null);
  // Per-order working drafts for the delay editor (projected ship date + notes).
  // Falls back to the saved order values when a key isn't present.
  const [delayDateDraft, setDelayDateDraft] = useState<Record<string, string>>({});
  const [delayNotesDraft, setDelayNotesDraft] = useState<Record<string, string>>({});
  // Two views: "active" (in-flight orders) and "archived" (fulfilled/cancelled).
  const [activeTab, setActiveTab] = useState<"active" | "archived">("active");
  // Which order card is expanded. The list shows compact summary cards; clicking
  // one opens its full details (status editor, tracker, messages, activity).
  const [openOrderId, setOpenOrderId] = useState<string | null>(null);
  // Which order's chat thread is currently expanded.
  const [openChatId, setOpenChatId] = useState<string | null>(null);
  // Which order's activity log is currently expanded.
  const [openActivityId, setOpenActivityId] = useState<string | null>(null);
  // A phase move can't commit until the admin says what they did. Selecting a new
  // status stages it here and reveals a required note; saving applies both.
  const [pendingStatus, setPendingStatus] = useState<Record<string, string>>({});
  const [phaseNoteDraft, setPhaseNoteDraft] = useState<Record<string, string>>({});
  // Inventory items for the "what stock did this order consume?" picker shown
  // when fulfilling an order, plus the per-order draft rows {item_id, quantity}.
  const [inventory, setInventory] = useState<
    {
      id: string;
      name: string;
      quantity_available: number;
      packaging_role?: string | null;
      packaging_kit?: string | null;
    }[]
  >([]);
  const [consumeDrafts, setConsumeDrafts] = useState<
    Record<string, Array<{ item_id: string; quantity: string }>>
  >({});
  const { counts: unread, markRead } = useOrderUnread();

  function toggleOrder(orderId: string) {
    setOpenOrderId((cur) => (cur === orderId ? null : orderId));
  }

  function toggleActivity(orderId: string) {
    setOpenActivityId((cur) => (cur === orderId ? null : orderId));
  }

  function toggleChat(orderId: string) {
    setOpenChatId((cur) => {
      const next = cur === orderId ? null : orderId;
      if (next) markRead(orderId);
      return next;
    });
  }

  const isArchived = (o: MarketingOrder) =>
    o.status === "fulfilled" || o.status === "cancelled";

  // The phases where stock actually leaves the building. Shipping is when the box
  // is packed, and since a rep's "received" confirmation is what marks an order
  // fulfilled now, shipping is often the last time the team touches it — so
  // that's where the inventory picker has to be offered too.
  const recordsStock = (status: string | undefined) =>
    status === "shipped" || status === "fulfilled";

  // A needed-by date that has gone past on an order still in flight. Archived
  // orders are done, so they can't be late — only work still owed can.
  const isPastDue = (o: MarketingOrder) =>
    !!o.needed_by && !isArchived(o) && o.needed_by < new Date().toISOString().slice(0, 10);

  // Counts per view, so each tab can show a badge.
  const counts = useMemo(() => {
    let archived = 0;
    for (const o of items) if (isArchived(o)) archived += 1;
    return { active: items.length - archived, archived };
  }, [items]);

  // How many of the loaded orders are assigned to me — drives the filter badge.
  const mineCount = useMemo(
    () => items.filter((o) => o.assigned_to && o.assigned_to === currentUserId).length,
    [items, currentUserId]
  );

  const customCount = useMemo(
    () => items.filter((o) => o.needs_custom_order && !isArchived(o)).length,
    [items]
  );

  const filteredItems = useMemo(
    () =>
      items.filter((o) => {
        if (activeTab === "archived" ? !isArchived(o) : isArchived(o)) return false;
        if (mineOnly && o.assigned_to !== currentUserId) return false;
        if (customOnly && !o.needs_custom_order) return false;
        return true;
      }),
    [items, activeTab, mineOnly, customOnly, currentUserId]
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
    setAssignees(json?.assignees || []);
  }

  // Inventory items for the fulfillment consumption picker. Best-effort: if it
  // fails (e.g. tool not set up), the picker just shows no options.
  async function loadInventory() {
    try {
      const res = await fetch("/api/inventory", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (res.ok) {
        setInventory(
          (json?.items || []).map((it: any) => ({
            id: it.id,
            name: it.name,
            quantity_available: it.quantity_available,
            packaging_role: it.packaging_role ?? null,
            packaging_kit: it.packaging_kit ?? null,
          }))
        );
      }
    } catch {
      /* non-fatal */
    }
  }

  // Consumption-draft row helpers for an order's fulfillment picker.
  function addConsumeRow(id: string) {
    setConsumeDrafts((d) => ({ ...d, [id]: [...(d[id] || []), { item_id: "", quantity: "1" }] }));
  }
  function setConsumeRow(id: string, idx: number, patch: Partial<{ item_id: string; quantity: string }>) {
    setConsumeDrafts((d) => {
      const rows = [...(d[id] || [])];
      rows[idx] = { ...rows[idx], ...patch };
      return { ...d, [id]: rows };
    });
  }
  function removeConsumeRow(id: string, idx: number) {
    setConsumeDrafts((d) => {
      const rows = [...(d[id] || [])];
      rows.splice(idx, 1);
      return { ...d, [id]: rows };
    });
  }

  // The overlay item for a given series. Both the overlays paired with a sample
  // and any ordered on their own come off that series' row — there is one per
  // anchor series, so which one matters.
  const overlayPoolFor = useCallback(
    (kit: string) => inventory.find((it) => it.packaging_role === "overlay" && it.packaging_kit === kit) || null,
    [inventory]
  );

  // What an order's overlays resolve to: one row per series, with the item to
  // decrement. An order from before kits existed carries a total but no split —
  // it's listed under no series, so nothing is pre-filled and the fulfiller
  // picks the item, which is the honest outcome rather than a guess.
  const overlayRowsFor = useCallback(
    (o: MarketingOrder) =>
      Object.entries(o.overlay_kits || {})
        .filter(([, units]) => (units || 0) > 0)
        .map(([kit, units]) => ({ kit, units: units as number, pool: overlayPoolFor(kit) })),
    [overlayPoolFor]
  );

  // Stage a phase change: the admin picks a new status, but nothing is saved until
  // they describe what they did. Re-selecting the current status cancels.
  function stageStatus(o: MarketingOrder, status: string) {
    const current = o.status || "new";
    setUpdateErr(null);
    if (status === current) {
      cancelPhaseChange(o.id);
      return;
    }
    setPendingStatus((d) => ({ ...d, [o.id]: status }));

    // Shipping or fulfilling an order that carries overlays: pre-fill the overlay
    // line so the count is confirmed rather than worked out by hand. The order
    // already knows the total across both routes. A custom order consumes no
    // stock at all, so it gets nothing.
    const overlayRows = overlayRowsFor(o).filter((r) => r.pool);
    if (recordsStock(status) && overlayRows.length > 0 && !o.needs_custom_order) {
      setConsumeDrafts((d) => {
        let rows = d[o.id] || [];
        for (const r of overlayRows) {
          if (rows.some((x) => x.item_id === r.pool!.id)) continue;
          rows = [...rows, { item_id: r.pool!.id, quantity: String(r.units) }];
        }
        return { ...d, [o.id]: rows };
      });
    }
  }

  function cancelPhaseChange(id: string) {
    setPendingStatus((d) => {
      const { [id]: _omit, ...rest } = d;
      return rest;
    });
    setPhaseNoteDraft((d) => {
      const { [id]: _omit, ...rest } = d;
      return rest;
    });
    setConsumeDrafts((d) => {
      const { [id]: _omit, ...rest } = d;
      return rest;
    });
  }

  // Commit the staged phase change with the required note. The API rejects the
  // move without one, so every phase transition leaves an attributed record.
  async function commitPhaseChange(id: string) {
    const status = pendingStatus[id];
    if (!status) return;
    const note = (phaseNoteDraft[id] || "").trim();
    if (!note) {
      setUpdateErr("Add a note describing what you did before moving this order.");
      return;
    }
    // When fulfilling, attach any inventory the order consumed so stock is
    // decremented. Only valid rows (item picked + positive qty) are sent.
    const consumed =
      status === "fulfilled"
        ? (consumeDrafts[id] || [])
            .map((r) => ({ item_id: r.item_id, quantity: Math.floor(Number(r.quantity)) }))
            .filter((r) => r.item_id && Number.isFinite(r.quantity) && r.quantity > 0)
        : [];

    setSavingId(id);
    setUpdateErr(null);
    try {
      const res = await fetch("/api/marketing-orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, status, note, ...(consumed.length ? { consumed } : {}) }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setUpdateErr(json?.error || "Failed to update status.");
      } else {
        // The status moved, but some stock decrements may have failed (e.g. not
        // enough on hand). Surface that without blocking the fulfillment.
        const failed = (json?.consumption || []).filter((c: any) => !c.ok);
        cancelPhaseChange(id);
        // Refresh so the attribution + latest-activity line reflect this change.
        await Promise.all([loadOrders(), loadInventory()]);
        if (failed.length) {
          setUpdateErr(
            `Order fulfilled, but ${failed.length} inventory item(s) couldn't be decremented (insufficient stock or removed). Check inventory.`
          );
        }
      }
    } catch (e: any) {
      setUpdateErr(e?.message || "Failed to update status.");
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

  // Admin-only: set (or clear) the internal rep who owns this order. The API
  // notifies the new assignee and logs it to the activity trail.
  async function assignOrder(id: string, assignedTo: string) {
    setSavingId(id);
    setUpdateErr(null);
    try {
      const res = await fetch("/api/marketing-orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, assigned_to: assignedTo || null }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setUpdateErr(json?.error || "Failed to assign order.");
      } else {
        await loadOrders();
      }
    } catch (e: any) {
      setUpdateErr(e?.message || "Failed to assign order.");
    } finally {
      setSavingId(null);
    }
  }

  // Tag (or untag) an order as a custom order. Open to admins and inside reps
  // alike — whoever is working it makes the call. Tagging emails and pushes the
  // outside rep who placed it, and keeps marketing stock untouched when the
  // order is fulfilled.
  async function setCustomOrder(id: string, needsCustomOrder: boolean) {
    setSavingId(id);
    setUpdateErr(null);
    try {
      const res = await fetch("/api/marketing-orders", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, needs_custom_order: needsCustomOrder }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setUpdateErr(json?.error || "Failed to update the custom-order tag.");
      } else {
        await loadOrders();
      }
    } catch (e: any) {
      setUpdateErr(e?.message || "Failed to update the custom-order tag.");
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

      const userRole = String((prof as { role?: string } | null)?.role || "");
      // Admins and inside (anchor) reps fulfill marketing orders.
      if (userRole !== "admin" && userRole !== "anchor_rep") {
        setAccessError("This page is for the Anchor fulfillment team.");
        setReady(true);
        return;
      }
      setRole(userRole);
      setCurrentUserId(data.user.id);

      await Promise.all([loadOrders(), loadInventory()]);
      if (!alive) return;
      setReady(true);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, supabase]);

  const shell = (
      <div className={embedded ? "pt-4 pb-[calc(6rem+env(safe-area-inset-bottom))] lg:pb-4" : "ds-container py-6 pb-[calc(3rem+env(safe-area-inset-bottom))] sm:py-10"}>
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
                Every samples, printables, swag, and collateral order submitted by sales reps.
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

                <div className="ml-auto flex flex-wrap gap-2">
                {/* Orders being ordered in specially rather than pulled. */}
                {customCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setCustomOnly((v) => !v)}
                    aria-pressed={customOnly}
                    title="Orders tagged as custom orders — samples ordered in, stock unchanged"
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                      customOnly
                        ? "bg-amber-600 text-white"
                        : "bg-amber-100 text-amber-900 hover:bg-amber-200"
                    }`}
                  >
                    ⚑ Custom orders
                    <span
                      className={`rounded-full px-1.5 text-[10px] ${
                        customOnly ? "bg-white/20" : "bg-black/10"
                      }`}
                    >
                      {customCount}
                    </span>
                  </button>
                )}

                {/* Narrow to the orders this user personally owns. */}
                <button
                  type="button"
                  onClick={() => setMineOnly((v) => !v)}
                  aria-pressed={mineOnly}
                  className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                    mineOnly
                      ? "bg-[var(--anchor-green)] text-white"
                      : "bg-[var(--surface-soft)] text-[var(--anchor-deep)] hover:bg-[var(--anchor-mint)]/60"
                  }`}
                >
                  Assigned to me
                  <span
                    className={`rounded-full px-1.5 text-[10px] ${
                      mineOnly ? "bg-white/20" : "bg-black/10"
                    }`}
                  >
                    {mineCount}
                  </span>
                </button>
                </div>
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
              // Cards, not rows — but the card no longer changes shape when you
              // open it. The old grid expanded the opened order to the full row
              // width, which reflowed every card around it; the full order now
              // opens in a dialog over the page, so the grid never moves.
              // Archived is a history you scan, not a queue you work, so it goes
              // two-up at every width — twice as many finished orders in view,
              // and none of them need the room an active one does.
              <div
                className={`grid gap-3 ${
                  activeTab === "archived" ? "grid-cols-2" : "sm:grid-cols-2 xl:grid-cols-3"
                }`}
              >
                {filteredItems.map((o) => {
                  const open = openOrderId === o.id;
                  const late = isPastDue(o);
                  return (
                  <Card key={o.id} className="overflow-hidden p-0">
                    {/* The whole card opens the order. Top-down: where it is,
                        what it is, who it's for, then the deadline pinned to the
                        bottom so it lines up across a row of cards. */}
                    <button
                      type="button"
                      onClick={() => toggleOrder(o.id)}
                      aria-haspopup="dialog"
                      className={`flex h-full w-full flex-col gap-2 p-4 text-left transition hover:bg-[var(--anchor-mint)]/30 ${
                        open ? "bg-[var(--surface-soft)]" : ""
                      }`}
                    >
                      <span className="flex items-center gap-2">
                        <span
                          className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${marketingOrderStatusPill(o.status)}`}
                        >
                          {marketingOrderStatusLabel(o.status)}
                        </span>
                      </span>

                      {/* Two lines of the free-text order, which is as much as
                          identifies it — the rest is in the dialog. */}
                      <span className="line-clamp-2 text-sm font-semibold leading-snug text-black">
                        {o.items}
                      </span>

                      <span className="block text-[11px] leading-relaxed text-[var(--anchor-gray)]">
                        <span className="block truncate">
                          #{o.id.slice(0, 8)} · {o.submitter_name || o.submitter_company || "—"}
                        </span>
                        <span className="block truncate">
                          {marketingCategoriesLabel(o.categories)} · Ordered {formatDateTime(o.created_at)}
                        </span>
                      </span>

                      {/* The flags that change what you do next. */}
                      <span className="flex flex-wrap items-center gap-1.5 empty:hidden">
                        {o.needs_custom_order && (
                          <span
                            className="rounded-full bg-amber-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-900"
                            title="Custom order — samples ordered in, marketing stock unchanged"
                          >
                            Custom order
                          </span>
                        )}
                        {unread[o.id] > 0 && openChatId !== o.id && (
                          <span className="rounded-full bg-[var(--anchor-green)] px-2 py-0.5 text-[10px] font-bold text-white">
                            {unread[o.id]} new message{unread[o.id] === 1 ? "" : "s"}
                          </span>
                        )}
                        {o.assigned_to_name && (
                          <span
                            className="rounded-full bg-[var(--anchor-deep)]/10 px-2 py-0.5 text-[10px] font-semibold text-[var(--anchor-deep)]"
                            title={`Assigned to ${o.assigned_to_name}`}
                          >
                            {o.assigned_to_name}
                          </span>
                        )}
                      </span>

                      {/* mt-auto pins this to the bottom of the card, so the
                          dates line up across a row however long the titles
                          above them run. The deadline decides what gets worked
                          first, which is why it's on the card at all. */}
                      <span className="mt-auto flex items-baseline justify-between gap-2 border-t border-[var(--border-default)] pt-2">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-[var(--anchor-gray)]">
                          Needed by
                        </span>
                        <span
                          className={`text-xs font-semibold ${
                            late ? "text-red-700" : "text-[var(--anchor-deep)]"
                          }`}
                        >
                          {formatDate(o.needed_by)}
                          {late ? " · late" : ""}
                        </span>
                      </span>
                    </button>

                    {/* The full order opens over the queue instead of unfolding
                        inside it: the detail is a screenful of controls, and
                        inline it pushed every row below it down the page and
                        left the list scrolled somewhere else when you closed
                        it. Modal renders nothing while closed, so only the open
                        order's body is ever mounted. */}
                    <Modal
                      open={open}
                      onClose={() => setOpenOrderId(null)}
                      className="flex max-h-[92vh] flex-col overflow-hidden"
                      // .ds-modal is a fixed 640px with its own padding; both
                      // have to be overridden inline to beat the class.
                      style={{ width: "min(100%, 68rem)", padding: 0 }}
                    >
                      <header className="flex items-start gap-3 border-b border-[var(--border-default)] bg-[var(--surface-soft)] px-4 py-3 sm:px-5">
                        <span
                          className={`mt-0.5 shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${marketingOrderStatusPill(o.status)}`}
                        >
                          {marketingOrderStatusLabel(o.status)}
                        </span>
                        <div className="min-w-0 flex-1">
                          <h2 className="truncate text-sm font-bold text-black">
                            Order #{o.id.slice(0, 8)}
                          </h2>
                          <p className="truncate text-[11px] text-[var(--anchor-gray)]">
                            {o.submitter_name || o.submitter_company || "—"} ·{" "}
                            {marketingCategoriesLabel(o.categories)} · Needed by {formatDate(o.needed_by)}
                            {late ? " · late" : ""}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setOpenOrderId(null)}
                          aria-label="Close order"
                          className="-mr-1 shrink-0 rounded-lg px-2 py-1 text-lg leading-none text-[var(--anchor-gray)] transition hover:bg-black/5 hover:text-black"
                        >
                          ✕
                        </button>
                      </header>

                    <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
                      {/* Read on the left, act on the right. Fulfilling an
                          order means looking at what was asked for while working
                          the controls — stacked in one column, the two were
                          screens apart on a desktop. Below lg they stack, which
                          is the only thing that fits a phone. */}
                      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-5">
                        <div className="min-w-0">
                        {/* What they ordered — the headline */}
                        <p className="whitespace-pre-line text-sm font-medium leading-snug text-black">{o.items}</p>

                        {/* Order details — stacked label/value, scannable on a phone */}
                        <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
                          <div>
                            <dt className="text-[11px] font-semibold uppercase tracking-wide text-[var(--anchor-gray)]">
                              Quantity
                            </dt>
                            <dd className="mt-0.5 text-sm text-black">{o.quantity || "—"}</dd>
                          </div>
                          <div>
                            <dt className="text-[11px] font-semibold uppercase tracking-wide text-[var(--anchor-gray)]">
                              Needed by
                            </dt>
                            <dd className="mt-0.5 text-sm text-black">{formatDate(o.needed_by)}</dd>
                          </div>
                          {(o.overlay_units || 0) > 0 && (
                            <div>
                              <dt className="text-[11px] font-semibold uppercase tracking-wide text-[var(--anchor-gray)]">
                                Plastic overlays
                              </dt>
                              <dd className="mt-0.5 text-sm text-black">
                                {o.overlay_units}
                                {/* Which series they come off — the fulfiller pulls
                                    from three different shelves. */}
                                {overlayRowsFor(o).length > 0 && (
                                  <span className="ml-1 text-[var(--anchor-gray)]">
                                    (
                                    {overlayRowsFor(o)
                                      .map((r) => `${r.units} ${packagingKitLabel(r.kit)}`)
                                      .join(", ")}
                                    )
                                  </span>
                                )}
                              </dd>
                            </div>
                          )}
                          <div className="sm:col-span-2">
                            <dt className="text-[11px] font-semibold uppercase tracking-wide text-[var(--anchor-gray)]">
                              Ship to
                            </dt>
                            <dd className="mt-0.5 whitespace-pre-line text-sm text-black">{o.ship_to || "—"}</dd>
                          </div>
                          {o.notes && (
                            <div className="sm:col-span-2">
                              <dt className="text-[11px] font-semibold uppercase tracking-wide text-[var(--anchor-gray)]">
                                Notes
                              </dt>
                              <dd className="mt-0.5 whitespace-pre-line text-sm text-black">{o.notes}</dd>
                            </div>
                          )}
                        </dl>

                        {/* Who submitted it — with tappable contact links */}
                        <div className="mt-4 rounded-xl border border-[var(--border-default)] bg-[var(--surface-soft)] p-3">
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--anchor-gray)]">
                            From
                          </div>
                          <div className="mt-0.5 text-sm font-semibold text-[var(--anchor-deep)]">
                            {o.submitter_name || "—"}
                            {o.submitter_company && (
                              <span className="font-normal text-[var(--anchor-gray)]"> · {o.submitter_company}</span>
                            )}
                          </div>
                          {(o.submitter_email || o.submitter_phone) && (
                            <div className="mt-1 flex flex-col gap-0.5 text-xs sm:flex-row sm:flex-wrap sm:gap-x-4">
                              {o.submitter_email && (
                                <a
                                  href={`mailto:${o.submitter_email}`}
                                  className="break-all font-medium text-[var(--anchor-green)] underline"
                                >
                                  {o.submitter_email}
                                </a>
                              )}
                              {o.submitter_phone && (
                                <a
                                  href={`tel:${o.submitter_phone}`}
                                  className="font-medium text-[var(--anchor-green)] underline"
                                >
                                  {o.submitter_phone}
                                </a>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Latest logged action, up front, so anyone scanning the
                            list sees this order is being handled — and by whom. */}
                        {o.last_activity && (
                          <div className="mt-2 rounded-lg border border-[var(--border-default)] bg-[var(--surface-soft)] px-3 py-2 text-xs">
                            <span className="font-semibold text-[var(--anchor-deep)]">
                              {o.last_activity.admin_name || o.last_activity.admin_email || "Admin"}
                            </span>
                            {o.last_activity.created_at ? ` · ${formatDateTime(o.last_activity.created_at)}` : ""}
                            <div className="mt-0.5 whitespace-pre-line text-[var(--anchor-gray)]">
                              {o.last_activity.note}
                            </div>
                          </div>
                        )}

                        {o.status === "delayed" && (
                          <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3">
                            <div className="text-xs font-semibold text-amber-900">Delay details</div>
                            <div className="mt-2 space-y-3">
                              <label className="block text-xs text-amber-900">
                                <span className="font-semibold">Projected ship date</span>
                                <Input
                                  type="date"
                                  value={delayDateDraft[o.id] ?? o.projected_ship_date ?? ""}
                                  onChange={(e) =>
                                    setDelayDateDraft((d) => ({ ...d, [o.id]: e.target.value }))
                                  }
                                  className="mt-1 h-11 w-full text-sm sm:h-10"
                                />
                              </label>
                              <label className="block text-xs text-amber-900">
                                <span className="font-semibold">Reason for delay</span>
                                <Textarea
                                  value={delayNotesDraft[o.id] ?? o.delay_notes ?? ""}
                                  onChange={(e) =>
                                    setDelayNotesDraft((d) => ({ ...d, [o.id]: e.target.value }))
                                  }
                                  rows={3}
                                  placeholder="e.g. Vendor backordered until 6/30; waiting on artwork approval."
                                  className="mt-1 w-full text-sm"
                                />
                              </label>
                            </div>
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
                              className="mt-3 inline-flex h-10 w-full items-center justify-center rounded-lg bg-amber-600 px-3 text-xs font-semibold text-white transition hover:bg-amber-700 disabled:opacity-50 sm:w-auto"
                            >
                              Save delay details
                            </button>
                          </div>
                        )}

                        {/* Actions: Messages (primary) and a de-emphasized Delete */}
                        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border-default)] pt-4">
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => toggleChat(o.id)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-default)] bg-white px-3 py-2 text-xs font-semibold text-[var(--anchor-deep)] transition hover:bg-[var(--anchor-mint)]/40"
                            >
                              💬 {openChatId === o.id ? "Hide messages" : "Messages"}
                              {unread[o.id] > 0 && openChatId !== o.id && (
                                <span className="inline-flex min-w-[18px] items-center justify-center rounded-full bg-[var(--anchor-green)] px-1.5 text-[10px] font-bold text-white">
                                  {unread[o.id]}
                                </span>
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => toggleActivity(o.id)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-default)] bg-white px-3 py-2 text-xs font-semibold text-[var(--anchor-deep)] transition hover:bg-[var(--anchor-mint)]/40"
                            >
                              🧾 {openActivityId === o.id ? "Hide activity" : "Activity log"}
                            </button>
                            {/* The pick sheet — ship-to block up top to cut out and
                                tape to the carton, tick boxes for the items. */}
                            <button
                              type="button"
                              onClick={() => printOrder(o)}
                              title="Print this request as a pick sheet + ship-to label"
                              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-default)] bg-white px-3 py-2 text-xs font-semibold text-[var(--anchor-deep)] transition hover:bg-[var(--anchor-mint)]/40"
                            >
                              🖨️ Print request
                            </button>
                          </div>
                          {role === "admin" && (
                            <button
                              type="button"
                              onClick={() => deleteOrder(o.id)}
                              disabled={savingId === o.id}
                              title="Delete this order from history"
                              className="inline-flex items-center rounded-lg px-3 py-2 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                            >
                              Delete
                            </button>
                          )}
                        </div>

                        {openActivityId === o.id && (
                          <div className="mt-3">
                            <p className="mb-2 text-xs text-[var(--anchor-gray)]">
                              Who did what and when on this order. Add a note to claim it or record a step so no one doubles up.
                            </p>
                            <MarketingOrderActivity orderId={o.id} onLogged={loadOrders} />
                          </div>
                        )}

                        {openChatId === o.id && (
                          <div className="mt-3">
                            <p className="mb-2 text-xs text-[var(--anchor-gray)]">
                              Chat with {o.submitter_name || "the rep"} about this order — clarify details or share photos.
                            </p>
                            <MarketingOrderChat orderId={o.id} />
                          </div>
                        )}
                        </div>

                        <div className="mt-5 grid gap-4 border-t border-[var(--border-default)] pt-4 lg:mt-0 lg:border-l lg:border-t-0 lg:pl-5 lg:pt-0">
                        {/* Status control: a clear, full-width tap target on mobile */}
                        <div className="mt-4">
                          <label
                            htmlFor={`status-${o.id}`}
                            className="text-[11px] font-semibold uppercase tracking-wide text-[var(--anchor-gray)]"
                          >
                            Update status
                          </label>
                          <Select
                            id={`status-${o.id}`}
                            value={pendingStatus[o.id] ?? o.status ?? "new"}
                            onChange={(e) => stageStatus(o, e.target.value)}
                            disabled={savingId === o.id}
                            className="mt-1 h-11 w-full text-sm sm:h-10"
                            aria-label="Order status"
                          >
                            {MARKETING_ORDER_STATUSES.map((s) => (
                              <option key={s.key} value={s.key}>
                                {s.label}
                              </option>
                            ))}
                          </Select>
                        </div>

                        {/* Owner: which internal rep is on this order. Only admins
                            can set/change it; everyone sees who owns it. */}
                        <div className="mt-4">
                          <label
                            htmlFor={`assignee-${o.id}`}
                            className="text-[11px] font-semibold uppercase tracking-wide text-[var(--anchor-gray)]"
                          >
                            Assigned to
                          </label>
                          {role === "admin" ? (
                            <Select
                              id={`assignee-${o.id}`}
                              value={o.assigned_to ?? ""}
                              onChange={(e) => assignOrder(o.id, e.target.value)}
                              disabled={savingId === o.id}
                              className="mt-1 h-11 w-full text-sm sm:h-10"
                              aria-label="Assigned rep"
                            >
                              <option value="">Unassigned</option>
                              {assignees.map((a) => (
                                <option key={a.id} value={a.id}>
                                  {a.full_name || a.email || "Unnamed rep"}
                                </option>
                              ))}
                            </Select>
                          ) : (
                            <div className="mt-1 text-sm text-black">
                              {o.assigned_to_name || o.assigned_to_email || "Unassigned"}
                            </div>
                          )}
                        </div>

                        {/* Required note before a phase change can be saved, so every
                            admin sees who did what and no one duplicates the work. */}
                        {pendingStatus[o.id] && pendingStatus[o.id] !== (o.status || "new") && (
                          <div className="mt-3 rounded-xl border border-[var(--anchor-deep)]/30 bg-[var(--anchor-mint)]/30 p-3">
                            <div className="text-xs font-semibold text-[var(--anchor-deep)]">
                              Moving to {marketingOrderStatusLabel(pendingStatus[o.id])} — what did you do?
                            </div>
                            <Textarea
                              value={phaseNoteDraft[o.id] ?? ""}
                              onChange={(e) =>
                                setPhaseNoteDraft((d) => ({ ...d, [o.id]: e.target.value }))
                              }
                              rows={3}
                              placeholder="e.g. Printed 50 brochures, boxed them, and handed off to shipping."
                              className="mt-2 w-full text-sm"
                            />
                            <p className="mt-1 text-[11px] text-[var(--anchor-gray)]">
                              Required. This is logged against your name so the team can see this order is handled.
                            </p>

                            {/* A custom order consumed no marketing stock, so there
                                is nothing to decrement — say so instead of offering
                                the picker. The API enforces this too. */}
                            {recordsStock(pendingStatus[o.id]) && o.needs_custom_order && (
                              <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-[11px] text-amber-900">
                                <span className="font-semibold">Custom order</span> — these samples were
                                ordered in, so marketing inventory stays unchanged.
                              </div>
                            )}

                            {/* Inventory consumption: when shipping or fulfilling.
                                Optional — record which stock this order used so
                                it's decremented. */}
                            {recordsStock(pendingStatus[o.id]) && !o.needs_custom_order && (
                              <div className="mt-3 rounded-lg border border-[var(--border-default)] bg-white p-2.5">
                                <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--anchor-gray)]">
                                  Inventory used (optional)
                                </div>
                                <p className="mt-0.5 text-[11px] text-[var(--anchor-gray)]">
                                  Pick the stock item(s) this order consumed to decrement inventory.
                                </p>
                                {(o.overlay_units || 0) > 0 && (
                                  <div className="mt-1 text-[11px] font-medium text-[var(--anchor-deep)]">
                                    {overlayRowsFor(o).length === 0 ? (
                                      <p>
                                        This order needs {o.overlay_units} overlay(s), but they aren&apos;t
                                        tied to an anchor series — pick the right overlay item below.
                                      </p>
                                    ) : (
                                      overlayRowsFor(o).map((r) => (
                                        <p key={r.kit}>
                                          {r.pool
                                            ? `${packagingKitLabel(r.kit)} overlays pre-filled: ${r.units} (paired + ordered on their own come off the same stock).`
                                            : `This order needs ${r.units} ${packagingKitLabel(r.kit)} overlay(s), but no item is tagged as that kit's overlay stock — set one in Marketing Inventory.`}
                                        </p>
                                      ))
                                    )}
                                  </div>
                                )}
                                {(consumeDrafts[o.id] || []).map((row, idx) => {
                                  const picked = inventory.find((it) => it.id === row.item_id);
                                  return (
                                    <div key={idx} className="mt-2 flex items-center gap-2">
                                      <Select
                                        value={row.item_id}
                                        onChange={(e) => setConsumeRow(o.id, idx, { item_id: e.target.value })}
                                        className="h-9 flex-1 text-sm"
                                      >
                                        <option value="">Select item…</option>
                                        {inventory.map((it) => (
                                          <option key={it.id} value={it.id}>
                                            {it.name} ({it.quantity_available} in stock)
                                          </option>
                                        ))}
                                      </Select>
                                      <Input
                                        type="number"
                                        min="1"
                                        step="1"
                                        max={picked ? picked.quantity_available : undefined}
                                        value={row.quantity}
                                        onChange={(e) => setConsumeRow(o.id, idx, { quantity: e.target.value })}
                                        className="h-9 w-20 text-sm"
                                        aria-label="Quantity used"
                                      />
                                      <button
                                        type="button"
                                        onClick={() => removeConsumeRow(o.id, idx)}
                                        aria-label="Remove"
                                        className="text-[var(--anchor-deep)]/60 hover:text-red-600"
                                      >
                                        ✕
                                      </button>
                                    </div>
                                  );
                                })}
                                <button
                                  type="button"
                                  onClick={() => addConsumeRow(o.id)}
                                  className="mt-2 text-xs font-semibold text-[var(--anchor-green)] hover:underline"
                                >
                                  + Add item
                                </button>
                              </div>
                            )}

                            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                              <button
                                type="button"
                                onClick={() => commitPhaseChange(o.id)}
                                disabled={savingId === o.id || !(phaseNoteDraft[o.id] ?? "").trim()}
                                className="inline-flex h-10 items-center justify-center rounded-lg bg-[var(--anchor-deep)] px-4 text-xs font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                              >
                                {savingId === o.id ? "Saving…" : "Save update"}
                              </button>
                              <button
                                type="button"
                                onClick={() => cancelPhaseChange(o.id)}
                                disabled={savingId === o.id}
                                className="inline-flex h-10 items-center justify-center rounded-lg border border-[var(--border-default)] bg-white px-4 text-xs font-semibold text-[var(--anchor-deep)] transition hover:bg-[var(--surface-soft)] disabled:opacity-50"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}

                        {o.status !== "delayed" && (
                          <div className="mt-4 overflow-x-auto">
                            <div className="min-w-[260px]">
                              <OrderStatusTracker status={o.status} />
                            </div>
                          </div>
                        )}

                        {(o.updated_by_name || o.updated_by_email) && (
                          <div className="mt-3 text-xs text-[var(--anchor-gray)]">
                            Last updated by{" "}
                            <span className="font-semibold text-[var(--anchor-deep)]">
                              {o.updated_by_name || o.updated_by_email}
                            </span>
                            {o.updated_at ? ` · ${formatDateTime(o.updated_at)}` : ""}
                          </div>
                        )}

                        {/* The custom-order call. Whoever is working the order
                            decides this — nothing about the order decides it for
                            them. Ticking it emails the rep and locks inventory. */}
                        <div className="mt-4">
                          <label
                            className={
                              "flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 transition " +
                              (o.needs_custom_order
                                ? "border-amber-300 bg-amber-50"
                                : "border-[var(--border-default)] bg-[var(--surface-soft)]")
                            }
                          >
                            <input
                              type="checkbox"
                              checked={!!o.needs_custom_order}
                              onChange={(e) => setCustomOrder(o.id, e.target.checked)}
                              disabled={savingId === o.id}
                              className="mt-0.5 h-4 w-4 shrink-0 accent-amber-600"
                            />
                            <span className="text-sm">
                              <span className="font-semibold text-black">Needs custom order</span>
                              <span className="mt-0.5 block text-xs text-[var(--anchor-gray)]">
                                Can&apos;t be filled from marketing stock — you&apos;re ordering these
                                samples in. Marketing inventory stays unchanged, and{" "}
                                {o.submitter_name || "the rep"} is told this one takes longer.
                              </span>
                              {o.needs_custom_order && o.custom_order_tagged_at && (
                                <span className="mt-1 block text-[11px] font-medium text-amber-800">
                                  Rep notified {formatDateTime(o.custom_order_tagged_at)}
                                </span>
                              )}
                            </span>
                          </label>
                        </div>

                        </div>
                      </div>
                    </div>
                    </Modal>
                  </Card>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
  );

  if (embedded) return shell;

  return (
    <main className="ds-page">
      <AppNavbar
        title="Marketing Orders"
        subtitle="Submitted order history"
        menuItems={[
          { label: t("dashboard"), href: "/dashboard" },
          ...(role === "admin" ? [{ label: "Admin Console", href: "/admin" }] : []),
        ]}
      />
      {shell}
    </main>
  );
}
