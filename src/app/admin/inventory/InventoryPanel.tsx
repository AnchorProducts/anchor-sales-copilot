"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { AppNavbar } from "@/app/components/ui/AppNavbar";
import { Card } from "@/app/components/ui/Card";
import Modal from "@/app/components/ui/Modal";
import Button from "@/app/components/ui/Button";
import { Input, Select, Textarea } from "@/app/components/ui/Field";
import { useTranslation } from "@/lib/i18n/useTranslation";
import {
  INVENTORY_CATEGORIES,
  inventoryCategoryLabel,
  formatUnitCost,
  type InventoryItem,
  type ItemCheckout,
} from "@/lib/inventory";

function fmtDate(s: string | null) {
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
function fmtDateTime(s: string | null) {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString("en-US", {
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return s;
  }
}

type ItemDraft = {
  id?: string;
  name: string;
  category: string;
  description: string;
  sku: string;
  unit_cost: string;
  location: string;
  quantity_available: string;
  low_stock_threshold: string;
};

const EMPTY_DRAFT: ItemDraft = {
  name: "",
  category: "",
  description: "",
  sku: "",
  unit_cost: "",
  location: "",
  quantity_available: "0",
  low_stock_threshold: "0",
};

export default function AdminInventoryPage({
  embedded = false,
}: { embedded?: boolean } = {}) {
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const { t } = useTranslation();

  const [ready, setReady] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [role, setRole] = useState<string>("");

  const [tab, setTab] = useState<"items" | "checkouts">("items");
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [checkouts, setCheckouts] = useState<ItemCheckout[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Modals
  const [itemModal, setItemModal] = useState<ItemDraft | null>(null);
  const [itemFile, setItemFile] = useState<File | null>(null);
  const [checkoutItem, setCheckoutItem] = useState<InventoryItem | null>(null);
  const [checkinLoan, setCheckinLoan] = useState<ItemCheckout | null>(null);
  const [modalErr, setModalErr] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    const [itemsRes, coRes] = await Promise.all([
      fetch("/api/inventory", { cache: "no-store" }),
      fetch("/api/inventory/checkouts", { cache: "no-store" }),
    ]);
    const itemsJson = await itemsRes.json().catch(() => null);
    if (!itemsRes.ok) {
      setLoadErr(itemsJson?.error || "Failed to load inventory.");
      return;
    }
    setLoadErr(null);
    setItems(itemsJson?.items || []);
    const coJson = await coRes.json().catch(() => null);
    if (coRes.ok) setCheckouts(coJson?.items || []);
  }, []);

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
      if (userRole !== "admin" && userRole !== "anchor_rep") {
        setAccessError("This page is for the Anchor fulfillment team.");
        setReady(true);
        return;
      }
      setRole(userRole);
      await loadAll();
      if (!alive) return;
      setReady(true);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, supabase]);

  const overdueCount = useMemo(() => checkouts.filter((c) => c.overdue).length, [checkouts]);
  const openCount = useMemo(() => checkouts.filter((c) => c.status === "out").length, [checkouts]);

  // ── Item create/edit ───────────────────────────────────────────────────────
  function openCreate() {
    setModalErr(null);
    setItemFile(null);
    setItemModal({ ...EMPTY_DRAFT });
  }
  function openEdit(it: InventoryItem) {
    setModalErr(null);
    setItemFile(null);
    setItemModal({
      id: it.id,
      name: it.name,
      category: it.category || "",
      description: it.description || "",
      sku: it.sku || "",
      unit_cost: it.unit_cost === null || it.unit_cost === undefined ? "" : String(it.unit_cost),
      location: it.location || "",
      quantity_available: String(it.quantity_available),
      low_stock_threshold: String(it.low_stock_threshold),
    });
  }

  async function saveItem() {
    if (!itemModal) return;
    if (!itemModal.name.trim()) {
      setModalErr("Item name is required.");
      return;
    }
    setBusy(true);
    setModalErr(null);
    try {
      const payload = {
        id: itemModal.id,
        name: itemModal.name.trim(),
        category: itemModal.category || null,
        description: itemModal.description,
        sku: itemModal.sku,
        unit_cost: itemModal.unit_cost === "" ? null : itemModal.unit_cost,
        location: itemModal.location,
        quantity_available: itemModal.quantity_available || "0",
        low_stock_threshold: itemModal.low_stock_threshold || "0",
      };
      const res = await fetch("/api/inventory", {
        method: itemModal.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setModalErr(json?.error || "Failed to save item.");
        return;
      }
      const savedId: string | undefined = json?.item?.id || itemModal.id;
      if (itemFile && savedId) {
        const imgUrl = `/api/inventory/${encodeURIComponent(savedId)}/image`;
        const contentType = itemFile.type || "application/octet-stream";
        // Phase 1: ask the server for a signed upload URL.
        const signRes = await fetch(imgUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phase: "sign", fileName: itemFile.name, contentType }),
        });
        const sign = await signRes.json().catch(() => null);
        if (!signRes.ok || !sign?.token || !sign?.path) {
          setModalErr(sign?.error || "Item saved, but the photo failed to upload.");
          await loadAll();
          return;
        }
        // Phase 2: upload the bytes straight to Supabase Storage (no Vercel cap).
        const { error: upErr } = await supabase.storage
          .from(sign.bucket)
          .uploadToSignedUrl(sign.path, sign.token, itemFile, { contentType });
        if (upErr) {
          setModalErr(`Item saved, but the photo failed to upload: ${upErr.message}`);
          await loadAll();
          return;
        }
        // Phase 3: point the item at the uploaded photo.
        const commit = await fetch(imgUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phase: "commit", path: sign.path }),
        });
        if (!commit.ok) {
          const cJson = await commit.json().catch(() => null);
          setModalErr(cJson?.error || "Item saved, but the photo failed to upload.");
          await loadAll();
          return;
        }
      }
      setItemModal(null);
      setItemFile(null);
      await loadAll();
    } catch (e: any) {
      setModalErr(e?.message || "Failed to save item.");
    } finally {
      setBusy(false);
    }
  }

  async function deleteItem(it: InventoryItem) {
    if (!window.confirm(`Delete "${it.name}"? This can’t be undone.`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/inventory?id=${encodeURIComponent(it.id)}`, { method: "DELETE" });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setLoadErr(json?.error || "Failed to delete item.");
      } else {
        await loadAll();
      }
    } finally {
      setBusy(false);
    }
  }

  async function removeImage(it: InventoryItem) {
    setBusy(true);
    try {
      await fetch(`/api/inventory/${encodeURIComponent(it.id)}/image`, { method: "DELETE" });
      await loadAll();
    } finally {
      setBusy(false);
    }
  }

  // ── Checkout / check-in ──────────────────────────────────────────────────────
  const [coQty, setCoQty] = useState("1");
  const [coEvent, setCoEvent] = useState("");
  const [coDue, setCoDue] = useState("");
  const [coTakenBy, setCoTakenBy] = useState("");
  const [coNotes, setCoNotes] = useState("");

  function openCheckout(it: InventoryItem) {
    setModalErr(null);
    setCoQty("1");
    setCoEvent("");
    setCoDue("");
    setCoTakenBy("");
    setCoNotes("");
    setCheckoutItem(it);
  }

  async function submitCheckout() {
    if (!checkoutItem) return;
    setBusy(true);
    setModalErr(null);
    try {
      const res = await fetch("/api/inventory/checkouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item_id: checkoutItem.id,
          quantity: coQty,
          event_name: coEvent,
          due_back_date: coDue || null,
          taken_by: coTakenBy,
          notes: coNotes,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setModalErr(json?.error || "Failed to check out.");
        return;
      }
      setCheckoutItem(null);
      setTab("checkouts");
      await loadAll();
    } catch (e: any) {
      setModalErr(e?.message || "Failed to check out.");
    } finally {
      setBusy(false);
    }
  }

  const [ciReturned, setCiReturned] = useState("0");
  const [ciDamaged, setCiDamaged] = useState("0");

  function openCheckin(loan: ItemCheckout) {
    setModalErr(null);
    setCiDamaged("0");
    setCiReturned(String(loan.quantity));
    setCheckinLoan(loan);
  }

  async function submitCheckin() {
    if (!checkinLoan) return;
    setBusy(true);
    setModalErr(null);
    try {
      const res = await fetch("/api/inventory/checkouts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: checkinLoan.id,
          action: "checkin",
          quantity_returned: ciReturned,
          quantity_damaged: ciDamaged,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setModalErr(json?.error || "Failed to check in.");
        return;
      }
      setCheckinLoan(null);
      await loadAll();
    } catch (e: any) {
      setModalErr(e?.message || "Failed to check in.");
    } finally {
      setBusy(false);
    }
  }

  const shell = (
    <>
      <div className={embedded ? "pt-4" : "ds-container py-6 pb-[calc(3rem+env(safe-area-inset-bottom))] sm:py-10"}>
        {!ready ? (
          <Card className="p-5 text-sm text-black/60">{t("loading")}</Card>
        ) : accessError ? (
          <Card className="border-[var(--anchor-deep)]/25 bg-[var(--anchor-mint)] p-5 text-sm text-[var(--anchor-deep)]">
            {accessError}
          </Card>
        ) : (
          <>
            <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Marketing Inventory</h1>
                <p className="mt-1 text-sm text-[var(--anchor-gray)]">
                  Track marketing stock and check items out for tradeshows.
                </p>
              </div>
              {tab === "items" && (
                <Button onClick={openCreate} disabled={busy}>
                  + Add item
                </Button>
              )}
            </header>

            {/* Tabs */}
            <div className="mb-4 flex gap-2">
              <button
                type="button"
                onClick={() => setTab("items")}
                className={`rounded-xl px-3 py-1.5 text-sm font-semibold ${
                  tab === "items"
                    ? "bg-[var(--anchor-green)] text-white"
                    : "border border-[var(--border-default)] bg-white text-[var(--anchor-deep)]"
                }`}
              >
                Items ({items.length})
              </button>
              <button
                type="button"
                onClick={() => setTab("checkouts")}
                className={`rounded-xl px-3 py-1.5 text-sm font-semibold ${
                  tab === "checkouts"
                    ? "bg-[var(--anchor-green)] text-white"
                    : "border border-[var(--border-default)] bg-white text-[var(--anchor-deep)]"
                }`}
              >
                Checkouts ({openCount})
                {overdueCount > 0 && (
                  <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-700">
                    {overdueCount} overdue
                  </span>
                )}
              </button>
            </div>

            {loadErr && (
              <Card className="mb-4 border-red-200 bg-red-50 p-4 text-sm text-red-700">{loadErr}</Card>
            )}

            {tab === "items" ? (
              <ItemsList
                items={items}
                onEdit={openEdit}
                onCheckout={openCheckout}
                onDelete={deleteItem}
                onRemoveImage={removeImage}
                busy={busy}
              />
            ) : (
              <CheckoutsList checkouts={checkouts} onCheckin={openCheckin} busy={busy} />
            )}
          </>
        )}
      </div>

      {/* Item modal */}
      <Modal open={!!itemModal} className="max-w-lg">
        {itemModal && (
          <div className="p-5">
            <h2 className="text-lg font-bold text-[var(--anchor-deep)]">
              {itemModal.id ? "Edit item" : "Add item"}
            </h2>
            {modalErr && <div className="mt-2 rounded-lg bg-red-50 p-2 text-sm text-red-700">{modalErr}</div>}
            <div className="mt-3 grid gap-3">
              <label className="block text-sm">
                <span className="font-medium">Name *</span>
                <Input
                  value={itemModal.name}
                  onChange={(e) => setItemModal({ ...itemModal, name: e.target.value })}
                  placeholder="e.g. Retractable banner stand"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm">
                  <span className="font-medium">Category</span>
                  <Select
                    value={itemModal.category}
                    onChange={(e) => setItemModal({ ...itemModal, category: e.target.value })}
                  >
                    <option value="">—</option>
                    {INVENTORY_CATEGORIES.map((c) => (
                      <option key={c.key} value={c.key}>
                        {c.label}
                      </option>
                    ))}
                  </Select>
                </label>
                <label className="block text-sm">
                  <span className="font-medium">SKU</span>
                  <Input
                    value={itemModal.sku}
                    onChange={(e) => setItemModal({ ...itemModal, sku: e.target.value })}
                  />
                </label>
              </div>
              <label className="block text-sm">
                <span className="font-medium">Description</span>
                <Textarea
                  rows={2}
                  value={itemModal.description}
                  onChange={(e) => setItemModal({ ...itemModal, description: e.target.value })}
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm">
                  <span className="font-medium">Location / bin</span>
                  <Input
                    value={itemModal.location}
                    onChange={(e) => setItemModal({ ...itemModal, location: e.target.value })}
                    placeholder="e.g. Warehouse shelf B3"
                  />
                </label>
                <label className="block text-sm">
                  <span className="font-medium">Unit cost ($)</span>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={itemModal.unit_cost}
                    onChange={(e) => setItemModal({ ...itemModal, unit_cost: e.target.value })}
                  />
                </label>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm">
                  <span className="font-medium">Quantity on hand</span>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={itemModal.quantity_available}
                    onChange={(e) => setItemModal({ ...itemModal, quantity_available: e.target.value })}
                  />
                </label>
                <label className="block text-sm">
                  <span className="font-medium">Low-stock alert at</span>
                  <Input
                    type="number"
                    min="0"
                    step="1"
                    value={itemModal.low_stock_threshold}
                    onChange={(e) => setItemModal({ ...itemModal, low_stock_threshold: e.target.value })}
                  />
                </label>
              </div>
              <label className="block text-sm">
                <span className="font-medium">Photo</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setItemFile(e.target.files?.[0] || null)}
                  className="mt-1 block w-full text-sm"
                />
                {itemModal.id && (
                  <span className="text-xs text-[var(--anchor-gray)]">
                    Choosing a file replaces the current photo.
                  </span>
                )}
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setItemModal(null)} disabled={busy}>
                Cancel
              </Button>
              <Button onClick={saveItem} disabled={busy}>
                {busy ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Checkout modal */}
      <Modal open={!!checkoutItem} className="max-w-md">
        {checkoutItem && (
          <div className="p-5">
            <h2 className="text-lg font-bold text-[var(--anchor-deep)]">Check out — {checkoutItem.name}</h2>
            <p className="text-sm text-[var(--anchor-gray)]">{checkoutItem.quantity_available} available</p>
            {modalErr && <div className="mt-2 rounded-lg bg-red-50 p-2 text-sm text-red-700">{modalErr}</div>}
            <div className="mt-3 grid gap-3">
              <div className="grid grid-cols-2 gap-3">
                <label className="block text-sm">
                  <span className="font-medium">Quantity *</span>
                  <Input
                    type="number"
                    min="1"
                    max={checkoutItem.quantity_available}
                    step="1"
                    value={coQty}
                    onChange={(e) => setCoQty(e.target.value)}
                  />
                </label>
                <label className="block text-sm">
                  <span className="font-medium">Due back</span>
                  <Input type="date" value={coDue} onChange={(e) => setCoDue(e.target.value)} />
                </label>
              </div>
              <label className="block text-sm">
                <span className="font-medium">Event / tradeshow *</span>
                <Input value={coEvent} onChange={(e) => setCoEvent(e.target.value)} placeholder="e.g. NACE Expo 2026" />
              </label>
              <label className="block text-sm">
                <span className="font-medium">Taken by</span>
                <Input value={coTakenBy} onChange={(e) => setCoTakenBy(e.target.value)} placeholder="Who's taking them" />
              </label>
              <label className="block text-sm">
                <span className="font-medium">Notes</span>
                <Textarea rows={2} value={coNotes} onChange={(e) => setCoNotes(e.target.value)} />
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setCheckoutItem(null)} disabled={busy}>
                Cancel
              </Button>
              <Button onClick={submitCheckout} disabled={busy}>
                {busy ? "Checking out…" : "Check out"}
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Check-in modal */}
      <Modal open={!!checkinLoan} className="max-w-md">
        {checkinLoan && (
          <div className="p-5">
            <h2 className="text-lg font-bold text-[var(--anchor-deep)]">
              Check in — {checkinLoan.item_name || "item"}
            </h2>
            <p className="text-sm text-[var(--anchor-gray)]">
              {checkinLoan.quantity} out for {checkinLoan.event_name}
            </p>
            {modalErr && <div className="mt-2 rounded-lg bg-red-50 p-2 text-sm text-red-700">{modalErr}</div>}
            <div className="mt-3 grid grid-cols-2 gap-3">
              <label className="block text-sm">
                <span className="font-medium">Returned (good)</span>
                <Input
                  type="number"
                  min="0"
                  max={checkinLoan.quantity}
                  step="1"
                  value={ciReturned}
                  onChange={(e) => setCiReturned(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                <span className="font-medium">Damaged / lost</span>
                <Input
                  type="number"
                  min="0"
                  max={checkinLoan.quantity}
                  step="1"
                  value={ciDamaged}
                  onChange={(e) => setCiDamaged(e.target.value)}
                />
              </label>
            </div>
            <p className="mt-2 text-xs text-[var(--anchor-gray)]">
              Good units return to stock; damaged/lost units leave the total.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setCheckinLoan(null)} disabled={busy}>
                Cancel
              </Button>
              <Button onClick={submitCheckin} disabled={busy}>
                {busy ? "Saving…" : "Check in"}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );

  if (embedded) return shell;

  return (
    <main className="ds-page">
      <AppNavbar
        title="Marketing Inventory"
        subtitle="Stock & tradeshow checkouts"
        menuItems={[
          { label: t("dashboard"), href: "/dashboard" },
          ...(role === "admin" ? [{ label: "Admin Console", href: "/admin" }] : []),
        ]}
      />
      {shell}
    </main>
  );
}

function ItemsList({
  items,
  onEdit,
  onCheckout,
  onDelete,
  onRemoveImage,
  busy,
}: {
  items: InventoryItem[];
  onEdit: (it: InventoryItem) => void;
  onCheckout: (it: InventoryItem) => void;
  onDelete: (it: InventoryItem) => void;
  onRemoveImage: (it: InventoryItem) => void;
  busy: boolean;
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (items.length === 0) {
    return <Card className="p-6 text-sm text-[var(--anchor-gray)]">No inventory items yet. Add your first one.</Card>;
  }
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-4">
      {items.map((it) => {
        const open = openId === it.id;
        return (
          <Card
            key={it.id}
            className={`overflow-hidden p-0 ${open ? "col-span-2 lg:col-span-3 xl:col-span-4" : ""}`}
          >
            {/* Compact tile — click to open the item's details + actions. */}
            <button
              type="button"
              onClick={() => setOpenId(open ? null : it.id)}
              aria-expanded={open}
              className="flex w-full items-center gap-3 p-3 text-left transition hover:bg-[var(--anchor-mint)]/20"
            >
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-[var(--surface-soft)]">
                {it.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={it.image_url} alt={it.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-[10px] text-[var(--anchor-gray)]">
                    No photo
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-1.5">
                  <h3 className="truncate text-sm font-bold text-[var(--anchor-deep)]">{it.name}</h3>
                  <span
                    className={`shrink-0 text-[var(--anchor-gray)] transition-transform ${open ? "rotate-180" : ""}`}
                    aria-hidden
                  >
                    ▾
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  {it.category && (
                    <span className="rounded-full bg-[var(--surface-strong)] px-2 py-0.5 text-[10px] text-[var(--anchor-gray)]">
                      {inventoryCategoryLabel(it.category)}
                    </span>
                  )}
                  {it.low_stock && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                      Low stock
                    </span>
                  )}
                </div>
                <div className="mt-1 text-xs text-[var(--anchor-gray)]">
                  <strong className="text-[var(--anchor-deep)]">{it.quantity_available}</strong> avail ·{" "}
                  <strong className="text-[var(--anchor-deep)]">{it.quantity_out}</strong> out
                </div>
              </div>
            </button>

            {open && (
              <div className="border-t border-[var(--border-default)] px-3 py-3">
                {it.description && (
                  <p className="text-sm text-[var(--anchor-gray)]">{it.description}</p>
                )}
                <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm">
                  {it.sku && (
                    <div>
                      <dt className="text-[10px] font-semibold uppercase tracking-wide text-[var(--anchor-gray)]">SKU</dt>
                      <dd>{it.sku}</dd>
                    </div>
                  )}
                  {it.location && (
                    <div>
                      <dt className="text-[10px] font-semibold uppercase tracking-wide text-[var(--anchor-gray)]">Location</dt>
                      <dd>{it.location}</dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-[10px] font-semibold uppercase tracking-wide text-[var(--anchor-gray)]">Unit cost</dt>
                    <dd>{formatUnitCost(it.unit_cost)}</dd>
                  </div>
                </dl>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => onCheckout(it)} disabled={busy || it.quantity_available <= 0}>
                    Check out
                  </Button>
                  <Button variant="ghost" onClick={() => onEdit(it)} disabled={busy}>
                    Edit
                  </Button>
                  {it.image_url && (
                    <Button variant="ghost" onClick={() => onRemoveImage(it)} disabled={busy}>
                      Remove photo
                    </Button>
                  )}
                  <Button variant="destructive" onClick={() => onDelete(it)} disabled={busy}>
                    Delete
                  </Button>
                </div>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

function CheckoutsList({
  checkouts,
  onCheckin,
  busy,
}: {
  checkouts: ItemCheckout[];
  onCheckin: (loan: ItemCheckout) => void;
  busy: boolean;
}) {
  if (checkouts.length === 0) {
    return <Card className="p-6 text-sm text-[var(--anchor-gray)]">No checkouts yet.</Card>;
  }
  return (
    <div className="grid gap-3">
      {checkouts.map((c) => (
        <Card
          key={c.id}
          className={`p-4 ${c.overdue ? "border-red-300 bg-red-50" : ""}`}
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-base font-bold text-[var(--anchor-deep)]">{c.item_name || "Item"}</h3>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                    c.status === "out"
                      ? c.overdue
                        ? "bg-red-100 text-red-700"
                        : "bg-green-100 text-green-700"
                      : "bg-[var(--surface-strong)] text-[var(--anchor-gray)]"
                  }`}
                >
                  {c.status === "out" ? (c.overdue ? "Overdue" : "Out") : "Returned"}
                </span>
              </div>
              <p className="mt-0.5 text-sm">
                <strong>{c.quantity}</strong> to <strong>{c.event_name}</strong>
                {c.taken_by ? ` — ${c.taken_by}` : ""}
              </p>
              <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-xs text-[var(--anchor-gray)]">
                <span>Out {fmtDateTime(c.checked_out_at)}{c.checked_out_by_name ? ` by ${c.checked_out_by_name}` : ""}</span>
                <span>Due {fmtDate(c.due_back_date)}</span>
                {c.status === "returned" && (
                  <span>
                    Returned {fmtDateTime(c.returned_at)} — {c.quantity_returned ?? 0} good
                    {c.quantity_damaged ? `, ${c.quantity_damaged} damaged/lost` : ""}
                  </span>
                )}
              </div>
              {c.notes && <p className="mt-1 text-xs text-[var(--anchor-gray)]">{c.notes}</p>}
            </div>
            {c.status === "out" && (
              <Button onClick={() => onCheckin(c)} disabled={busy}>
                Check in
              </Button>
            )}
          </div>
        </Card>
      ))}
    </div>
  );
}
