"use client";

import { useEffect, useMemo, useState } from "react";
import Button from "@/app/components/ui/Button";
import { Card } from "@/app/components/ui/Card";
import { Alert } from "@/app/components/ui/Alert";
import { Input, Select, Textarea } from "@/app/components/ui/Field";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { useEffectiveRole } from "@/lib/role/viewAs";
import { trackEvent } from "@/lib/analytics/track";
import { PRODUCT_OF_MONTH_KEY, parseProductOfMonth } from "@/lib/settings/productOfMonth";
import { MARKETING_CATEGORIES } from "@/lib/marketingOrders";
import {
  boxParts,
  boxChoiceIsEmpty,
  boxPresetRemoval,
  describeBoxChoice,
  findReadyBox,
  inventoryCategoryLabel,
  isBoxType,
  isSwapAnchor,
  isOverlayPool,
  overlayUnits,
  packagingKitLabel,
  packagingOptions,
  type BoxPart,
  type OrderPackaging,
} from "@/lib/inventory";
import type { BoxExtra } from "@/lib/settings/pizzaBoxExtras";
import { US_STATES } from "@/lib/sales/states";
import AddressAutocomplete from "@/app/components/ui/AddressAutocomplete";

type UserProfile = {
  full_name: string | null;
  company: string | null;
  phone: string | null;
  email: string | null;
};

type InvItem = {
  id: string;
  name: string;
  category: string | null;
  quantity_available: number;
  image_url?: string | null;
  // Whether this sample can be ordered with a plastic overlay alongside it.
  plastic_overlay?: boolean;
  // Whether this anchor is offered as a pizza box — with its series set, it can
  // ship as one.
  pizza_box?: boolean;
  // Set on an assembled-box item: the anchor it counts ready boxes of. Those
  // are ordered through their anchor's "Pizza box" choice, not picked alone.
  box_of?: string | null;
  // Set on an item that IS one of a kit's packaging pieces — the overlay is
  // orderable on its own.
  packaging_role?: string | null;
  // Which anchor series' kit this item belongs to (a piece), or draws its box
  // and overlay from (a sample).
  packaging_kit?: string | null;
  // Belongs to the current Product of the Month.
  product_of_month?: boolean;
};

// A pseudo-category for the picker only. Selecting it surfaces flagged items
// from every real category at once; it is never submitted as the order's
// category, because a flagged printable still has to route to the Printables
// contact. See submittedCategories below.
const POTM_KEY = "__product_of_month__";

// Order the catalog's category groups in the picker; unknown keys sort last.
// "tradeshow" is here for completeness only — it isn't orderable, so its items
// never reach this grid.
const CATEGORY_ORDER = ["swag", "brochures", "samples", "tradeshow", "other"];

// Quantities aren't capped at stock on hand — asking for more than we have is a
// legitimate request, which inside sales fills by having more made. This ceiling
// is only a fat-finger guard.
const MAX_QTY_PER_ITEM = 100000;

const PACKAGING_LABELS: Record<OrderPackaging, string> = {
  box: "🍕 Pizza box",
  overlay: "+ Plastic overlay",
  none: "Anchor only",
};

// The quick choices on a boxed sample, as what each takes out of the box. The
// overlay choice only exists when that series' box has an overlay in it.
function boxPresets(parts: BoxPart[]): { key: string; label: string; remove: string[] }[] {
  return [
    { key: "full", label: "Full pizza box", remove: [] },
    ...(parts.some((p) => p.role === "overlay")
      ? [{ key: "overlay", label: "Anchor + overlay", remove: boxPresetRemoval(parts, "overlay") }]
      : []),
    { key: "anchor", label: "Anchor only", remove: boxPresetRemoval(parts, "anchor") },
  ];
}

// What goes in a box in place of its own anchor: an inventory anchor (item_id),
// or a custom one described in words (custom, with item_id "").
type AnchorSwap = { item_id: string; custom: string };
const CUSTOM_SWAP = "__custom__";

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((x) => b.includes(x));
}

// A numbered section heading. The form is three decisions — what type, which
// items, where it goes — and saying so beats one undifferentiated column of
// fields where a rep can't tell how much is left.
function StepHeader({ n, title, hint }: { n: number; title: string; hint?: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--anchor-green)] text-xs font-bold text-white">
        {n}
      </span>
      <div className="min-w-0">
        <h2 className="text-base font-bold leading-tight text-black">{title}</h2>
        {hint && <p className="mt-0.5 text-xs text-[var(--anchor-gray)]">{hint}</p>}
      </div>
    </div>
  );
}

export default function MarketingOrderForm({ onSubmitted }: { onSubmitted?: () => void } = {}) {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const { t } = useTranslation();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [actualRole, setActualRole] = useState<string>("");
  // View-As aware, so an admin previewing as an inside rep sees what they see.
  const effectiveRole = useEffectiveRole(actualRole);
  const canCheckOutTradeshow = effectiveRole === "anchor_rep";
  const [submittedByExpanded, setSubmittedByExpanded] = useState(false);
  const [categories, setCategories] = useState<string[]>([]);
  // Display name for the Product of the Month chip; null = generic label.
  const [potmLabel, setPotmLabel] = useState<string | null>(null);

  // Inventory picker state.
  const [inventory, setInventory] = useState<InvItem[]>([]);
  const [invLoading, setInvLoading] = useState(true);
  const [invError, setInvError] = useState<string | null>(null);
  const [itemSearch, setItemSearch] = useState("");
  const [selected, setSelected] = useState<Record<string, number>>({});
  // How each picked sample ships: as a pizza box, with a plastic overlay, or on
  // its own — absent until the rep answers. Absent is deliberately NOT the same
  // as "on its own": a rep has to say, so a bare sample is a decision rather
  // than a question nobody noticed. Only asked of a sample that offers a box or
  // an overlay. An overlay is one per unit, off the same stock as ordering
  // overlays on their own.
  const [packaging, setPackaging] = useState<Record<string, OrderPackaging>>({});
  // The printables every pizza box gets, so a box reads the same here as on its
  // label and at the scanner.
  const [boxExtras, setBoxExtras] = useState<BoxExtra[]>([]);
  // Every boxed anchor ships in its pizza box. Per picked item: what the rep
  // took out of the box (item ids), whether its contents list is open, and a
  // note — present, even empty, once "Add a note" is tapped.
  const [boxRemove, setBoxRemove] = useState<Record<string, string[]>>({});
  const [openContents, setOpenContents] = useState<Record<string, boolean>>({});
  // Keyed by the boxed anchor. Only read while that anchor is taken out.
  const [boxSwap, setBoxSwap] = useState<Record<string, AnchorSwap>>({});
  const [itemNotes, setItemNotes] = useState<Record<string, string>>({});
  const [otherRequest, setOtherRequest] = useState("");

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
        .select("full_name,company,phone,email,role")
        .eq("id", user.id)
        .maybeSingle();
      if (!alive) return;
      setActualRole(String((prof as { role?: string } | null)?.role || ""));
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

  // Load the inventory catalog the rep picks from. Outside reps have read
  // access to /api/inventory, so this works for every marketing-order role.
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/inventory", { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (!alive) return;
        if (!res.ok) {
          setInvError(json?.error || "Couldn't load the catalog.");
        } else {
          setInventory(json?.items || []);
          setBoxExtras(json?.box_extras || []);
        }
      } catch (e: any) {
        if (alive) setInvError(e?.message || "Couldn't load the catalog.");
      } finally {
        if (alive) setInvLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Name the Product of the Month chip after whatever the Resource Library pill
  // is set to, so there's one place to change it each month. Any failure just
  // leaves the chip reading "Product of the Month".
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("value")
        .eq("key", PRODUCT_OF_MONTH_KEY)
        .maybeSingle();
      const setting = parseProductOfMonth((data as { value?: unknown } | null)?.value);
      if (!alive || !setting) return;
      if (setting.kind === "group") {
        setPotmLabel(setting.group);
        return;
      }
      const { data: prod } = await supabase
        .from("products")
        .select("name")
        .eq("id", setting.productId)
        .maybeSingle();
      if (alive) setPotmLabel((prod as { name?: string } | null)?.name || null);
    })();
    return () => {
      alive = false;
    };
  }, [supabase]);

  function toggleCategory(key: string) {
    if (!categories.includes(key)) {
      setCategories((prev) => [...prev, key]);
      return;
    }

    // Deselecting a type drops its picked items so the order stays consistent
    // with the collateral types chosen above (which now filter the grid). An
    // item can be visible through more than one chip — a flagged printable shows
    // under both Printables and Product of the Month — so drop it only once
    // nothing still selected would show it.
    const remaining = categories.filter((k) => k !== key);
    const stillVisible = (id: string) => {
      const it = inventory.find((x) => x.id === id);
      if (!it) return false;
      if (remaining.includes(it.category || "other")) return true;
      return remaining.includes(POTM_KEY) && !!it.product_of_month;
    };

    setCategories(remaining);
    setSelected((sel) => {
      const next = { ...sel };
      for (const id of Object.keys(next)) if (!stillVisible(id)) delete next[id];
      return next;
    });
    setPackaging((prev) => {
      const next = { ...prev };
      for (const id of Object.keys(next)) if (!stillVisible(id)) delete next[id];
      return next;
    });
    const keepVisible = <T,>(prev: Record<string, T>) =>
      Object.fromEntries(Object.entries(prev).filter(([id]) => stillVisible(id)));
    setBoxRemove(keepVisible);
    setBoxSwap(keepVisible);
    setOpenContents(keepVisible);
    setItemNotes(keepVisible);
  }

  // The anchor going in a box in place of its own, when its own is taken out —
  // with the name the order line uses. null: nothing replaces it.
  function swapFor(id: string): { item_id: string; custom: string; name: string } | null {
    if (!(boxRemove[id] || []).includes(id)) return null;
    const sw = boxSwap[id];
    if (!sw) return null;
    if (sw.item_id) {
      const it = inventory.find((x) => x.id === sw.item_id);
      return it ? { item_id: it.id, custom: "", name: it.name } : null;
    }
    const text = sw.custom.trim();
    return text ? { item_id: "", custom: text, name: `${text} (custom anchor)` } : null;
  }

  // Loose anchors that can go in a box in place of its own, by name.
  function swapChoices(boxAnchorId: string): InvItem[] {
    return inventory
      .filter((x) => isSwapAnchor(x, boxAnchorId))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  // Take one item out of (or put it back into) a boxed sample's pizza box.
  function toggleBoxPart(id: string, partId: string) {
    setBoxRemove((prev) => {
      const cur = prev[id] || [];
      return { ...prev, [id]: cur.includes(partId) ? cur.filter((x) => x !== partId) : [...cur, partId] };
    });
  }

  function setQty(id: string, qty: number) {
    const clamped = Math.max(0, Math.min(Math.floor(qty) || 0, MAX_QTY_PER_ITEM));
    setSelected((prev) => {
      const next = { ...prev };
      if (clamped <= 0) delete next[id];
      else next[id] = clamped;
      return next;
    });
    // Removing an item takes its packaging answer with it, so a stale choice
    // can't ride along on the next order.
    if (clamped <= 0) {
      setPackaging((prev) => {
        if (!prev[id]) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
      const drop = <T,>(prev: Record<string, T>) => {
        if (!(id in prev)) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      };
      setBoxRemove(drop);
      setOpenContents(drop);
      setItemNotes(drop);
    }
  }

  function setPackagingChoice(id: string, choice: OrderPackaging) {
    setPackaging((prev) => ({ ...prev, [id]: choice }));
  }

  // Show only items in the collateral types selected above, then apply the
  // search box, then group by category in the configured order.
  const groupedItems = useMemo(() => {
    const q = itemSearch.trim().toLowerCase();
    const active = new Set(categories);
    const wantPotm = active.has(POTM_KEY);
    let list = inventory.filter(
      (it) =>
        !it.box_of && (active.has(it.category || "other") || (wantPotm && !!it.product_of_month))
    );
    if (q) list = list.filter((it) => it.name.toLowerCase().includes(q));
    const groups: Record<string, InvItem[]> = {};
    for (const it of list) {
      const key = it.category || "other";
      (groups[key] ||= []).push(it);
    }
    return Object.entries(groups).sort((a, b) => {
      const ia = CATEGORY_ORDER.indexOf(a[0]);
      const ib = CATEGORY_ORDER.indexOf(b[0]);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
  }, [inventory, itemSearch, categories]);

  const selectedEntries = Object.entries(selected);
  const totalUnits = selectedEntries.reduce((sum, [, q]) => sum + q, 0);

  // What the order is actually filed under. Product of the Month is a picker
  // filter, not a real category, so it never ships: instead every picked item
  // contributes its own category, which is what routes each one to the right
  // marketing contact. Falls back to "other" when someone selects only the
  // Product of the Month chip and just writes a free-text request.
  const submittedCategories = useMemo(() => {
    const out = new Set(categories.filter((k) => k !== POTM_KEY));
    for (const [id] of selectedEntries) {
      const it = inventory.find((x) => x.id === id);
      if (it) out.add(it.category || "other");
    }
    if (out.size === 0) out.add("other");
    return Array.from(out);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categories, selected, inventory]);

  // Each series has its own overlay item, and that count is what BOTH the paired
  // overlays and a standalone overlay order for that series draw down. Keyed by
  // kit so the shortfall warning names the right one.
  const overlayPools = useMemo(
    () => inventory.filter(isOverlayPool).filter((it) => !!it.packaging_kit),
    [inventory]
  );

  // Picked samples with a packaging choice nobody has made yet. The order can't
  // be submitted while any remain.
  const unanswered = useMemo(
    () =>
      selectedEntries
        .filter(([id]) => {
          const it = inventory.find((x) => x.id === id);
          // A boxed anchor never asks: it ships in its box unless told otherwise.
          return !!it && !isBoxType(it) && packagingOptions(it).length > 0 && !packaging[id];
        })
        .map(([id]) => inventory.find((x) => x.id === id)?.name || "an item"),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected, packaging, inventory]
  );

  // Every boxed anchor, built the way its label and the scanner build it: what's
  // in the box, how many are assembled and ready, and any loose anchors.
  const boxInfo = useMemo(() => {
    const out = new Map<string, { parts: BoxPart[]; ready: number; loose: number }>();
    for (const it of inventory) {
      if (!isBoxType(it)) continue;
      out.set(it.id, {
        parts: boxParts(it, inventory, boxExtras),
        ready: findReadyBox(inventory, it.id)?.quantity_available ?? 0,
        loose: it.quantity_available,
      });
    }
    return out;
  }, [inventory, boxExtras]);

  // Boxed anchors on the order: what's on the shelf to send each from (boxes
  // plus loose anchors), and whether it still goes out in a box at all.
  const pizzaBoxLines = selectedEntries
    .filter(([id]) => boxInfo.has(id))
    .map(([id, quantity]) => {
      const b = boxInfo.get(id)!;
      const removed = boxRemove[id] || [];
      return {
        id,
        quantity,
        name: inventory.find((x) => x.id === id)?.name || "item",
        onHand: b.ready + b.loose,
        inBox: !b.parts.some((p) => p.role === "pizza_box" && removed.includes(p.item_id)),
      };
    });
  const pizzaBoxes = pizzaBoxLines.filter((l) => l.inBox).reduce((n, l) => n + l.quantity, 0);

  // Overlays this order needs, split by where they came from. Computed with the
  // same helper the API uses, so the preview can't disagree with what's recorded.
  const overlays = useMemo(
    () =>
      overlayUnits(
        selectedEntries.map(([id, quantity]) => {
          const it = inventory.find((x) => x.id === id);
          return {
            quantity,
            offersOverlay: !!it?.plastic_overlay,
            isOverlayPool: isOverlayPool(it),
            kit: it?.packaging_kit ?? null,
            wantsOverlay: packaging[id] === "overlay",
          };
        })
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected, packaging, inventory]
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (categories.length === 0) return setError("Pick at least one category.");
    if (selectedEntries.length === 0 && !otherRequest.trim()) {
      return setError("Add at least one item from the catalog, or describe what you need in the Other box.");
    }
    if (unanswered.length > 0) {
      return setError(`Choose how ${unanswered.join(", ")} should ship.`);
    }
    for (const [id] of selectedEntries) {
      const b = boxInfo.get(id);
      if (!b) continue;
      const name = inventory.find((x) => x.id === id)?.name || "a pizza box";
      const sw = boxSwap[id];
      if ((boxRemove[id] || []).includes(id) && sw && !sw.item_id && !sw.custom.trim()) {
        return setError(`Describe the custom anchor going in the ${name} box.`);
      }
      if (boxChoiceIsEmpty(b.parts, boxRemove[id] || [], !!swapFor(id))) {
        return setError(`Everything was taken out of the ${name} box — leave something in it, or remove the item.`);
      }
    }
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

    const requested_items = selectedEntries.map(([item_id, quantity]) => {
      const boxed = boxInfo.has(item_id);
      const choice = boxed ? "box" : packaging[item_id] || "none";
      return {
        item_id,
        quantity,
        packaging: choice,
        // What the rep took out of the pizza box.
        ...(boxed ? { remove: boxRemove[item_id] || [] } : {}),
        // What went in the box in place of its anchor, if anything.
        ...(boxed && swapFor(item_id)
          ? { swap_anchor: { item_id: swapFor(item_id)!.item_id, custom: swapFor(item_id)!.custom } }
          : {}),
        note: (itemNotes[item_id] || "").trim(),
        // Kept for an API that predates pizza boxes.
        plastic_overlay: choice === "overlay",
      };
    });

    setSubmitting(true);
    try {
      const res = await fetch("/api/marketing-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categories: submittedCategories,
          requested_items,
          other_request: otherRequest.trim(),
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

      trackEvent("marketing_order_submitted", { orderId: json?.id ?? null, categories: submittedCategories });
      setSuccess("Order submitted. The marketing team will be in touch.");
      setCategories([]);
      setSelected({});
      setPackaging({});
      setBoxRemove({});
      setBoxSwap({});
      setOpenContents({});
      setItemNotes({});
      setItemSearch("");
      setOtherRequest("");
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

  // What's still missing before this order can go. Shown as a short checklist in
  // the summary rather than surfacing one error at a time on submit — a rep
  // scrolled to the bottom of a long form shouldn't have to guess which field
  // sent them back up.
  const missing: string[] = [];
  if (categories.length === 0) missing.push("a collateral type");
  if (selectedEntries.length === 0 && !otherRequest.trim()) missing.push("at least one item");
  if (unanswered.length > 0) missing.push("how each sample ships");
  if (!neededBy) missing.push("a needed-by date");
  if (!shipName.trim()) missing.push("a recipient name");
  if (!shipStreet.trim() || !shipCity.trim() || !shipState.trim() || !shipZip.trim()) {
    missing.push("a complete ship-to address");
  }

  // The order as it stands: the running list, the overlay maths, what's left to
  // fill in, and the submit button. Rendered twice — a sticky rail beside the
  // form on a desktop, inline above the end of it on a phone — from one
  // definition, so the two can't drift.
  const summary = (
    <Card className="p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-bold text-black">Your order</h2>
        {selectedEntries.length > 0 && (
          <span className="text-xs text-[var(--anchor-gray)]">
            {selectedEntries.length} item{selectedEntries.length !== 1 ? "s" : ""} · {totalUnits} unit
            {totalUnits !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {selectedEntries.length === 0 && !otherRequest.trim() ? (
        <p className="mt-2 text-sm text-[var(--anchor-gray)]">
          Nothing added yet. Pick a type above, then add items.
        </p>
      ) : (
        <ul className="mt-2 grid gap-1.5 text-sm">
          {selectedEntries.map(([id, q]) => {
            const it = inventory.find((x) => x.id === id);
            const box = boxInfo.get(id);
            const choice = packaging[id];
            const paired = !box && choice === "overlay" && !!it?.plastic_overlay;
            const needsAnswer = !!it && !box && packagingOptions(it).length > 0 && !choice;
            const note = (itemNotes[id] || "").trim();
            return (
              <li key={id} className="flex items-start justify-between gap-2">
                <span className="min-w-0">
                  <span className="text-black">{it?.name || "item"}</span>
                  {paired && (
                    <span className="block text-[11px] text-[var(--anchor-gray)]">+ plastic overlay</span>
                  )}
                  {box && (
                    <span className="block text-[11px] text-[var(--anchor-gray)]">
                      🍕 {describeBoxChoice(box.parts, boxRemove[id] || [], swapFor(id)?.name)}
                    </span>
                  )}
                  {note && (
                    <span className="block text-[11px] italic text-[var(--anchor-gray)]">Note: {note}</span>
                  )}
                  {needsAnswer && (
                    <span className="block text-[11px] font-medium text-amber-700">
                      Choose how it ships
                    </span>
                  )}
                </span>
                <span className="shrink-0 font-semibold text-black">×{q}</span>
              </li>
            );
          })}
          {otherRequest.trim() && (
            <li className="text-[var(--anchor-gray)]">
              <span className="text-black">Other:</span> {otherRequest.trim()}
            </li>
          )}
        </ul>
      )}

      {/* Overlays come off one count per series however they were added, so show
          the total rather than leaving it to be added up. */}
      {overlays.total > 0 && (
        <div className="mt-3 border-t border-black/10 pt-2 text-xs text-[var(--anchor-gray)]">
          <span className="font-semibold text-[var(--anchor-deep)]">
            {overlays.total} plastic overlay{overlays.total !== 1 ? "s" : ""}
          </span>
          {overlays.paired > 0 && overlays.standalone > 0 && (
            <> — {overlays.paired} with samples, {overlays.standalone} on their own</>
          )}
          {/* Each series is short on its own. Naming which one beats a single
              total that hides a 3000 Series shortfall behind a healthy 2000
              Series count. */}
          {overlayPools.map((pool) => {
            const want = overlays.byKit[pool.packaging_kit || ""] || 0;
            if (want <= pool.quantity_available) return null;
            return (
              <span key={pool.id} className="mt-0.5 block font-medium text-amber-700">
                {packagingKitLabel(pool.packaging_kit)}: only {pool.quantity_available} in stock for{" "}
                {want} — the rest have to be ordered in.
              </span>
            );
          })}
        </div>
      )}

      {/* A pizza box is more than its anchor — say what goes out with them, and
          which ones the shelf can't make up in full. */}
      {pizzaBoxLines.length > 0 && (
        <div className="mt-3 border-t border-black/10 pt-2 text-xs text-[var(--anchor-gray)]">
          {pizzaBoxes > 0 && (
            <span className="font-semibold text-[var(--anchor-deep)]">
              🍕 {pizzaBoxes} pizza box{pizzaBoxes !== 1 ? "es" : ""}
            </span>
          )}
          {pizzaBoxLines
            .filter((l) => l.quantity > l.onHand)
            .map((l) => (
              <span key={l.id} className="mt-0.5 block font-medium text-amber-700">
                {l.name}: only {l.onHand} in stock — the rest have to be assembled or ordered in.
              </span>
            ))}
        </div>
      )}

      {missing.length > 0 && (
        <div className="mt-3 border-t border-black/10 pt-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--anchor-gray)]">
            Still needed
          </div>
          <ul className="mt-1 grid gap-0.5 text-xs text-[var(--anchor-gray)]">
            {missing.map((m) => (
              <li key={m}>• {m}</li>
            ))}
          </ul>
        </div>
      )}

      {error && (
        <div className="mt-3">
          <Alert tone="error">{error}</Alert>
        </div>
      )}
      {success && (
        <div className="mt-3">
          <Alert tone="success">{success}</Alert>
        </div>
      )}

      <Button
        type="submit"
        disabled={submitting || unanswered.length > 0}
        className="mt-3 w-full"
      >
        {submitting
          ? "Submitting…"
          : unanswered.length > 0
            ? "Choose how each sample ships"
            : "Submit order"}
      </Button>

      {profile && (
        <div className="mt-3 border-t border-black/10 pt-2">
          <button
            type="button"
            onClick={() => setSubmittedByExpanded((v) => !v)}
            aria-expanded={submittedByExpanded}
            className="flex w-full items-center justify-between gap-2 text-left"
          >
            <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--anchor-gray)]">
              {t("submittedBy")}
            </span>
            <span className="shrink-0 text-[11px] text-black/40">{submittedByExpanded ? "▴" : "▾"}</span>
          </button>
          <div className="mt-1 text-xs text-[var(--anchor-gray)]">
            {profile.full_name && <div className="font-medium text-black">{profile.full_name}</div>}
            {submittedByExpanded && (
              <>
                {profile.company && <div>{profile.company}</div>}
                {profile.phone && <div>{profile.phone}</div>}
                {profile.email && <div>{profile.email}</div>}
                <div className="mt-1 text-[11px] text-black/40">{t("yourContactInfo")}</div>
              </>
            )}
          </div>
        </div>
      )}
    </Card>
  );

  return (
    <form
      onSubmit={submit}
      className={`grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_19rem] ${
        // Clear the fixed running-total bar so it can't sit on top of Submit.
        selectedEntries.length > 0 ? "pb-20 lg:pb-0" : ""
      }`}
    >
      <div className="grid min-w-0 gap-4">
        {/* ── 1. Type ─────────────────────────────────────────────────────── */}
        <Card className="border-t-4 border-t-[var(--anchor-green)] p-4 sm:p-5">
          <StepHeader n={1} title="What do you need?" hint="Select every type this order includes." />
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {MARKETING_CATEGORIES.filter((cat) => cat.orderable).map((cat) => {
              const selectedCat = categories.includes(cat.key);
              return (
                <button
                  key={cat.key}
                  type="button"
                  onClick={() => toggleCategory(cat.key)}
                  aria-pressed={selectedCat}
                  title={cat.description}
                  className={
                    "rounded-[12px] border px-3 py-3 text-sm font-semibold transition " +
                    (selectedCat
                      ? "border-[var(--anchor-green)] bg-[var(--anchor-green)] text-white"
                      : "border-[var(--border-default)] bg-white text-[var(--anchor-deep)] hover:border-[var(--anchor-green)]")
                  }
                >
                  {cat.label}
                </button>
              );
            })}

            {/* Always shown, even with nothing flagged yet — an absent chip reads
                as a missing feature, where an empty list reads as "nothing
                tagged". */}
            <button
              type="button"
              onClick={() => toggleCategory(POTM_KEY)}
              aria-pressed={categories.includes(POTM_KEY)}
              title="Marketing materials for the product we're featuring this month."
              className={
                "col-span-2 rounded-[12px] border px-3 py-3 text-sm font-semibold transition " +
                (categories.includes(POTM_KEY)
                  ? "border-[var(--anchor-green)] bg-[var(--anchor-green)] text-white"
                  : "border-[var(--border-default)] bg-white text-[var(--anchor-deep)] hover:border-[var(--anchor-green)]")
              }
            >
              ★ Product of the Month{potmLabel ? ` — ${potmLabel}` : ""}
            </button>
          </div>

          {/* Tradeshow isn't a chip because it isn't an order: booth kit and
              banners go out on loan and come back, and an order would decrement
              them for good with nothing to book back in. Its absence read as a
              missing option, so inside reps — the ones who take gear to shows,
              and the only role the checkout API accepts — get pointed at where
              it actually lives instead. */}
          {canCheckOutTradeshow && (
            <p className="mt-3 text-xs text-[var(--anchor-gray)]">
              Taking gear to a show?{" "}
              <a
                href="/marketing-inventory?cat=tradeshow"
                className="font-semibold text-[var(--anchor-green)] underline"
              >
                Check out tradeshow items
              </a>{" "}
              — booth kit, displays and banners are borrowed and returned, not ordered.
            </p>
          )}
        </Card>

        {/* ── 2. Items ────────────────────────────────────────────────────── */}
        <Card className="p-4 sm:p-5">
          <StepHeader
            n={2}
            title="Choose items"
            hint="From the types you picked. Ask for more than we have in stock and we'll make them."
          />

          {invError && (
            <div className="mt-3">
              <Alert tone="error">{invError}</Alert>
            </div>
          )}

          {categories.includes("samples") && boxInfo.size > 0 && (
            <p className="mt-3 rounded-[12px] bg-[var(--surface-soft)] px-3 py-2 text-xs text-[var(--anchor-deep)]">
              🍕 <strong>Anchor samples ship in their pizza box</strong> — the anchor, its inserts, overlay and
              printables. Take anything out of the box, or ask for just the anchor, when you add one.
            </p>
          )}

          <div className="mt-3">
            <Input
              value={itemSearch}
              onChange={(e) => setItemSearch(e.target.value)}
              placeholder="Search items…"
            />
          </div>

          {/* The catalog scrolls with the page rather than inside a box of its
              own: a scroll area nested in a scrolling form is a trap on a phone,
              and the summary rail keeps the running order in view instead. */}
          <div className="mt-3 grid gap-5">
            {invLoading ? (
              <div className="text-sm text-[var(--anchor-gray)]">Loading catalog…</div>
            ) : categories.length === 0 ? (
              <div className="rounded-[12px] border border-dashed border-[var(--border-default)] p-6 text-center text-sm text-[var(--anchor-gray)]">
                Pick a type above to see items.
              </div>
            ) : groupedItems.length === 0 ? (
              <div className="rounded-[12px] border border-dashed border-[var(--border-default)] p-6 text-center text-sm text-[var(--anchor-gray)]">
                {itemSearch.trim()
                  ? `No items match “${itemSearch.trim()}”.`
                  : categories.includes(POTM_KEY) && categories.length === 1
                    ? "Nothing is tagged as Product of the Month yet."
                    : "No items in the selected type(s)."}
              </div>
            ) : (
              groupedItems.map(([catKey, list]) => (
                <div key={catKey}>
                  <div className="mb-2 flex items-baseline gap-2">
                    <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--anchor-gray)]">
                      {inventoryCategoryLabel(catKey)}
                    </h3>
                    <span className="text-[11px] text-[var(--anchor-gray)]">{list.length}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4">
                    {list.map((it) => {
                      const qty = selected[it.id] || 0;
                      // A boxed anchor ships in its pizza box, so its stock is
                      // its assembled boxes plus any loose anchors.
                      const box = boxInfo.get(it.id);
                      const avail = box ? box.ready + box.loose : it.quantity_available;
                      const out = avail <= 0;
                      const picked = qty > 0;
                      // Past what's on the shelf — still orderable, just made to
                      // order rather than pulled.
                      const overStock = qty > avail;
                      // Only a sample that isn't boxed asks how it ships;
                      // undefined until the rep answers.
                      const choice = packaging[it.id];
                      const options = box ? [] : packagingOptions(it);
                      const removed = boxRemove[it.id] || [];
                      // The presets are about what's around the anchor, so a
                      // swapped-out anchor stays swapped whichever is picked.
                      const anchorOut = removed.includes(it.id);
                      const aroundAnchor = removed.filter((x) => x !== it.id);
                      const swap = boxSwap[it.id] || { item_id: "", custom: "" };
                      const presets = box ? boxPresets(box.parts) : [];
                      const noteOpen = it.id in itemNotes;
                      return (
                        <div
                          key={it.id}
                          className={
                            "flex flex-col overflow-hidden rounded-[12px] border bg-white transition " +
                            (picked
                              ? "border-[var(--anchor-green)] ring-1 ring-[var(--anchor-green)]"
                              : "border-[var(--border-default)]")
                          }
                        >
                          {/* Product image (placeholder until photos are added). */}
                          <div className="relative aspect-square w-full bg-[var(--surface-soft)]">
                            {it.image_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={it.image_url} alt={it.name} className="h-full w-full object-cover" />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-[11px] text-[var(--anchor-gray)]">
                                No photo
                              </div>
                            )}
                            {picked && (
                              <span className="absolute right-1.5 top-1.5 rounded-full bg-[var(--anchor-green)] px-2 py-0.5 text-[11px] font-semibold text-white">
                                {qty}
                              </span>
                            )}
                            {/* Marks this month's items wherever they turn up,
                                including under their own category chip. */}
                            {it.product_of_month && (
                              <span
                                title="Product of the Month"
                                className="absolute left-1.5 top-1.5 rounded-full bg-[var(--anchor-green)] px-1.5 py-0.5 text-[11px] font-semibold text-white"
                              >
                                ★
                              </span>
                            )}
                          </div>

                          <div className="flex flex-1 flex-col gap-1.5 p-2.5">
                            <div className="text-sm font-medium leading-snug text-black line-clamp-2">
                              {it.name}
                            </div>
                            <div className="text-xs text-[var(--anchor-gray)]">
                              {out
                                ? "None in stock"
                                : box
                                  ? `🍕 ${box.ready} in pizza boxes${box.loose ? ` · ${box.loose} loose` : ""}`
                                  : `${avail} in stock`}
                            </div>
                            {isOverlayPool(it) && (
                              <div className="text-[11px] leading-snug text-[var(--anchor-gray)]">
                                Overlays on their own. Same stock as the ones added to a{" "}
                                {packagingKitLabel(it.packaging_kit) || "matching"} sample.
                              </div>
                            )}
                            {overStock && (
                              <div className="text-xs font-medium text-amber-700">
                                {qty - avail} more than in stock
                              </div>
                            )}

                            {/* How it ships: a whole pizza box (the anchor, its
                                series' pieces and the printables), with a plastic
                                overlay, or on its own. Every answer is explicit —
                                nothing is preselected, so no rep silently gets
                                none of them. */}
                            {picked && options.length > 0 && (
                              <div
                                className={
                                  "rounded-lg px-2 py-1.5 " +
                                  (choice
                                    ? "bg-[var(--surface-soft)]"
                                    : "border border-amber-300 bg-amber-50")
                                }
                              >
                                <div className="text-[11px] font-medium text-[var(--anchor-deep)]">
                                  How should {qty > 1 ? "these" : "it"} ship?
                                </div>
                                <div className="mt-1 grid gap-1">
                                  {options.map((key) => ({ key, label: PACKAGING_LABELS[key] })).map((opt) => {
                                    const on = choice === opt.key;
                                    return (
                                      <button
                                        key={opt.key}
                                        type="button"
                                        onClick={() => setPackagingChoice(it.id, opt.key)}
                                        aria-pressed={on}
                                        className={
                                          "rounded-md px-1.5 py-1 text-[11px] font-semibold transition " +
                                          (on
                                            ? "bg-[var(--anchor-green)] text-white"
                                            : "border border-[var(--border-default)] bg-white text-[var(--anchor-deep)] hover:border-[var(--anchor-green)]")
                                        }
                                      >
                                        {opt.label}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {/* A boxed anchor ships in its pizza box by default.
                                The quick choices cover what reps ask for most; the
                                contents list takes out any single thing. */}
                            {picked && box && (
                              <div className="rounded-lg bg-[var(--surface-soft)] px-2 py-1.5">
                                <div className="text-[11px] font-semibold text-[var(--anchor-deep)]">
                                  🍕 Ships in a pizza box
                                </div>
                                <div className="mt-1 grid gap-1">
                                  {presets.map((preset) => {
                                    const on = sameSet(aroundAnchor, preset.remove);
                                    return (
                                      <button
                                        key={preset.key}
                                        type="button"
                                        onClick={() =>
                                          setBoxRemove((prev) => ({
                                            ...prev,
                                            [it.id]: anchorOut ? [...preset.remove, it.id] : preset.remove,
                                          }))
                                        }
                                        aria-pressed={on}
                                        className={
                                          "rounded-md px-1.5 py-1 text-[11px] font-semibold transition " +
                                          (on
                                            ? "bg-[var(--anchor-green)] text-white"
                                            : "border border-[var(--border-default)] bg-white text-[var(--anchor-deep)] hover:border-[var(--anchor-green)]")
                                        }
                                      >
                                        {preset.label}
                                      </button>
                                    );
                                  })}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setOpenContents((prev) => ({ ...prev, [it.id]: !prev[it.id] }))}
                                  aria-expanded={!!openContents[it.id]}
                                  className="mt-1.5 text-[11px] font-semibold text-[var(--anchor-green)] underline"
                                >
                                  {openContents[it.id] ? "Done" : "Take items out or swap the anchor"}
                                </button>
                                {openContents[it.id] && (
                                  <div className="mt-1 grid gap-1">
                                    <label className="flex items-start gap-1.5 text-[11px] leading-snug text-[var(--anchor-deep)]">
                                      <input
                                        type="checkbox"
                                        checked={!anchorOut}
                                        onChange={() => toggleBoxPart(it.id, it.id)}
                                        className="mt-0.5"
                                      />
                                      <span>{it.name} (the anchor)</span>
                                    </label>
                                    {/* Taking the anchor out: send the box with
                                        nothing in its place, another anchor off
                                        the shelf, or one that's custom-ordered. */}
                                    {anchorOut && (
                                      <div className="ml-5 grid gap-1">
                                        <select
                                          value={boxSwap[it.id] ? swap.item_id || CUSTOM_SWAP : ""}
                                          onChange={(e) => {
                                            const v = e.target.value;
                                            setBoxSwap((prev) => {
                                              const next = { ...prev };
                                              if (!v) delete next[it.id];
                                              else if (v === CUSTOM_SWAP) next[it.id] = { item_id: "", custom: swap.custom };
                                              else next[it.id] = { item_id: v, custom: "" };
                                              return next;
                                            });
                                          }}
                                          aria-label={`What goes in the ${it.name} box instead`}
                                          className="w-full rounded-md border border-[var(--border-default)] bg-white px-1.5 py-1 text-[11px]"
                                        >
                                          <option value="">No anchor in its place</option>
                                          <option value={CUSTOM_SWAP}>A custom anchor (not in inventory)…</option>
                                          <optgroup label="Replace with a loose anchor">
                                            {swapChoices(it.id).map((a) => (
                                              <option key={a.id} value={a.id}>
                                                {a.name} ({a.quantity_available} loose)
                                              </option>
                                            ))}
                                          </optgroup>
                                        </select>
                                        {boxSwap[it.id] && !swap.item_id && (
                                          <input
                                            type="text"
                                            value={swap.custom}
                                            onChange={(e) =>
                                              setBoxSwap((prev) => ({
                                                ...prev,
                                                [it.id]: { item_id: "", custom: e.target.value },
                                              }))
                                            }
                                            placeholder="Describe the custom anchor…"
                                            maxLength={200}
                                            className="w-full rounded-md border border-[var(--border-default)] bg-white px-1.5 py-1 text-[11px]"
                                          />
                                        )}
                                      </div>
                                    )}
                                    {box.parts
                                      .filter((p) => p.kind !== "anchor")
                                      .map((p) => (
                                        <label
                                          key={p.item_id}
                                          className="flex items-start gap-1.5 text-[11px] leading-snug text-[var(--anchor-deep)]"
                                        >
                                          <input
                                            type="checkbox"
                                            checked={!removed.includes(p.item_id)}
                                            onChange={() => toggleBoxPart(it.id, p.item_id)}
                                            className="mt-0.5"
                                          />
                                          <span>
                                            {p.per_box > 1 ? `${p.per_box} × ` : ""}
                                            {p.name}
                                          </span>
                                        </label>
                                      ))}
                                  </div>
                                )}
                                <div className="mt-1 text-[10px] leading-snug text-[var(--anchor-gray)]">
                                  {describeBoxChoice(box.parts, removed, swapFor(it.id)?.name)}
                                </div>
                              </div>
                            )}

                            {/* A note on any item — what it's for, a color, a
                                deadline for just this piece. */}
                            {picked &&
                              (noteOpen ? (
                                <textarea
                                  value={itemNotes[it.id]}
                                  onChange={(e) => setItemNotes((prev) => ({ ...prev, [it.id]: e.target.value }))}
                                  placeholder="Notes for this item…"
                                  rows={2}
                                  maxLength={500}
                                  className="w-full rounded-md border border-[var(--border-default)] bg-white px-1.5 py-1 text-[11px]"
                                />
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setItemNotes((prev) => ({ ...prev, [it.id]: "" }))}
                                  className="self-start text-[11px] font-semibold text-[var(--anchor-green)] underline"
                                >
                                  + Add a note
                                </button>
                              ))}

                            <div className="mt-auto pt-1">
                              {qty === 0 ? (
                                <button
                                  type="button"
                                  onClick={() => setQty(it.id, 1)}
                                  className="w-full rounded-lg border border-[var(--anchor-green)] py-1.5 text-sm font-semibold text-[var(--anchor-green)] transition hover:bg-[var(--anchor-green)] hover:text-white"
                                >
                                  {out ? "Request" : "Add"}
                                </button>
                              ) : (
                                <div className="flex items-center justify-between gap-1.5">
                                  <button
                                    type="button"
                                    aria-label={`Remove one ${it.name}`}
                                    onClick={() => setQty(it.id, qty - 1)}
                                    className="h-8 w-8 shrink-0 rounded-lg border border-[var(--border-default)] text-lg leading-none text-[var(--anchor-deep)]"
                                  >
                                    −
                                  </button>
                                  <input
                                    type="number"
                                    min={0}
                                    max={MAX_QTY_PER_ITEM}
                                    inputMode="numeric"
                                    value={qty}
                                    onChange={(e) => setQty(it.id, Number(e.target.value))}
                                    className="h-8 w-full min-w-0 rounded-lg border border-[var(--border-default)] text-center text-sm"
                                  />
                                  <button
                                    type="button"
                                    aria-label={`Add one ${it.name}`}
                                    onClick={() => setQty(it.id, qty + 1)}
                                    className="h-8 w-8 shrink-0 rounded-lg border border-[var(--border-default)] text-lg leading-none text-[var(--anchor-deep)]"
                                  >
                                    +
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>

          <label className="mt-4 grid gap-1.5 text-sm">
            <span className="font-medium text-black">
              Other / not listed <span className="font-normal text-[var(--anchor-gray)]">(optional)</span>
            </span>
            <Textarea
              value={otherRequest}
              onChange={(e) => setOtherRequest(e.target.value)}
              placeholder="Need something that isn't in the catalog? Describe it here (e.g. a roof membrane sample, custom signage)…"
              rows={2}
            />
          </label>
        </Card>

        {/* ── 3. Delivery ─────────────────────────────────────────────────── */}
        <Card className="p-4 sm:p-5">
          <StepHeader n={3} title="Where it ships" hint="Orders go to the customer, not to you." />

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm">
              <span className="font-semibold">Needed by</span>
              <Input
                type="date"
                value={neededBy}
                onChange={(e) => setNeededBy(e.target.value)}
                className="h-11 px-3 text-sm"
              />
              <span className="text-xs text-[var(--anchor-gray)]">
                Have a deadline (e.g. a trade show)? Let the marketing team know.
              </span>
            </label>

            <label className="grid gap-1.5 text-sm">
              <span className="font-semibold">Recipient name</span>
              <Input
                value={shipName}
                onChange={(e) => setShipName(e.target.value)}
                className="h-11 px-3 text-sm"
                placeholder="Full name"
                autoComplete="name"
              />
            </label>

            <div className="grid gap-1.5 text-sm sm:col-span-2">
              <span className="font-semibold">Street address</span>
              {/* No current-location button: orders ship to a customer, not to
                  wherever the rep happens to be standing. */}
              <AddressAutocomplete
                value={shipStreet}
                onChange={setShipStreet}
                onSelect={(a) => {
                  setShipStreet(a.line1 || a.formatted);
                  if (a.city) setShipCity(a.city);
                  if (a.state) setShipState(a.state);
                  if (a.postalCode) setShipZip(a.postalCode);
                }}
                className="h-11 px-3 text-sm"
                placeholder="Street address"
              />
            </div>

            {/* City / State / ZIP read as one address line, so they sit on one. */}
            <div className="grid grid-cols-6 gap-3 sm:col-span-2">
              <label className="col-span-6 grid gap-1.5 text-sm sm:col-span-3">
                <span className="font-semibold">City</span>
                <Input
                  value={shipCity}
                  onChange={(e) => setShipCity(e.target.value)}
                  className="h-11 px-3 text-sm"
                  placeholder="City"
                  autoComplete="address-level2"
                />
              </label>
              <label className="col-span-2 grid gap-1.5 text-sm sm:col-span-1">
                <span className="font-semibold">State</span>
                <Select
                  value={shipState}
                  onChange={(e) => setShipState(e.target.value)}
                  className="h-11 px-2 text-sm"
                >
                  <option value="">—</option>
                  {US_STATES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="col-span-4 grid gap-1.5 text-sm sm:col-span-2">
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
            </div>

            <label className="grid gap-1.5 text-sm sm:col-span-2">
              <span className="font-medium text-black">
                Notes <span className="font-normal text-[var(--anchor-gray)]">(optional)</span>
              </span>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Deadline, event name, or anything else the marketing team should know..."
                rows={3}
              />
            </label>
          </div>
        </Card>

        {/* On a phone the summary is the last thing before you submit; on a
            desktop it's the rail on the right, which stays put while you shop. */}
        <div id="order-summary" className="lg:hidden">
          {summary}
        </div>
      </div>

      <div className="hidden lg:sticky lg:top-4 lg:block">{summary}</div>

      {/* Phone-only running total. Fixed, not sticky: as the last child of the
          form a sticky bar only pins once its own row is on screen, which is
          exactly when you no longer need it. Not a submit either — it takes you
          to the summary, so the last thing before sending is still the full
          order. */}
      {selectedEntries.length > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-30 px-4 pb-[calc(0.75rem+env(safe-area-inset-bottom))] lg:hidden">
          <button
            type="button"
            onClick={() =>
              document.getElementById("order-summary")?.scrollIntoView({ behavior: "smooth", block: "start" })
            }
            className="mx-auto flex w-full max-w-2xl items-center justify-between gap-3 rounded-[12px] border border-[var(--anchor-green)] bg-white/95 px-4 py-3 text-sm font-semibold text-[var(--anchor-deep)] shadow-lg backdrop-blur"
          >
            <span>
              {totalUnits} unit{totalUnits !== 1 ? "s" : ""} · {selectedEntries.length} item
              {selectedEntries.length !== 1 ? "s" : ""}
            </span>
            <span className="text-[var(--anchor-green)]">Review order ↓</span>
          </button>
        </div>
      )}
    </form>
  );
}
