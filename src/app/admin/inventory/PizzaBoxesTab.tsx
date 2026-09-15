"use client";

// The Pizza boxes tab of Marketing Inventory: everything about pre-assembled
// boxes in one place. It used to be a kit card over the item list, a labels
// window behind a button, and box scans scattered through the pickup log.
//
//   Box types        — every anchor that ships as a box, how many complete boxes
//                      the shelf holds parts for and what runs out first, and
//                      how many labels to print.
//   Not set up yet   — samples that aren't boxes, one tap from being one.
//   Box scans        — each pass of the scanner as one entry.
//   What's in a box  — each series' pieces, one dropdown per slot, and the
//                      printables every box gets (an app setting).
//   Kit pieces       — each series' four pieces, counted in place.
//
// Assembling moves no stock; scanning a box out does. See lib/inventory.

import { useEffect, useMemo, useState, type ReactNode } from "react";
import QRCode from "qrcode";
import Button from "@/app/components/ui/Button";
import { Card } from "@/app/components/ui/Card";
import { Input, Select } from "@/app/components/ui/Field";
import {
  boxParts,
  boxScanUrl,
  buildableBoxes,
  findKitPiece,
  isBoxType,
  packagingKitLabel,
  PIZZA_BOX_COMPONENTS,
  PIZZA_BOX_KITS,
  seriesFromName,
  type BoxScanRow,
  type InventoryItem,
  type PackagingKit,
  type PackagingRole,
} from "@/lib/inventory";
import { MAX_EXTRA_PER_BOX, type BoxExtra } from "@/lib/settings/pizzaBoxExtras";

const MAX_COPIES = 200;
const SCAN_PAGE = 10;

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fmtDateTime(s: string) {
  try {
    return new Date(s).toLocaleString("en-US", { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  } catch {
    return s;
  }
}

function Section({
  title,
  hint,
  action,
  children,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-[var(--anchor-deep)]">{title}</h2>
          {hint && <p className="mt-0.5 text-xs text-[var(--anchor-gray)]">{hint}</p>}
        </div>
        {action}
      </div>
      <div className="mt-3">{children}</div>
    </Card>
  );
}

export default function PizzaBoxesTab({
  items,
  extras: savedExtras,
  scans,
  kitsCard,
  busy,
  onEdit,
  onChanged,
}: {
  items: InventoryItem[];
  extras: BoxExtra[];
  scans: BoxScanRow[];
  // The kit pieces card, which lives with the panel's stock controls.
  kitsCard: ReactNode;
  busy: boolean;
  onEdit: (it: InventoryItem) => void;
  onChanged: () => Promise<void> | void;
}) {
  const [base, setBase] = useState("");
  const [extras, setExtras] = useState<BoxExtra[]>(savedExtras);
  const [copies, setCopies] = useState<Record<string, string>>({});
  const [setupKit, setSetupKit] = useState<Record<string, string>>({});
  const [scanLimit, setScanLimit] = useState(SCAN_PAGE);
  const [working, setWorking] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // A save reloads the catalog, and so does anyone else's; the stored list is
  // the new starting point for the editor.
  const savedJson = JSON.stringify(savedExtras);
  useEffect(() => {
    setExtras(JSON.parse(savedJson));
  }, [savedJson]);
  const dirty = JSON.stringify(extras) !== savedJson;

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/inventory/aisle-qr", { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (alive && res.ok) setBase(json?.url || "");
      } catch {
        /* labels just stay unprintable */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Built from the SAVED printables — that's what a scan subtracts.
  const boxes = useMemo(
    () =>
      items
        .filter(isBoxType)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((it) => ({ it, ...buildableBoxes(boxParts(it, items, savedExtras), items) })),
    [items, savedExtras]
  );

  // Samples that could be boxes but aren't set up as one: offered with a box
  // but no series, or not offered at all. The kit pieces are samples too, and
  // are never a box.
  const notSetUp = useMemo(
    () =>
      items
        .filter((it) => it.category === "samples" && !it.packaging_role && !isBoxType(it))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [items]
  );

  // Anything that can ride along in every box — not a kit piece (already in it)
  // and not an anchor that is itself a box. Printables first.
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

  // The series whose box can be edited: every launched one, plus the unlaunched
  // 5000 Series once anyone has given it a piece.
  const slotKits = PIZZA_BOX_KITS.filter(
    (k) => !k.preLaunch || items.some((i) => i.packaging_kit === k.key && !!i.packaging_role)
  );

  // What can fill one slot of a series' box: whatever holds it now, or any item
  // that isn't already a piece somewhere or an anchor that is itself a box.
  // That series' own items first ("3000 Series — …"), then samples.
  function slotChoices(kit: PackagingKit, role: PackagingRole): InventoryItem[] {
    const current = findKitPiece(items, kit, role);
    return items
      .filter((it) => it.id === current?.id || (!it.packaging_role && !isBoxType(it)))
      .sort(
        (a, b) =>
          Number(b.name.startsWith(kit)) - Number(a.name.startsWith(kit)) ||
          Number(b.category === "samples") - Number(a.category === "samples") ||
          a.name.localeCompare(b.name)
      );
  }

  // Point one slot of a series' box at a different item — or at nothing. The
  // (kit, role) pair is unique, so whatever holds the slot gives it up first;
  // the scanner, the order form and the labels all follow the new item.
  async function assignSlot(kit: PackagingKit, role: PackagingRole, itemId: string) {
    const current = findKitPiece(items, kit, role);
    if ((current?.id || "") === itemId) return;
    setWorking(true);
    setErr(null);
    const patch = async (body: Record<string, unknown>) => {
      const res = await fetch("/api/inventory", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error || "Couldn't change that piece.");
      }
    };
    try {
      if (current) await patch({ id: current.id, packaging_role: null, packaging_kit: null });
      if (itemId) await patch({ id: itemId, packaging_role: role, packaging_kit: kit });
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Couldn't change that piece.");
    } finally {
      await onChanged();
      setWorking(false);
    }
  }

  const copyCount = (id: string) =>
    Math.max(0, Math.min(MAX_COPIES, Math.floor(Number(copies[id] || 0)) || 0));
  const totalLabels = boxes.reduce((n, b) => n + copyCount(b.it.id), 0);

  async function setUpBox(it: InventoryItem) {
    const kit = setupKit[it.id] || it.packaging_kit || seriesFromName(it.name) || "";
    if (!kit) {
      setErr(`Pick a series for ${it.name} first.`);
      return;
    }
    setWorking(true);
    setErr(null);
    try {
      const res = await fetch("/api/inventory", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: it.id, pizza_box: true, packaging_kit: kit }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setErr(json?.error || `Couldn't set up ${it.name}.`);
        return;
      }
      await onChanged();
    } catch {
      setErr("Couldn't reach the server.");
    } finally {
      setWorking(false);
    }
  }

  async function saveExtras() {
    setWorking(true);
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
      setSaved(true);
      await onChanged();
    } catch {
      setErr("Couldn't reach the server.");
    } finally {
      setWorking(false);
    }
  }

  function addExtra() {
    const next = extraChoices.find((c) => !extras.some((e) => e.item_id === c.id));
    if (!next) return;
    setSaved(false);
    setExtras((prev) => [...prev, { item_id: next.id, quantity: 1 }]);
  }

  function setExtra(index: number, patch: Partial<BoxExtra>) {
    setSaved(false);
    setExtras((prev) => prev.map((e, i) => (i === index ? { ...e, ...patch } : e)));
  }

  async function copyScannerLink() {
    if (!base) return;
    try {
      await navigator.clipboard.writeText(`${base}/boxes`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — ignore */
    }
  }

  async function printLabels() {
    const wanted = boxes.filter((b) => copyCount(b.it.id) > 0);
    if (!wanted.length || !base) return;
    // Open the window inside the click, before any await — a popup opened after
    // one is blocked.
    const w = window.open("", "_blank", "width=900,height=1000");
    if (!w) return;
    const cells: string[] = [];
    for (const { it } of wanted) {
      const png = await QRCode.toDataURL(boxScanUrl(base, it.id), {
        width: 512,
        margin: 1,
        errorCorrectionLevel: "M",
      }).catch(() => "");
      if (!png) continue;
      const cell =
        `<div class="lbl"><div class="kit">${escapeHtml(packagingKitLabel(it.packaging_kit))} pizza box</div>` +
        `<img src="${png}" alt="" /><div class="nm">${escapeHtml(it.name)}</div>` +
        `<div class="sub">Scan when you take this box</div></div>`;
      for (let i = 0; i < copyCount(it.id); i++) cells.push(cell);
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
  }

  const disabled = busy || working;

  return (
    <div className="grid gap-3">
      {err && <Card className="border-red-200 bg-red-50 p-3 text-sm text-red-700">{err}</Card>}

      <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="grid min-w-0 gap-3">
          <Section
            title="🍕 Box types"
            hint="One label per anchor, shared by every box of it. “Can make” is the complete boxes the shelf holds parts for — assembling doesn't change counts, scanning a box out does."
            action={
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" onClick={copyScannerLink} disabled={!base}>
                  {copied ? "Copied!" : "Copy scanner link"}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setCopies(Object.fromEntries(boxes.map((b) => [b.it.id, "1"])))}
                  disabled={!boxes.length}
                >
                  One of each
                </Button>
                <Button onClick={printLabels} disabled={!base || totalLabels === 0}>
                  Print {totalLabels} label{totalLabels === 1 ? "" : "s"}
                </Button>
              </div>
            }
          >
            {boxes.length === 0 ? (
              <p className="text-sm text-[var(--anchor-gray)]">
                No box types yet — set a sample up as a pizza box below.
              </p>
            ) : (
              <div className="grid gap-1.5">
                {boxes.map(({ it, count, limitedBy }) => (
                  <div
                    key={it.id}
                    className="flex min-w-0 items-center gap-3 rounded-xl border border-[var(--border-default)] p-2"
                  >
                    <div className="h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-[var(--surface-soft)]">
                      {it.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={it.image_url} alt="" className="h-full w-full object-cover" />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => onEdit(it)}
                        className="block max-w-full truncate text-left text-sm font-semibold text-[var(--anchor-deep)] hover:underline"
                      >
                        {it.name}
                      </button>
                      <div className="text-[11px] text-[var(--anchor-gray)]">{packagingKitLabel(it.packaging_kit)}</div>
                      <div className={`truncate text-[11px] font-semibold ${count > 0 ? "text-green-700" : "text-amber-700"}`}>
                        {count > 0
                          ? `Can make ${count} · ${limitedBy} runs out first`
                          : `Can't make any — out of ${limitedBy}`}
                      </div>
                    </div>
                    <label className="flex w-16 shrink-0 flex-col items-center text-[10px] text-[var(--anchor-gray)]">
                      Labels
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={MAX_COPIES}
                        placeholder="0"
                        className="text-center"
                        value={copies[it.id] || ""}
                        onChange={(ev) => setCopies((prev) => ({ ...prev, [it.id]: ev.target.value }))}
                      />
                    </label>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {notSetUp.length > 0 && (
            <Section
              title="Samples not set up as boxes"
              hint="An anchor gets a label, a place in the scanner and a Pizza box option on the order form once it has a series. The series is guessed from the name — 3400 is a 3000 Series anchor."
            >
              <div className="grid gap-1.5">
                {notSetUp.map((it) => (
                  <div
                    key={it.id}
                    className="flex min-w-0 flex-wrap items-center gap-2 rounded-xl border border-[var(--border-default)] p-2 sm:flex-nowrap"
                  >
                    <div className="min-w-0 flex-1 basis-full sm:basis-auto">
                      <div className="truncate text-sm font-semibold text-[var(--anchor-deep)]">{it.name}</div>
                      <div className="text-[11px] text-[var(--anchor-gray)]">
                        {it.pizza_box ? "Offered a box, but no series" : "Not offered as a box"}
                      </div>
                    </div>
                    <div className="min-w-0 flex-1 sm:w-36 sm:flex-none">
                      <Select
                        value={setupKit[it.id] ?? it.packaging_kit ?? seriesFromName(it.name) ?? ""}
                        onChange={(ev) => setSetupKit((prev) => ({ ...prev, [it.id]: ev.target.value }))}
                        aria-label={`Series for ${it.name}`}
                      >
                        <option value="">Series…</option>
                        {PIZZA_BOX_KITS.map((k) => (
                          <option key={k.key} value={k.key}>
                            {k.label}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <Button variant="secondary" className="shrink-0" onClick={() => setUpBox(it)} disabled={disabled}>
                      Make it a box
                    </Button>
                  </div>
                ))}
              </div>
            </Section>
          )}

          <Section
            title="Box scans"
            hint="Each pass of the box scanner — who took how many boxes, and what they pulled back out."
          >
            {scans.length === 0 ? (
              <p className="text-sm text-[var(--anchor-gray)]">No boxes scanned out yet.</p>
            ) : (
              <div className="grid gap-2">
                {scans.slice(0, scanLimit).map((s) => {
                  const pulled = (s.lines || []).filter((l) => l.removed > 0);
                  const short = (s.lines || []).filter((l) => l.short > 0);
                  return (
                    <div key={s.id} className="rounded-xl border border-[var(--border-default)] p-3">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="text-sm text-[var(--anchor-deep)]">
                          <strong>
                            {s.box_count} box{s.box_count === 1 ? "" : "es"}
                          </strong>{" "}
                          · {s.scanned_by_name}
                        </p>
                        <span className="text-xs text-[var(--anchor-gray)]">{fmtDateTime(s.created_at)}</span>
                      </div>
                      <p className="mt-0.5 text-xs text-[var(--anchor-gray)]">
                        {(s.boxes || []).map((b) => `${b.count} × ${b.name}`).join(" · ")}
                      </p>
                      {pulled.length > 0 && (
                        <p className="mt-0.5 text-xs text-amber-700">
                          Pulled out: {pulled.map((l) => `${l.removed} × ${l.name}`).join(", ")}
                        </p>
                      )}
                      {short.length > 0 && (
                        <p className="mt-0.5 text-xs font-semibold text-red-700">
                          Recount: {short.map((l) => `${l.name} (short ${l.short})`).join(", ")}
                        </p>
                      )}
                    </div>
                  );
                })}
                {scans.length > scanLimit && (
                  <Button variant="secondary" onClick={() => setScanLimit((n) => n + SCAN_PAGE)}>
                    Show more of {scans.length}
                  </Button>
                )}
              </div>
            )}
          </Section>
        </div>

        <div className="grid min-w-0 gap-3">
          <Section
            title="What's in a box"
            hint="The anchor is whichever sample is on the label. Choose the item that fills each piece for each series — pieces save as you pick them."
          >
            <div className="grid gap-3">
              {slotKits.map((k) => (
                <div key={k.key} className="rounded-xl border border-[var(--border-default)] p-3">
                  <div className="text-xs font-bold uppercase tracking-wide text-[var(--anchor-deep)]">
                    {k.label} box
                  </div>
                  <div className="mt-2 grid gap-1.5">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="w-24 shrink-0 text-xs text-[var(--anchor-gray)]">Anchor</span>
                      <span className="min-w-0 flex-1 truncate text-xs text-[var(--anchor-deep)]">
                        The sample on the label
                      </span>
                    </div>
                    {PIZZA_BOX_COMPONENTS.map((c) => {
                      const current = findKitPiece(items, k.key, c.key);
                      return (
                        <label key={c.key} className="flex min-w-0 items-center gap-2">
                          <span className="w-24 shrink-0 text-xs text-[var(--anchor-gray)]">{c.short}</span>
                          <div className="min-w-0 flex-1">
                            <Select
                              value={current?.id || ""}
                              onChange={(ev) => assignSlot(k.key, c.key, ev.target.value)}
                              disabled={disabled}
                              aria-label={`${k.label} ${c.label}`}
                            >
                              <option value="">— Not in this box —</option>
                              {slotChoices(k.key, c.key).map((it) => (
                                <option key={it.id} value={it.id}>
                                  {it.name}
                                </option>
                              ))}
                            </Select>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            <h3 className="mt-4 text-xs font-bold uppercase tracking-wide text-[var(--anchor-deep)]">
              Printables — the same in every box
            </h3>
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
                  {/* The width lives on a wrapper: .ds-input is width:100% in
                      globals.css and beats a w-16 on the field itself, which
                      let the number box take the row and crush the picker. */}
                  <div className="w-16 shrink-0">
                    <Input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      max={MAX_EXTRA_PER_BOX}
                      className="text-center"
                      value={String(e.quantity)}
                      onChange={(ev) =>
                        setExtra(i, {
                          quantity: Math.max(1, Math.min(MAX_EXTRA_PER_BOX, Math.floor(Number(ev.target.value)) || 1)),
                        })
                      }
                      aria-label="How many per box"
                    />
                  </div>
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
              {/* Always a dropdown to start from, never a "nothing yet" line. */}
              {extras.length === 0 && (
                <Select
                  value=""
                  onChange={(ev) => {
                    if (!ev.target.value) return;
                    setSaved(false);
                    setExtras([{ item_id: ev.target.value, quantity: 1 }]);
                  }}
                  aria-label="Printable in every box"
                >
                  <option value="">Choose a printable…</option>
                  {extraChoices.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
              )}
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button variant="secondary" onClick={addExtra} disabled={extras.length >= extraChoices.length}>
                + Add a printable
              </Button>
              <Button onClick={saveExtras} disabled={disabled || !dirty}>
                Save
              </Button>
              {saved && !dirty && <span className="text-xs font-semibold text-green-700">Saved</span>}
              {dirty && <span className="text-xs text-amber-700">Not saved yet</span>}
            </div>

          </Section>

          {kitsCard}
        </div>
      </div>
    </div>
  );
}
