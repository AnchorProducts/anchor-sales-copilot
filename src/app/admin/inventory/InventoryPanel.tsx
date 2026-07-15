"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
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

  const [tab, setTab] = useState<"items" | "checkouts" | "pickups">("items");
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [checkouts, setCheckouts] = useState<ItemCheckout[]>([]);
  const [grabs, setGrabs] = useState<GrabRow[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);

  // Modals
  const [itemModal, setItemModal] = useState<ItemDraft | null>(null);
  const [itemFile, setItemFile] = useState<File | null>(null);
  const [checkoutItem, setCheckoutItem] = useState<InventoryItem | null>(null);
  const [checkinLoan, setCheckinLoan] = useState<ItemCheckout | null>(null);
  const [restockItem, setRestockItem] = useState<InventoryItem | null>(null);
  const [restockQty, setRestockQty] = useState("");
  const [itemQrOpen, setItemQrOpen] = useState(false);
  const [modalErr, setModalErr] = useState<string | null>(null);

  // Items tab filters (search + category) so long lists stay findable.
  const [itemSearch, setItemSearch] = useState("");
  const [itemCat, setItemCat] = useState("");

  const loadAll = useCallback(async () => {
    const [itemsRes, coRes, grabRes] = await Promise.all([
      fetch("/api/inventory", { cache: "no-store" }),
      fetch("/api/inventory/checkouts", { cache: "no-store" }),
      fetch("/api/inventory/grabs", { cache: "no-store" }),
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
    const grabJson = await grabRes.json().catch(() => null);
    if (grabRes.ok) setGrabs(grabJson?.items || []);
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

  const filteredItems = useMemo(() => {
    const q = itemSearch.trim().toLowerCase();
    return items.filter((it) => {
      if (itemCat && it.category !== itemCat) return false;
      if (!q) return true;
      return (
        it.name.toLowerCase().includes(q) ||
        (it.sku || "").toLowerCase().includes(q) ||
        (it.description || "").toLowerCase().includes(q)
      );
    });
  }, [items, itemSearch, itemCat]);

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

  // ── Quick restock (add units to an item's on-hand count) ────────────────────
  function openRestock(it: InventoryItem) {
    setModalErr(null);
    setRestockQty("");
    setRestockItem(it);
  }

  async function submitRestock() {
    if (!restockItem) return;
    const add = Math.floor(Number(restockQty));
    if (!Number.isFinite(add) || add <= 0) {
      setModalErr("Enter how many units to add (1 or more).");
      return;
    }
    setBusy(true);
    setModalErr(null);
    try {
      const res = await fetch("/api/inventory", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: restockItem.id,
          quantity_available: restockItem.quantity_available + add,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setModalErr(json?.error || "Failed to add stock.");
        return;
      }
      setRestockItem(null);
      await loadAll();
    } catch (e: any) {
      setModalErr(e?.message || "Failed to add stock.");
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
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={() => setQrOpen(true)} disabled={busy}>
                  Aisle QR
                </Button>
                <Button variant="secondary" onClick={() => setItemQrOpen(true)} disabled={busy}>
                  Item QR codes
                </Button>
                {tab === "items" && (
                  <Button onClick={openCreate} disabled={busy}>
                    + Add item
                  </Button>
                )}
              </div>
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
              <button
                type="button"
                onClick={() => setTab("pickups")}
                className={`rounded-xl px-3 py-1.5 text-sm font-semibold ${
                  tab === "pickups"
                    ? "bg-[var(--anchor-green)] text-white"
                    : "border border-[var(--border-default)] bg-white text-[var(--anchor-deep)]"
                }`}
              >
                Aisle pickups ({grabs.length})
              </button>
            </div>

            {loadErr && (
              <Card className="mb-4 border-red-200 bg-red-50 p-4 text-sm text-red-700">{loadErr}</Card>
            )}

            {tab === "items" ? (
              <>
                <div className="mb-3 flex flex-col gap-2">
                  <Input
                    value={itemSearch}
                    onChange={(e) => setItemSearch(e.target.value)}
                    placeholder="Search by name or SKU…"
                  />
                  <div className="flex flex-wrap gap-1.5">
                    <FilterChip label="All" active={itemCat === ""} onClick={() => setItemCat("")} />
                    {INVENTORY_CATEGORIES.map((c) => (
                      <FilterChip
                        key={c.key}
                        label={c.label}
                        active={itemCat === c.key}
                        onClick={() => setItemCat(c.key)}
                      />
                    ))}
                  </div>
                  {(itemSearch || itemCat) && (
                    <span className="text-xs text-[var(--anchor-gray)]">
                      Showing {filteredItems.length} of {items.length}
                    </span>
                  )}
                </div>
                <ItemsList
                  items={filteredItems}
                  onEdit={openEdit}
                  onCheckout={openCheckout}
                  onDelete={deleteItem}
                  onRemoveImage={removeImage}
                  onRestock={openRestock}
                  busy={busy}
                />
              </>
            ) : tab === "checkouts" ? (
              <CheckoutsList checkouts={checkouts} onCheckin={openCheckin} busy={busy} />
            ) : (
              <PickupsList grabs={grabs} />
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

      {/* Aisle QR modal */}
      <AisleQrModal open={qrOpen} onClose={() => setQrOpen(false)} canRotate={role === "admin"} />

      {/* Item QR export modal */}
      <ItemQrModal open={itemQrOpen} onClose={() => setItemQrOpen(false)} items={items} />

      {/* Restock modal */}
      <Modal open={!!restockItem} className="max-w-sm">
        {restockItem && (
          <div className="p-5">
            <h2 className="text-lg font-bold text-[var(--anchor-deep)]">Add stock — {restockItem.name}</h2>
            <p className="text-sm text-[var(--anchor-gray)]">
              {restockItem.quantity_available} on hand now.
            </p>
            {modalErr && <div className="mt-2 rounded-lg bg-red-50 p-2 text-sm text-red-700">{modalErr}</div>}
            <label className="mt-3 block text-sm">
              <span className="font-medium">Units to add</span>
              <Input
                type="number"
                min="1"
                step="1"
                value={restockQty}
                onChange={(e) => setRestockQty(e.target.value)}
                placeholder="e.g. 20"
              />
            </label>
            {Number(restockQty) > 0 && (
              <p className="mt-2 text-xs text-[var(--anchor-gray)]">
                New total: <strong>{restockItem.quantity_available + Math.floor(Number(restockQty))}</strong>
              </p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setRestockItem(null)} disabled={busy}>
                Cancel
              </Button>
              <Button onClick={submitRestock} disabled={busy}>
                {busy ? "Adding…" : "Add stock"}
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

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-xs font-semibold ${
        active
          ? "bg-[var(--anchor-green)] text-white"
          : "border border-[var(--border-default)] bg-white text-[var(--anchor-deep)]"
      }`}
    >
      {label}
    </button>
  );
}

function ItemsList({
  items,
  onEdit,
  onCheckout,
  onDelete,
  onRemoveImage,
  onRestock,
  busy,
}: {
  items: InventoryItem[];
  onEdit: (it: InventoryItem) => void;
  onCheckout: (it: InventoryItem) => void;
  onDelete: (it: InventoryItem) => void;
  onRemoveImage: (it: InventoryItem) => void;
  onRestock: (it: InventoryItem) => void;
  busy: boolean;
}) {
  const [openId, setOpenId] = useState<string | null>(null);

  if (items.length === 0) {
    return <Card className="p-6 text-sm text-[var(--anchor-gray)]">No items to show.</Card>;
  }
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
                  <h3 className="text-sm font-bold leading-snug text-[var(--anchor-deep)] break-words">{it.name}</h3>
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
                  <Button variant="secondary" onClick={() => onRestock(it)} disabled={busy}>
                    + Add stock
                  </Button>
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

type GrabRow = {
  id: string;
  item_id: string | null;
  item_name: string;
  grabbed_by_name: string;
  grabbed_by_email: string;
  quantity: number;
  created_at: string;
};

// The scope selector for the aisle QR codes: one "master" QR for everything,
// plus one per category (Samples, Swag, Brochures, …). All scopes share the same
// underlying token, so a single rotate/disable controls every printed code.
const QR_SCOPES: { key: string; label: string }[] = [
  { key: "", label: "All items" },
  ...INVENTORY_CATEGORIES.map((c) => ({ key: c.key, label: c.label })),
];

// Build the public /grab URL for a scope. `base` is the token URL from the API;
// a category scope just appends ?cat=<key>.
function scopeUrl(base: string, key: string): string {
  if (!base) return "";
  return key ? `${base}?cat=${encodeURIComponent(key)}` : base;
}

// The printable aisle QR codes. Fetches the shared token, then renders a QR for
// the selected scope (via the qrcode package — no external calls). Admins can
// copy a link, print one poster, print every category poster at once, or rotate
// the token (which invalidates all printed codes).
function AisleQrModal({
  open,
  onClose,
  canRotate,
}: {
  open: boolean;
  onClose: () => void;
  canRotate: boolean;
}) {
  const [base, setBase] = useState<string>("");
  const [enabled, setEnabled] = useState<boolean>(true);
  const [scope, setScope] = useState<string>(""); // "" = all items
  const [dataUrl, setDataUrl] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [copied, setCopied] = useState(false);

  const activeLabel = QR_SCOPES.find((s) => s.key === scope)?.label || "All items";
  const activeUrl = scopeUrl(base, scope);

  const makeQr = useCallback(async (link: string): Promise<string> => {
    if (!link) return "";
    try {
      return await QRCode.toDataURL(link, { width: 640, margin: 2, errorCorrectionLevel: "M" });
    } catch {
      return "";
    }
  }, []);

  // Re-render the QR whenever the base URL or selected scope changes.
  useEffect(() => {
    let alive = true;
    (async () => {
      const png = await makeQr(scopeUrl(base, scope));
      if (alive) setDataUrl(png);
    })();
    return () => {
      alive = false;
    };
  }, [base, scope, makeQr]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/inventory/aisle-qr", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setErr(json?.error || "Failed to load the aisle QR.");
        return;
      }
      setBase(json.url || "");
      setEnabled(!!json.enabled);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  async function post(action: string, extra: Record<string, unknown> = {}) {
    setWorking(true);
    setErr(null);
    try {
      const res = await fetch("/api/inventory/aisle-qr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setErr(json?.error || "That didn't work.");
        return;
      }
      setBase(json.url || "");
      setEnabled(!!json.enabled);
    } finally {
      setWorking(false);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(activeUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — ignore */
    }
  }

  // One printed page per poster. `posters` is [{label, dataUrl}] — the selected
  // scope for "Print poster", or every scope for "Print all".
  function printPosters(posters: { label: string; dataUrl: string }[]) {
    const usable = posters.filter((p) => p.dataUrl);
    if (!usable.length) return;
    const w = window.open("", "_blank", "width=800,height=900");
    if (!w) return;
    const pages = usable
      .map(
        (p) =>
          `<section><h1>Taking ${p.label === "All items" ? "marketing stock" : p.label}?</h1>` +
          `<p>Scan to tell us — it updates inventory automatically.</p>` +
          `<img src="${p.dataUrl}" alt="Aisle QR code" />` +
          `<small>Anchor Products · Marketing Inventory · ${p.label}</small></section>`
      )
      .join("");
    w.document.write(
      `<!doctype html><html><head><title>Marketing Aisle QR</title>` +
        `<style>body{font-family:system-ui,-apple-system,sans-serif;margin:0;color:#0f2e2a}` +
        `section{text-align:center;padding:48px;page-break-after:always;box-sizing:border-box}` +
        `section:last-child{page-break-after:auto}` +
        `h1{font-size:34px;margin:0 0 6px}p{color:#5b6b66;font-size:18px;margin:0 0 28px}` +
        `img{width:420px;height:420px}small{display:block;margin-top:22px;color:#8a9691;font-size:13px}</style>` +
        `</head><body>${pages}<script>window.onload=function(){window.print()}</script></body></html>`
    );
    w.document.close();
  }

  async function printAll() {
    if (!base) return;
    setWorking(true);
    try {
      const posters = await Promise.all(
        QR_SCOPES.map(async (s) => ({ label: s.label, dataUrl: await makeQr(scopeUrl(base, s.key)) }))
      );
      printPosters(posters);
    } finally {
      setWorking(false);
    }
  }

  return (
    <Modal open={open} className="max-w-md">
      <div className="p-5">
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-bold text-[var(--anchor-deep)]">Marketing aisle QR codes</h2>
          <button type="button" onClick={onClose} className="text-sm text-[var(--anchor-gray)]">
            Close
          </button>
        </div>
        <p className="mt-1 text-sm text-[var(--anchor-gray)]">
          Print one master code for everything, or a separate code per category. Anyone can scan — no login — to
          record what they take, and stock updates automatically.
        </p>

        {err && <div className="mt-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">{err}</div>}

        {loading ? (
          <div className="mt-4 text-sm text-black/60">Loading…</div>
        ) : (
          <>
            {!enabled && (
              <div className="mt-3 rounded-lg bg-amber-50 p-2 text-sm text-amber-800">
                The aisle is currently <strong>disabled</strong> — scans are refused until you re-enable it.
              </div>
            )}

            {/* Scope selector */}
            <div className="mt-4 flex flex-wrap justify-center gap-1.5">
              {QR_SCOPES.map((s) => (
                <button
                  key={s.key || "all"}
                  type="button"
                  onClick={() => setScope(s.key)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    scope === s.key
                      ? "bg-[var(--anchor-green)] text-white"
                      : "border border-[var(--border-default)] bg-white text-[var(--anchor-deep)]"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>

            <div className="mt-4 flex flex-col items-center">
              {dataUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={dataUrl} alt={`${activeLabel} QR code`} className="h-56 w-56" />
              ) : (
                <div className="flex h-56 w-56 items-center justify-center rounded-lg bg-black/5 text-sm text-black/40">
                  No QR
                </div>
              )}
              <div className="mt-2 text-sm font-semibold text-[var(--anchor-deep)]">{activeLabel}</div>
              <code className="mt-1 max-w-full truncate text-xs text-[var(--anchor-gray)]">{activeUrl}</code>
            </div>

            <div className="mt-4 flex flex-wrap justify-center gap-2">
              <Button
                onClick={() => printPosters([{ label: activeLabel, dataUrl }])}
                disabled={!dataUrl}
              >
                Print this poster
              </Button>
              <Button variant="secondary" onClick={printAll} disabled={working || !base}>
                Print all posters
              </Button>
              <Button variant="secondary" onClick={copyLink} disabled={!activeUrl}>
                {copied ? "Copied!" : "Copy link"}
              </Button>
              <Button
                variant="secondary"
                onClick={() => post("toggle", { enabled: !enabled })}
                disabled={working || !canRotate}
              >
                {enabled ? "Disable" : "Enable"}
              </Button>
            </div>

            {canRotate && (
              <div className="mt-3 border-t border-[var(--border-default)] pt-3 text-center">
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm("Rotate the token? Every already-printed QR code will stop working.")) {
                      void post("rotate");
                    }
                  }}
                  disabled={working}
                  className="text-xs text-red-600 underline disabled:opacity-50"
                >
                  Rotate token (invalidates all printed codes)
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function slug(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "item";
}

// Per-item QR codes for shelf labels. Each code deep-links to /grab/<token>?item=<id>
// (shares the same aisle token), so scanning one jumps straight to that item's
// pickup form. Scope by All items or a category, then download a single PNG or
// print a full sheet (which can be saved as a PDF) — one code per item.
function ItemQrModal({
  open,
  onClose,
  items,
}: {
  open: boolean;
  onClose: () => void;
  items: InventoryItem[];
}) {
  const [base, setBase] = useState<string>("");
  const [scope, setScope] = useState<string>(""); // "" = all items
  const [qrs, setQrs] = useState<{ id: string; name: string; qty: number; dataUrl: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [rendering, setRendering] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const scopeLabel = QR_SCOPES.find((s) => s.key === scope)?.label || "All items";
  const scoped = useMemo(() => items.filter((it) => !scope || it.category === scope), [items, scope]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    (async () => {
      setLoading(true);
      setErr(null);
      try {
        const res = await fetch("/api/inventory/aisle-qr", { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (!alive) return;
        if (!res.ok) {
          setErr(json?.error || "Failed to load the aisle token.");
          return;
        }
        setBase(json.url || "");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [open]);

  useEffect(() => {
    if (!open || !base) {
      setQrs([]);
      return;
    }
    let alive = true;
    (async () => {
      setRendering(true);
      const out = await Promise.all(
        scoped.map(async (it) => ({
          id: it.id,
          name: it.name,
          qty: it.quantity_available,
          dataUrl: await QRCode.toDataURL(`${base}?item=${encodeURIComponent(it.id)}`, {
            width: 512,
            margin: 2,
            errorCorrectionLevel: "M",
          }).catch(() => ""),
        }))
      );
      if (alive) {
        setQrs(out);
        setRendering(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [open, base, scoped]);

  function downloadOne(name: string, dataUrl: string) {
    if (!dataUrl) return;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `qr-${slug(name)}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function printSheet() {
    const usable = qrs.filter((q) => q.dataUrl);
    if (!usable.length) return;
    const w = window.open("", "_blank", "width=900,height=1000");
    if (!w) return;
    const cells = usable
      .map(
        (q) =>
          `<div class="cell"><img src="${q.dataUrl}" alt="" /><div class="nm">${escapeHtml(q.name)}</div>` +
          `<div class="sub">Scan to take · ${q.qty} in stock</div></div>`
      )
      .join("");
    w.document.write(
      `<!doctype html><html><head><title>Item QR codes — ${escapeHtml(scopeLabel)}</title>` +
        `<style>body{font-family:system-ui,-apple-system,sans-serif;margin:0;padding:24px;color:#0f2e2a}` +
        `h1{font-size:20px;text-align:center;margin:0 0 18px}` +
        `.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:18px}` +
        `.cell{border:1px solid #dfe4e1;border-radius:12px;padding:16px;text-align:center;break-inside:avoid}` +
        `.cell img{width:210px;height:210px}` +
        `.nm{font-weight:700;font-size:16px;margin-top:8px}` +
        `.sub{color:#8a9691;font-size:12px;margin-top:2px}</style>` +
        `</head><body><h1>Marketing Inventory — ${escapeHtml(scopeLabel)}</h1>` +
        `<div class="grid">${cells}</div>` +
        `<script>window.onload=function(){window.print()}</script></body></html>`
    );
    w.document.close();
  }

  return (
    <Modal open={open} className="max-w-2xl">
      <div className="p-5">
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-bold text-[var(--anchor-deep)]">Item QR codes</h2>
          <button type="button" onClick={onClose} className="text-sm text-[var(--anchor-gray)]">
            Close
          </button>
        </div>
        <p className="mt-1 text-sm text-[var(--anchor-gray)]">
          One QR per item for shelf labels — scanning jumps straight to that item&apos;s pickup form. Download a
          single code, or print a whole sheet (Save as PDF to export).
        </p>

        {err && <div className="mt-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">{err}</div>}

        {loading ? (
          <div className="mt-4 text-sm text-black/60">Loading…</div>
        ) : (
          <>
            {/* Scope selector */}
            <div className="mt-4 flex flex-wrap gap-1.5">
              {QR_SCOPES.map((s) => (
                <button
                  key={s.key || "all"}
                  type="button"
                  onClick={() => setScope(s.key)}
                  className={`rounded-full px-3 py-1 text-xs font-semibold ${
                    scope === s.key
                      ? "bg-[var(--anchor-green)] text-white"
                      : "border border-[var(--border-default)] bg-white text-[var(--anchor-deep)]"
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>

            <div className="mt-3 flex items-center justify-between">
              <span className="text-xs text-[var(--anchor-gray)]">
                {scoped.length} item{scoped.length === 1 ? "" : "s"} in “{scopeLabel}”
              </span>
              <Button onClick={printSheet} disabled={rendering || qrs.filter((q) => q.dataUrl).length === 0}>
                Print sheet
              </Button>
            </div>

            <div className="mt-3 max-h-[52vh] overflow-y-auto pr-1">
              {scoped.length === 0 ? (
                <Card className="p-5 text-sm text-[var(--anchor-gray)]">No items in this group.</Card>
              ) : rendering ? (
                <div className="p-4 text-sm text-black/60">Generating codes…</div>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {qrs.map((q) => (
                    <Card key={q.id} className="flex flex-col items-center p-3 text-center">
                      {q.dataUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={q.dataUrl} alt={`${q.name} QR`} className="h-28 w-28" />
                      ) : (
                        <div className="flex h-28 w-28 items-center justify-center bg-black/5 text-[10px] text-black/40">
                          No QR
                        </div>
                      )}
                      <div className="mt-1 line-clamp-2 text-xs font-semibold text-[var(--anchor-deep)]">
                        {q.name}
                      </div>
                      <div className="text-[10px] text-[var(--anchor-gray)]">{q.qty} in stock</div>
                      <button
                        type="button"
                        onClick={() => downloadOne(q.name, q.dataUrl)}
                        disabled={!q.dataUrl}
                        className="mt-1 text-[11px] text-[var(--anchor-green)] underline disabled:opacity-40"
                      >
                        Download PNG
                      </button>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

function PickupsList({ grabs }: { grabs: GrabRow[] }) {
  if (grabs.length === 0) {
    return (
      <Card className="p-6 text-sm text-[var(--anchor-gray)]">
        No aisle pickups yet. Print the aisle QR (top right) and post it in the marketing aisle.
      </Card>
    );
  }
  return (
    <div className="grid gap-2">
      {grabs.map((g) => (
        <Card key={g.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
          <div className="min-w-0">
            <p className="text-sm">
              <strong>{g.quantity}</strong> × <strong>{g.item_name}</strong>
            </p>
            <p className="text-xs text-[var(--anchor-gray)]">
              {g.grabbed_by_name} · {g.grabbed_by_email}
            </p>
          </div>
          <span className="text-xs text-[var(--anchor-gray)]">{fmtDateTime(g.created_at)}</span>
        </Card>
      ))}
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
