"use client";

// Pre-assembled pizza boxes, from the admin side: what goes in every box besides
// the anchor and its series' pieces, and the QR labels that go on the boxes.
//
// One label per box type — every 3400 Johns Manville TPO box wears the same
// code — so printing is "how many of each did you build". The code opens the
// public box scanner (/grab/<token>/boxes) on the shared aisle token, so
// rotating that token retires these labels along with every other printed code.
//
// Assembling moves no stock; scanning a box out does. See lib/inventory.

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import Modal from "@/app/components/ui/Modal";
import Button from "@/app/components/ui/Button";
import { Card } from "@/app/components/ui/Card";
import { Input, Select } from "@/app/components/ui/Field";
import {
  boxScanUrl,
  describeComponents,
  findKitPiece,
  isBoxType,
  packagingKitLabel,
  PIZZA_BOX_COMPONENTS,
  PIZZA_BOX_KITS,
  type InventoryItem,
} from "@/lib/inventory";
import { MAX_EXTRA_PER_BOX, type BoxExtra } from "@/lib/settings/pizzaBoxExtras";

const MAX_COPIES = 200;

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export default function BoxLabelsModal({
  open,
  onClose,
  items,
}: {
  open: boolean;
  onClose: () => void;
  items: InventoryItem[];
}) {
  const [base, setBase] = useState("");
  const [extras, setExtras] = useState<BoxExtra[]>([]);
  const [savedExtras, setSavedExtras] = useState("[]");
  const [copies, setCopies] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const boxTypes = useMemo(
    () => items.filter(isBoxType).sort((a, b) => a.name.localeCompare(b.name)),
    [items]
  );
  // Offered with a box but no series: there's no telling which pieces are in
  // it, so it gets no label until one is set.
  const noSeries = useMemo(
    () => items.filter((it) => it.pizza_box && !it.packaging_role && !it.packaging_kit),
    [items]
  );
  // Anything that can ride along in every box — not a kit piece (already in
  // it) and not an anchor that is itself a box. Printables first.
  const extraChoices = useMemo(
    () =>
      items
        .filter((it) => !it.packaging_role && !isBoxType(it))
        .sort(
          (a, b) =>
            Number(b.category === "brochures") - Number(a.category === "brochures") ||
            a.name.localeCompare(b.name)
        ),
    [items]
  );
  const itemById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    (async () => {
      setLoading(true);
      setErr(null);
      setSaved(false);
      try {
        const [qrRes, exRes] = await Promise.all([
          fetch("/api/inventory/aisle-qr", { cache: "no-store" }),
          fetch("/api/inventory/box-extras", { cache: "no-store" }),
        ]);
        const qrJson = await qrRes.json().catch(() => null);
        const exJson = await exRes.json().catch(() => null);
        if (!alive) return;
        if (qrRes.ok) setBase(qrJson?.url || "");
        else setErr(qrJson?.error || "Failed to load the aisle link.");
        if (exRes.ok) {
          const list: BoxExtra[] = exJson?.extras || [];
          setExtras(list);
          setSavedExtras(JSON.stringify(list));
        } else {
          setErr(exJson?.error || "Failed to load what's in a box.");
        }
      } catch {
        if (alive) setErr("Couldn't reach the server.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [open]);

  const dirty = JSON.stringify(extras) !== savedExtras;

  function setExtra(index: number, patch: Partial<BoxExtra>) {
    setSaved(false);
    setExtras((prev) => prev.map((e, i) => (i === index ? { ...e, ...patch } : e)));
  }

  function addExtra() {
    const next = extraChoices.find((c) => !extras.some((e) => e.item_id === c.id));
    if (!next) return;
    setSaved(false);
    setExtras((prev) => [...prev, { item_id: next.id, quantity: 1 }]);
  }

  async function saveExtras() {
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch("/api/inventory/box-extras", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ extras }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setErr(json?.error || "Couldn't save what's in a box.");
        return;
      }
      const list: BoxExtra[] = json?.extras || [];
      setExtras(list);
      setSavedExtras(JSON.stringify(list));
      setSaved(true);
    } catch {
      setErr("Couldn't reach the server.");
    } finally {
      setSaving(false);
    }
  }

  // What one box of a series holds, as a sentence — so whoever packs them can
  // check the list against the box in front of them.
  function contentsFor(kit: string): string {
    const pieces = PIZZA_BOX_COMPONENTS.filter((c) => findKitPiece(items, kit, c.key)).map((c) => c.key);
    const parts = ["the anchor"];
    const described = describeComponents(pieces);
    if (described) parts.push(described);
    for (const e of extras) {
      const it = itemById.get(e.item_id);
      if (it) parts.push(`${e.quantity} × ${it.name}`);
    }
    return parts.join(" + ");
  }
  const kitsInUse = PIZZA_BOX_KITS.filter((k) => boxTypes.some((t) => t.packaging_kit === k.key));

  const copyCount = (id: string) =>
    Math.max(0, Math.min(MAX_COPIES, Math.floor(Number(copies[id] || 0)) || 0));
  const totalLabels = boxTypes.reduce((n, t) => n + copyCount(t.id), 0);

  async function printLabels() {
    const wanted = boxTypes.filter((t) => copyCount(t.id) > 0);
    if (!wanted.length || !base) return;
    // Open the window inside the click, before any await — a popup opened after
    // one is blocked.
    const w = window.open("", "_blank", "width=900,height=1000");
    if (!w) return;
    setPrinting(true);
    try {
      const cells: string[] = [];
      for (const t of wanted) {
        const png = await QRCode.toDataURL(boxScanUrl(base, t.id), {
          width: 512,
          margin: 1,
          errorCorrectionLevel: "M",
        }).catch(() => "");
        if (!png) continue;
        const cell =
          `<div class="lbl"><div class="kit">${escapeHtml(packagingKitLabel(t.packaging_kit))} pizza box</div>` +
          `<img src="${png}" alt="" /><div class="nm">${escapeHtml(t.name)}</div>` +
          `<div class="sub">Scan when you take this box</div></div>`;
        for (let i = 0; i < copyCount(t.id); i++) cells.push(cell);
      }
      w.document.write(
        `<!doctype html><html><head><title>Pizza box labels</title>` +
          `<style>@page{margin:0.4in}body{font-family:system-ui,-apple-system,sans-serif;margin:0;color:#0f2e2a}` +
          `.grid{display:grid;grid-template-columns:repeat(3,1fr);gap:0.12in}` +
          `.lbl{border:1px dashed #cfd6d2;border-radius:10px;padding:0.1in;height:2.45in;box-sizing:border-box;` +
          `display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;break-inside:avoid}` +
          `.lbl img{width:1.5in;height:1.5in;margin:2px 0}` +
          `.kit{font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:#1f8a4c}` +
          `.nm{font-weight:800;font-size:14px;line-height:1.15}` +
          `.sub{font-size:9.5px;color:#5b6b66;margin-top:2px}</style>` +
          `</head><body><div class="grid">${cells.join("")}</div>` +
          `<script>window.onload=function(){window.print()}</script></body></html>`
      );
      w.document.close();
    } finally {
      setPrinting(false);
    }
  }

  return (
    <Modal open={open} className="max-w-2xl">
      <div className="p-5">
        <div className="flex items-start justify-between">
          <h2 className="text-lg font-bold text-[var(--anchor-deep)]">🍕 Pizza box labels</h2>
          <button type="button" onClick={onClose} className="text-sm text-[var(--anchor-gray)]">
            Close
          </button>
        </div>
        <p className="mt-1 text-sm text-[var(--anchor-gray)]">
          For boxes you assemble ahead of time. Assembling doesn&apos;t change any counts — scanning a box out
          subtracts everything in it, minus whatever the person pulls back out.
        </p>

        {err && <div className="mt-3 rounded-lg bg-red-50 p-2 text-sm text-red-700">{err}</div>}

        {loading ? (
          <div className="mt-4 text-sm text-black/60">Loading…</div>
        ) : (
          <>
            {/* What's in a box */}
            <h3 className="mt-5 text-sm font-bold text-[var(--anchor-deep)]">What goes in every box</h3>
            <p className="mt-0.5 text-xs text-[var(--anchor-gray)]">
              The anchor and its series&apos; pieces are included automatically. Add the printables you pack in
              each one.
            </p>

            <div className="mt-2 grid gap-2">
              {extras.map((e, i) => (
                <div key={`${e.item_id}-${i}`} className="flex min-w-0 items-center gap-2">
                  <Select
                    className="min-w-0 flex-1"
                    value={e.item_id}
                    onChange={(ev) => setExtra(i, { item_id: ev.target.value })}
                    aria-label="Item in every box"
                  >
                    {extraChoices
                      .filter((c) => c.id === e.item_id || !extras.some((x) => x.item_id === c.id))
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                  </Select>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={MAX_EXTRA_PER_BOX}
                    className="w-16 shrink-0 text-center"
                    value={String(e.quantity)}
                    onChange={(ev) =>
                      setExtra(i, {
                        quantity: Math.max(1, Math.min(MAX_EXTRA_PER_BOX, Math.floor(Number(ev.target.value)) || 1)),
                      })
                    }
                    aria-label="How many per box"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setSaved(false);
                      setExtras((prev) => prev.filter((_, j) => j !== i));
                    }}
                    className="shrink-0 px-1 text-xs font-semibold text-red-600 underline"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button variant="secondary" onClick={addExtra} disabled={extras.length >= extraChoices.length}>
                + Add an item
              </Button>
              <Button onClick={saveExtras} disabled={saving || !dirty}>
                {saving ? "Saving…" : "Save"}
              </Button>
              {saved && !dirty && <span className="text-xs font-semibold text-green-700">Saved</span>}
              {dirty && <span className="text-xs text-amber-700">Not saved yet</span>}
            </div>

            {kitsInUse.length > 0 && (
              <div className="mt-3 grid gap-1 rounded-xl bg-[var(--surface-soft)] p-3 text-xs text-[var(--anchor-deep)]">
                {kitsInUse.map((k) => (
                  <div key={k.key}>
                    <strong>{k.label} box:</strong> {contentsFor(k.key)}
                  </div>
                ))}
              </div>
            )}

            {/* Labels */}
            <div className="mt-6 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-[var(--anchor-deep)]">Labels — how many did you build?</h3>
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  onClick={() => setCopies(Object.fromEntries(boxTypes.map((t) => [t.id, "1"])))}
                  disabled={!boxTypes.length}
                >
                  One of each
                </Button>
                <Button onClick={printLabels} disabled={printing || !base || totalLabels === 0}>
                  {printing ? "Preparing…" : `Print ${totalLabels} label${totalLabels === 1 ? "" : "s"}`}
                </Button>
              </div>
            </div>

            {noSeries.length > 0 && (
              <div className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-800">
                No series set, so no label yet: {noSeries.map((i) => i.name).join(", ")}. Edit the item and choose its
                pizza box kit.
              </div>
            )}

            <div className="mt-2 max-h-[40vh] overflow-y-auto pr-1">
              {boxTypes.length === 0 ? (
                <Card className="p-4 text-sm text-[var(--anchor-gray)]">
                  No box types yet. An anchor sample gets a label once it&apos;s set to “Offer a pizza box at pickup”
                  and has a pizza box kit.
                </Card>
              ) : (
                <div className="grid gap-1.5">
                  {boxTypes.map((t) => (
                    <div
                      key={t.id}
                      className="flex min-w-0 items-center gap-3 rounded-xl border border-[var(--border-default)] px-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-[var(--anchor-deep)]">{t.name}</div>
                        <div className="text-[11px] text-[var(--anchor-gray)]">
                          {packagingKitLabel(t.packaging_kit)} · {t.quantity_available} anchors on the count
                        </div>
                      </div>
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={MAX_COPIES}
                        placeholder="0"
                        className="w-16 shrink-0 text-center"
                        value={copies[t.id] || ""}
                        onChange={(ev) => setCopies((prev) => ({ ...prev, [t.id]: ev.target.value }))}
                        aria-label={`Labels for ${t.name}`}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
            <p className="mt-2 text-[11px] text-[var(--anchor-gray)]">
              Don&apos;t see an anchor? Edit it, turn on “Offer a pizza box at pickup”, and choose its kit.
            </p>
          </>
        )}
      </div>
    </Modal>
  );
}
