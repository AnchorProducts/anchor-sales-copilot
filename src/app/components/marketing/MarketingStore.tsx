"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Alert } from "@/app/components/ui/Alert";
import { Input, Select, Textarea } from "@/app/components/ui/Field";
import Modal from "@/app/components/ui/Modal";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { trackEvent } from "@/lib/analytics/track";
import { PRODUCT_OF_MONTH_KEY, parseProductOfMonth } from "@/lib/settings/productOfMonth";
import { CUSTOMER_SAMPLE_CAP, isSampleAnchor } from "@/lib/marketingOrders";
import {
  boxChoiceIsEmpty,
  boxParts,
  boxPresetRemoval,
  describeBoxChoice,
  findReadyBox,
  isBoxType,
  isSwapAnchor,
  TRADESHOW_CATEGORY,
  type BoxPart,
} from "@/lib/inventory";
import type { BoxExtra } from "@/lib/settings/pizzaBoxExtras";
import {
  OEM_ARTWORK_MAX_BYTES,
  OEM_ARTWORK_MAX_FILES,
  OEM_ARTWORK_STATUSES,
  OEM_LIMITS,
  SAMPLE_BUILDS,
  normalizeOemSpec,
  oemSpecProblem,
  sampleBuildLabel,
  type MarketingOrderType,
  type OemArtworkFile,
  type OemArtworkStatus,
  type SampleBuild,
} from "@/lib/marketing/oemOrder";
import { Icon, Pill, SectionTitle, Segmented, Stepper, Surface, type IconName } from "@/app/components/ui/kit";
import {
  DeliveryFields,
  EMPTY_SHIP_TO,
  formatShipTo,
  shipToComplete,
  type ShipTo,
} from "./OrderFormParts";

// ─────────────────────────────────────────────────────────────────────────────
// The marketing store. A rep shops like any online store: pick what you need,
// add things to a cart, then check out and say where it ships.
//
// Samples ARE pizza boxes. The first time a rep opens them they say who the
// order is for — a customer (small, from stock, capped at CUSTOMER_SAMPLE_CAP)
// or an OEM / manufacturing partner (large, printed custom). Either way each
// sample can go as a fully built box, the anchor with its overlay, or just the
// anchor.
//
// One cart can place up to three things at checkout, because they are three
// different jobs downstream: an OEM order (printed to order), a customer order
// (picked from stock), and tradeshow loans (checked out and returned).
// ─────────────────────────────────────────────────────────────────────────────

type InvItem = {
  id: string;
  name: string;
  category: string | null;
  quantity_available: number;
  image_url?: string | null;
  plastic_overlay?: boolean;
  pizza_box?: boolean;
  box_of?: string | null;
  packaging_role?: string | null;
  packaging_kit?: string | null;
  product_of_month?: boolean;
};

type Section = "samples" | "swag" | "brochures" | "tradeshow" | "potm";

// What goes in a box in place of its own anchor: an inventory anchor (item_id),
// or a custom one described in words (custom, with item_id "").
type AnchorSwap = { item_id: string; custom: string };
const CUSTOM_SWAP = "__custom__";

type StockLine = {
  key: string;
  kind: "stock";
  item_id: string;
  quantity: number;
  // Samples only; null for swag and printables.
  build: SampleBuild | null;
  note: string;
  // A fully built box the rep customized at checkout: exactly what was taken
  // out (the anchor included) and what, if anything, replaces the anchor.
  remove: string[] | null;
  swap: AnchorSwap | null;
};
type OemCartLine = {
  key: string;
  kind: "oem";
  // "" for an anchor that isn't in the catalog; `model` names it.
  item_id: string;
  model: string;
  build: SampleBuild;
  quantity: number;
  imprint: string;
  print: string;
};
type LoanLine = { key: string; kind: "loan"; item_id: string; quantity: number };
type CartLine = StockLine | OemCartLine | LoanLine;

const MAX_QTY = 100000;

const SECTION_TILES: { key: Section; icon: IconName; label: string; hint: string }[] = [
  { key: "samples", icon: "box", label: "Pizza box", hint: "Samples" },
  { key: "swag", icon: "shirt", label: "Swag", hint: "Apparel & giveaways" },
  { key: "brochures", icon: "doc", label: "Printables", hint: "Spec sheets & literature" },
  { key: "tradeshow", icon: "display", label: "Tradeshow", hint: "Borrow & return" },
  { key: "potm", icon: "star", label: "Product of the Month", hint: "This month's feature" },
];

const MODE_COPY: Record<MarketingOrderType, { title: string; tag: string; body: string }> = {
  customer: {
    title: "Customer order",
    tag: `Up to ${CUSTOMER_SAMPLE_CAP} samples`,
    body: "Small orders for anyone who isn't a manufacturing partner. Ships from the samples we have on the shelf.",
  },
  oem: {
    title: "OEM order",
    tag: "Printed custom",
    body: "Large orders, or any order for a manufacturing partner. The box, inserts, overlay and printables are printed for them, and the anchors are printed separately.",
  },
};

function clampQty(n: number, max = MAX_QTY): number {
  return Math.max(0, Math.min(Math.floor(n) || 0, max));
}

function fileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export default function MarketingStore({
  canOrderOem,
  canBorrow,
  onSubmitted,
}: {
  // OEM orders and tradeshow loans are internal sales jobs.
  canOrderOem: boolean;
  canBorrow: boolean;
  onSubmitted?: (message: string) => void;
}) {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const fileInput = useRef<HTMLInputElement>(null);

  // Catalog
  const [inventory, setInventory] = useState<InvItem[]>([]);
  const [boxExtras, setBoxExtras] = useState<BoxExtra[]>([]);
  const [invLoading, setInvLoading] = useState(true);
  const [invError, setInvError] = useState<string | null>(null);
  const [potmLabel, setPotmLabel] = useState<string | null>(null);
  const [myName, setMyName] = useState("");

  // Shopping
  const [section, setSection] = useState<Section | null>(null);
  const [search, setSearch] = useState("");
  // Who the pizza boxes are for; asked the first time samples are opened.
  // Outside reps only ever place customer orders, so they're never asked.
  const [boxMode, setBoxMode] = useState<MarketingOrderType | null>(canOrderOem ? null : "customer");
  const [modePrompt, setModePrompt] = useState(false);
  // Per-card choices before "Add to cart".
  const [draftBuild, setDraftBuild] = useState<Record<string, SampleBuild>>({});
  const [draftQty, setDraftQty] = useState<Record<string, number>>({});
  const [flashKey, setFlashKey] = useState<string | null>(null);
  const [capNotice, setCapNotice] = useState(false);

  // Cart
  const [cart, setCart] = useState<CartLine[]>([]);
  const [otherOpen, setOtherOpen] = useState(false);
  const [otherRequest, setOtherRequest] = useState("");

  // Checkout
  const [view, setView] = useState<"shop" | "checkout">("shop");
  const [openCustomize, setOpenCustomize] = useState<Record<string, boolean>>({});
  const [neededBy, setNeededBy] = useState("");
  const [shipTo, setShipTo] = useState<ShipTo>(EMPTY_SHIP_TO);
  const [notes, setNotes] = useState("");
  // OEM partner + artwork
  const [company, setCompany] = useState("");
  const [project, setProject] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [artworkStatus, setArtworkStatus] = useState<OemArtworkStatus>("ready");
  const [artwork, setArtwork] = useState<OemArtworkFile[]>([]);
  const [uploads, setUploads] = useState<{ key: string; filename: string; error?: string }[]>([]);
  const [artworkLink, setArtworkLink] = useState("");
  const [proofRequired, setProofRequired] = useState(true);
  // Tradeshow loan
  const [eventName, setEventName] = useState("");
  const [dueBack, setDueBack] = useState("");

  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/inventory", { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (!alive) return;
        if (!res.ok) setInvError(json?.error || "Couldn't load the catalog.");
        else {
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

  // The rep's name, for who took tradeshow gear out.
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user) return;
      const { data: prof } = await supabase.from("profiles").select("full_name").eq("id", data.user.id).maybeSingle();
      if (alive) setMyName(String((prof as { full_name?: string } | null)?.full_name || data.user.email || ""));
    })();
    return () => {
      alive = false;
    };
  }, [supabase]);

  // Name the Product of the Month tile after the Resource Library setting, so
  // there's one place to change it each month.
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.from("app_settings").select("value").eq("key", PRODUCT_OF_MONTH_KEY).maybeSingle();
      const setting = parseProductOfMonth((data as { value?: unknown } | null)?.value);
      if (!alive || !setting) return;
      if (setting.kind === "group") return setPotmLabel(setting.group);
      const { data: prod } = await supabase.from("products").select("name").eq("id", setting.productId).maybeSingle();
      if (alive) setPotmLabel((prod as { name?: string } | null)?.name || null);
    })();
    return () => {
      alive = false;
    };
  }, [supabase]);

  const byId = useMemo(() => new Map(inventory.map((it) => [it.id, it])), [inventory]);

  // Every boxed anchor, built the way its label and the scanner build it.
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

  // Which builds a sample offers. Printed to order, an OEM sample can be built
  // any way; from stock, only what the shelf has the pieces for.
  function buildsFor(it: InvItem, mode: MarketingOrderType): SampleBuild[] {
    if (mode === "oem") return ["full", "overlay", "anchor"];
    const box = boxInfo.get(it.id);
    if (box) return ["full", ...(box.parts.some((p) => p.role === "overlay") ? (["overlay"] as const) : []), "anchor"];
    return it.plastic_overlay ? ["overlay", "anchor"] : ["anchor"];
  }

  // What's on the shelf for a sample built a given way.
  function onHand(it: InvItem, build: SampleBuild | null): number {
    const box = boxInfo.get(it.id);
    if (box && build === "full") return box.ready + box.loose;
    return it.quantity_available;
  }

  const stockLines = cart.filter((l): l is StockLine => l.kind === "stock");
  const oemLines = cart.filter((l): l is OemCartLine => l.kind === "oem");
  const loanLines = cart.filter((l): l is LoanLine => l.kind === "loan");
  const sampleLines = stockLines.filter((l) => {
    const it = byId.get(l.item_id);
    return !!it && isSampleAnchor(it);
  });
  const customerSamples = sampleLines.reduce((n, l) => n + l.quantity, 0);
  const cartUnits = cart.reduce((n, l) => n + l.quantity, 0);

  function inCart(itemId: string): number {
    return cart.filter((l) => l.item_id === itemId).reduce((n, l) => n + l.quantity, 0);
  }

  function flash(key: string) {
    setFlashKey(key);
    window.setTimeout(() => setFlashKey((k) => (k === key ? null : k)), 1400);
  }

  function addToCart(it: InvItem, kind: "stock" | "oem" | "loan", build: SampleBuild | null, qty: number) {
    if (qty <= 0) return;
    setCapNotice(false);
    if (kind === "stock" && isSampleAnchor(it) && customerSamples + qty > CUSTOMER_SAMPLE_CAP) {
      setCapNotice(true);
      return;
    }
    const key = kind === "loan" ? `l:${it.id}` : `${kind === "oem" ? "o" : "s"}:${it.id}:${build || "-"}`;
    setCart((prev) => {
      const hit = prev.find((l) => l.key === key);
      if (hit) {
        const max = kind === "loan" ? it.quantity_available : MAX_QTY;
        return prev.map((l) => (l.key === key ? { ...l, quantity: clampQty(l.quantity + qty, max) } : l));
      }
      if (kind === "oem") {
        return [...prev, { key, kind, item_id: it.id, model: it.name, build: build || "full", quantity: qty, imprint: "", print: "" }];
      }
      if (kind === "loan") return [...prev, { key, kind, item_id: it.id, quantity: Math.min(qty, it.quantity_available) }];
      return [...prev, { key, kind, item_id: it.id, quantity: qty, build, note: "", remove: null, swap: null }];
    });
    setDraftQty((prev) => ({ ...prev, [it.id]: 1 }));
    flash(it.id);
  }

  function addCustomOemAnchor() {
    const key = `o:custom-${Date.now()}`;
    setCart((prev) => [...prev, { key, kind: "oem", item_id: "", model: "", build: "full", quantity: 1, imprint: "", print: "" }]);
    flash("custom-oem");
  }

  function setLineQty(key: string, n: number) {
    setCapNotice(false);
    setCart((prev) => {
      const line = prev.find((l) => l.key === key);
      if (!line) return prev;
      const it = byId.get(line.item_id);
      let max = line.kind === "loan" && it ? it.quantity_available : MAX_QTY;
      if (line.kind === "stock" && it && isSampleAnchor(it)) {
        const others = prev
          .filter((l): l is StockLine => l.kind === "stock" && l.key !== key)
          .filter((l) => {
            const x = byId.get(l.item_id);
            return !!x && isSampleAnchor(x);
          })
          .reduce((s, l) => s + l.quantity, 0);
        max = Math.max(0, CUSTOMER_SAMPLE_CAP - others);
        if (n > max) setCapNotice(true);
      }
      const q = clampQty(n, max);
      if (q <= 0) return prev.filter((l) => l.key !== key);
      return prev.map((l) => (l.key === key ? { ...l, quantity: q } : l));
    });
  }

  function patchLine(key: string, patch: Partial<StockLine> | Partial<OemCartLine>) {
    setCart((prev) => prev.map((l) => (l.key === key ? ({ ...l, ...patch } as CartLine) : l)));
  }

  function removeLine(key: string) {
    setCart((prev) => prev.filter((l) => l.key !== key));
  }

  // Samples need a customer/OEM answer before they can be shopped.
  function openSection(s: Section) {
    setSection(s);
    setSearch("");
    setCapNotice(false);
    if (s === "samples" && !boxMode) setModePrompt(true);
  }

  // Switching who the boxes are for empties the other kind out of the cart —
  // a sample line is either stock or printed to order, never both.
  function chooseMode(mode: MarketingOrderType) {
    if (mode !== boxMode) {
      setCart((prev) =>
        prev.filter((l) => {
          if (mode === "customer") return l.kind !== "oem";
          const it = byId.get(l.item_id);
          return !(l.kind === "stock" && it && isSampleAnchor(it));
        })
      );
    }
    setBoxMode(mode);
    setModePrompt(false);
    setCapNotice(false);
  }

  const linesLostOnSwitch = boxMode === "oem" ? oemLines.length : boxMode === "customer" ? sampleLines.length : 0;

  // ── Catalog for the open section ──────────────────────────────────────────
  const visibleItems = useMemo(() => {
    if (!section) return [];
    const q = search.trim().toLowerCase();
    let list = inventory.filter((it) => {
      if (it.box_of) return false;
      if (section === "samples") return isSampleAnchor(it);
      if (section === "tradeshow") return it.category === TRADESHOW_CATEGORY;
      if (section === "potm") {
        return !!it.product_of_month && it.category !== TRADESHOW_CATEGORY && !it.packaging_role;
      }
      return (it.category || "other") === section;
    });
    if (q) list = list.filter((it) => it.name.toLowerCase().includes(q));
    return [...list].sort((a, b) => a.name.localeCompare(b.name));
  }, [inventory, section, search]);

  // ── Upload artwork straight to storage ────────────────────────────────────
  async function addFiles(list: FileList | null) {
    const files = Array.from(list || []);
    if (fileInput.current) fileInput.current.value = "";
    if (!files.length) return;
    setError(null);
    if (artwork.length + files.length > OEM_ARTWORK_MAX_FILES) {
      return setError(`Attach up to ${OEM_ARTWORK_MAX_FILES} files per order.`);
    }
    const tooBig = files.find((f) => f.size > OEM_ARTWORK_MAX_BYTES);
    if (tooBig) return setError(`${tooBig.name} is over 200 MB — share it as a link instead.`);

    const batch = files.map((f) => ({ key: `${f.name}-${f.size}-${Math.random()}`, file: f }));
    setUploads((prev) => [...prev, ...batch.map((b) => ({ key: b.key, filename: b.file.name }))]);
    const fail = (key: string, msg: string) =>
      setUploads((prev) => prev.map((u) => (u.key === key ? { ...u, error: msg } : u)));
    try {
      const res = await fetch("/api/marketing-orders/artwork", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ files: files.map((f) => ({ name: f.name, size: f.size, type: f.type })) }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        for (const b of batch) fail(b.key, json?.error || "Couldn't start the upload.");
        return;
      }
      const bucket = String(json?.bucket || "");
      const signed = (json?.uploads || []) as { path: string; token?: string; error?: string }[];
      await Promise.all(
        batch.map(async (b, i) => {
          const s = signed[i];
          if (!s?.token) return fail(b.key, s?.error || "Couldn't start the upload.");
          const contentType = b.file.type || "application/octet-stream";
          const { error: upErr } = await supabase.storage
            .from(bucket)
            .uploadToSignedUrl(s.path, s.token, b.file, { contentType });
          if (upErr) return fail(b.key, upErr.message);
          setArtwork((prev) => [...prev, { path: s.path, filename: b.file.name, size: b.file.size, content_type: contentType }]);
          setUploads((prev) => prev.filter((u) => u.key !== b.key));
        })
      );
    } catch (e: any) {
      for (const b of batch) fail(b.key, e?.message || "Upload failed.");
    }
  }

  // ── Checkout ──────────────────────────────────────────────────────────────
  const needsShipping = stockLines.length > 0 || oemLines.length > 0 || !!otherRequest.trim();
  const uploading = uploads.some((u) => !u.error);

  const oemSpec = normalizeOemSpec({
    company,
    project,
    contact_name: contactName,
    contact_email: contactEmail,
    contact_phone: contactPhone,
    lines: oemLines.map((l) => ({
      item_id: l.item_id,
      model: l.model,
      build: l.build,
      quantity: l.quantity,
      imprint: l.imprint,
      print: l.print,
    })),
    artwork_status: artworkStatus,
    artwork_link: artworkLink,
    artwork,
    proof_required: proofRequired,
  });

  // The anchor going in a customized box in place of its own, with the name the
  // order line uses. null: nothing replaces it.
  function swapFor(l: StockLine): { item_id: string; custom: string; name: string } | null {
    if (!l.remove?.includes(l.item_id) || !l.swap) return null;
    if (l.swap.item_id) {
      const it = byId.get(l.swap.item_id);
      return it ? { item_id: it.id, custom: "", name: it.name } : null;
    }
    const text = l.swap.custom.trim();
    return text ? { item_id: "", custom: text, name: `${text} (custom anchor)` } : null;
  }

  // What's taken out of a customer box line: the rep's own edit, or the build.
  function removalFor(l: StockLine): string[] {
    const box = boxInfo.get(l.item_id);
    if (!box) return [];
    if (l.remove) return l.remove;
    return l.build === "full" || !l.build ? [] : boxPresetRemoval(box.parts, l.build);
  }

  const missing: string[] = [];
  if (oemLines.length) {
    if (!company.trim()) missing.push("the OEM partner");
    if (oemLines.some((l) => !l.model.trim())) missing.push("a name for each custom anchor");
    if (artworkStatus === "ready" && !artwork.length && !artworkLink.trim()) missing.push("the artwork");
  }
  if (loanLines.length && !eventName.trim()) missing.push("the tradeshow event");
  if (needsShipping) {
    if (!neededBy) missing.push("a needed-by date");
    if (!shipToComplete(shipTo)) missing.push("a complete ship-to address");
  }

  async function placeOrder() {
    setError(null);
    if (uploading) return setError("Wait for the artwork to finish uploading.");
    if (oemLines.some((l) => !l.model.trim())) return setError("Name each custom anchor in the OEM order.");
    if (oemLines.length) {
      const problem = oemSpecProblem(oemSpec);
      if (problem) return setError(problem);
    }
    for (const l of stockLines) {
      const box = boxInfo.get(l.item_id);
      if (!box || !l.remove) continue;
      const name = byId.get(l.item_id)?.name || "a pizza box";
      if (l.remove.includes(l.item_id) && l.swap && !l.swap.item_id && !l.swap.custom.trim()) {
        return setError(`Describe the custom anchor going in the ${name} box.`);
      }
      if (boxChoiceIsEmpty(box.parts, l.remove, !!swapFor(l))) {
        return setError(`Everything was taken out of the ${name} box — leave something in it.`);
      }
    }
    if (loanLines.length && !eventName.trim()) return setError("Name the tradeshow the gear is going to.");
    if (needsShipping) {
      if (!neededBy) return setError("A needed-by date is required.");
      if (!shipToComplete(shipTo)) return setError("A complete ship-to address is required.");
    }

    setPlacing(true);
    const placed: string[] = [];
    const post = async (url: string, body: unknown) => {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || "Something went wrong.");
      return json;
    };
    const ship_to = needsShipping ? formatShipTo(shipTo) : "";

    try {
      if (oemLines.length) {
        const json = await post("/api/marketing-orders", {
          order_type: "oem",
          oem_spec: oemSpec,
          needed_by: neededBy,
          ship_to,
          notes: notes.trim(),
        });
        trackEvent("marketing_order_submitted", { orderId: json?.id ?? null, orderType: "oem" });
        placed.push("OEM order");
        setCart((prev) => prev.filter((l) => l.kind !== "oem"));
      }

      if (stockLines.length || otherRequest.trim()) {
        const categories = new Set<string>();
        for (const l of stockLines) categories.add(byId.get(l.item_id)?.category || "other");
        if (!categories.size) categories.add("other");
        const requested_items = stockLines.map((l) => {
          const box = boxInfo.get(l.item_id);
          if (box) {
            const sw = swapFor(l);
            return {
              item_id: l.item_id,
              quantity: l.quantity,
              packaging: "box",
              remove: removalFor(l),
              ...(sw ? { swap_anchor: { item_id: sw.item_id, custom: sw.custom } } : {}),
              note: l.note.trim(),
              plastic_overlay: false,
            };
          }
          const packaging = l.build === "overlay" ? "overlay" : "none";
          return {
            item_id: l.item_id,
            quantity: l.quantity,
            packaging,
            note: l.note.trim(),
            plastic_overlay: packaging === "overlay",
          };
        });
        const json = await post("/api/marketing-orders", {
          order_type: "customer",
          categories: Array.from(categories),
          requested_items,
          other_request: otherRequest.trim(),
          needed_by: neededBy,
          ship_to,
          notes: notes.trim(),
        });
        trackEvent("marketing_order_submitted", { orderId: json?.id ?? null, orderType: "customer" });
        placed.push("customer order");
        setCart((prev) => prev.filter((l) => l.kind !== "stock"));
        setOtherRequest("");
        setOtherOpen(false);
      }

      for (const l of loanLines) {
        await post("/api/inventory/checkouts", {
          item_id: l.item_id,
          quantity: l.quantity,
          event_name: eventName.trim(),
          due_back_date: dueBack || null,
          taken_by: myName || null,
          notes: notes.trim() || null,
        });
        setCart((prev) => prev.filter((x) => x.key !== l.key));
      }
      if (loanLines.length) placed.push("tradeshow checkout");
    } catch (e: any) {
      setPlacing(false);
      setError(
        placed.length
          ? `Your ${placed.join(" and ")} went through, but the rest didn't: ${e?.message}. What's left is still in your cart.`
          : e?.message || "Couldn't place the order."
      );
      return;
    }

    // Everything went through — start fresh.
    setPlacing(false);
    setView("shop");
    setSection(null);
    setNeededBy("");
    setShipTo(EMPTY_SHIP_TO);
    setNotes("");
    setCompany("");
    setProject("");
    setContactName("");
    setContactEmail("");
    setContactPhone("");
    setArtworkStatus("ready");
    setArtwork([]);
    setUploads([]);
    setArtworkLink("");
    setProofRequired(true);
    setEventName("");
    setDueBack("");
    setOpenCustomize({});
    if (canOrderOem) setBoxMode(null);
    const what = placed.join(", ").replace(/, ([^,]*)$/, " and $1");
    onSubmitted?.(`Placed your ${what}. Track ${placed.length > 1 ? "them" : "it"} below.`);
  }

  // ── Rendering ─────────────────────────────────────────────────────────────
  const BUILD_SHORT: Record<SampleBuild, string> = { full: "Full box", overlay: "Overlay", anchor: "Anchor" };

  function thumb(it: InvItem | undefined, size: "card" | "line", oem = false) {
    const icon: IconName = !it ? "box" : isSampleAnchor(it) ? "box" : SECTION_TILES.find((s) => s.key === it.category)?.icon || "box";
    if (size === "line") {
      return (
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[12px] ${
            oem ? "bg-violet-500/10 text-violet-600" : "bg-[var(--mo-thin)] text-[var(--anchor-gray)]"
          }`}
        >
          {it?.image_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={it.image_url} alt="" className="h-full w-full object-cover" />
          ) : (
            <Icon name={icon} className="h-5 w-5" />
          )}
        </div>
      );
    }
    return it?.image_url ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={it.image_url} alt={it.name} className="h-full w-full object-cover" />
    ) : (
      <div className="flex h-full w-full items-center justify-center text-[var(--anchor-gray)] opacity-50">
        <Icon name={icon} className="h-10 w-10" strokeWidth={1.3} />
      </div>
    );
  }

  function renderCard(it: InvItem) {
    const sample = isSampleAnchor(it);
    const loan = section === "tradeshow";
    const mode = sample ? boxMode : null;
    const oem = mode === "oem";
    const builds = sample && mode ? buildsFor(it, mode) : [];
    const build = builds.length ? (builds.includes(draftBuild[it.id]) ? draftBuild[it.id] : builds[0]) : null;
    const qty = draftQty[it.id] ?? 1;
    const have = inCart(it.id);
    const avail = onHand(it, build);
    const box = boxInfo.get(it.id);
    const outOfStockLoan = loan && it.quantity_available <= 0;
    const added = flashKey === it.id;

    return (
      <div key={it.id} className="group flex flex-col">
        <div className="relative aspect-square w-full overflow-hidden rounded-[18px] bg-[var(--mo-thin)]">
          {thumb(it, "card")}
          {it.product_of_month && (
            <span className="absolute left-2.5 top-2.5 inline-flex items-center gap-1 rounded-full bg-white/85 px-2 py-0.5 text-[11px] font-semibold text-[var(--anchor-green)] backdrop-blur">
              <Icon name="star" className="h-3 w-3" strokeWidth={2.2} />
              Featured
            </span>
          )}
          {have > 0 && (
            <span
              className={`absolute right-2.5 top-2.5 rounded-full px-2 py-0.5 text-[11px] font-semibold text-white ${
                oem ? "bg-violet-600" : "bg-[var(--anchor-green)]"
              }`}
            >
              {have} in cart
            </span>
          )}
        </div>

        <div className="flex flex-1 flex-col gap-2.5 px-0.5 pt-3">
          <div>
            <div className="text-[15px] font-semibold leading-snug text-black line-clamp-2">{it.name}</div>
            <div className="mt-0.5 text-[13px] text-[var(--anchor-gray)]">
              {oem
                ? "Printed to order"
                : loan
                  ? outOfStockLoan
                    ? "All checked out"
                    : `${it.quantity_available} available to borrow`
                  : box && build === "full"
                    ? `${box.ready} built · ${box.loose} loose`
                    : avail > 0
                      ? `${avail} in stock`
                      : "Made to order"}
            </div>
          </div>

          {sample && !mode ? (
            <Pill variant="tinted" size="sm" className="mt-auto w-full" onClick={() => setModePrompt(true)}>
              Choose customer or OEM
            </Pill>
          ) : (
            <>
              {builds.length > 1 && (
                <div className="grid gap-1.5">
                  <Segmented
                    full
                    size="sm"
                    ariaLabel={`How ${it.name} ships`}
                    tone={oem ? "violet" : "green"}
                    value={build}
                    onChange={(b) => setDraftBuild((prev) => ({ ...prev, [it.id]: b }))}
                    options={builds.map((b) => ({ value: b, label: BUILD_SHORT[b] }))}
                  />
                  {build && (
                    <p className="text-[12px] leading-snug text-[var(--anchor-gray)]">
                      {SAMPLE_BUILDS.find((b) => b.key === build)?.[oem ? "oem" : "stock"]}
                    </p>
                  )}
                </div>
              )}
              {!oem && !loan && qty > avail && (
                <p className="text-[12px] font-medium text-amber-600">
                  {avail > 0 ? `Only ${avail} on hand — the rest are made to order.` : "None on hand — made to order."}
                </p>
              )}
              <div className="mt-auto flex items-center justify-between gap-2">
                <Stepper
                  value={qty}
                  label={it.name}
                  min={1}
                  max={loan ? Math.max(1, it.quantity_available) : MAX_QTY}
                  onChange={(n) => setDraftQty((prev) => ({ ...prev, [it.id]: Math.max(1, clampQty(n)) }))}
                />
                <Pill
                  size="sm"
                  variant={oem ? "violet" : "filled"}
                  disabled={outOfStockLoan}
                  onClick={() => addToCart(it, oem ? "oem" : loan ? "loan" : "stock", build, qty)}
                  className="min-w-[4.25rem]"
                >
                  {added ? <Icon name="check" className="h-4 w-4" strokeWidth={2.6} /> : "Add"}
                </Pill>
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  function lineName(l: CartLine): string {
    if (l.kind === "oem") return l.model || "Custom anchor";
    return byId.get(l.item_id)?.name || "Item";
  }

  function lineDetail(l: CartLine): string | null {
    if (l.kind === "loan") return "Borrowed, returned after the show";
    if (l.kind === "oem") return `${sampleBuildLabel(l.build)} · printed custom`;
    if (!l.build) return null;
    const box = boxInfo.get(l.item_id);
    if (box && l.remove) return describeBoxChoice(box.parts, l.remove, swapFor(l)?.name);
    return sampleBuildLabel(l.build);
  }

  function cartGroup(title: string, lines: CartLine[], badge?: ReactNode) {
    if (!lines.length) return null;
    return (
      <div>
        <div className="mb-1 flex items-center justify-between gap-2 px-1">
          <span className="text-[12px] font-semibold uppercase tracking-[0.04em] text-[var(--anchor-gray)]">{title}</span>
          {badge}
        </div>
        <ul className="divide-y divide-[var(--mo-sep)]">
          {lines.map((l) => {
            const it = byId.get(l.item_id);
            const detail = lineDetail(l);
            const short = l.kind === "stock" && it && l.quantity > onHand(it, l.build) ? onHand(it, l.build) : null;
            return (
              <li key={l.key} className="flex items-center gap-3 py-2.5">
                {thumb(it, "line", l.kind === "oem")}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14px] font-medium text-black">{lineName(l)}</div>
                  {detail && <div className="truncate text-[12px] text-[var(--anchor-gray)]">{detail}</div>}
                  {short !== null && (
                    <div className="text-[12px] font-medium text-amber-600">
                      {short > 0 ? `${short} on hand, rest made to order` : "Made to order"}
                    </div>
                  )}
                  <div className="mt-1.5 flex items-center gap-2">
                    <Stepper
                      value={l.quantity}
                      label={lineName(l)}
                      max={l.kind === "loan" && it ? it.quantity_available : MAX_QTY}
                      onChange={(n) => setLineQty(l.key, n)}
                    />
                    <button
                      type="button"
                      onClick={() => removeLine(l.key)}
                      className="text-[13px] font-medium text-[var(--anchor-gray)] transition hover:text-red-600"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  const otherStock = stockLines.filter((l) => !sampleLines.includes(l));
  const capBadge = (
    <span
      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${
        customerSamples >= CUSTOMER_SAMPLE_CAP ? "bg-amber-500/15 text-amber-700" : "bg-[var(--mo-fill)] text-[var(--anchor-gray)]"
      }`}
    >
      {customerSamples} of {CUSTOMER_SAMPLE_CAP}
    </span>
  );

  const cartCard = (
    <Surface className="p-5">
      <SectionTitle
        title={view === "checkout" ? "Summary" : "Cart"}
        right={
          cart.length > 0 ? (
            <span className="pt-0.5 text-[13px] text-[var(--anchor-gray)]">
              {cartUnits} item{cartUnits === 1 ? "" : "s"}
            </span>
          ) : undefined
        }
      />

      {cart.length === 0 && !otherRequest.trim() ? (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--mo-fill)] text-[var(--anchor-gray)]">
            <Icon name="bag" className="h-6 w-6" />
          </span>
          <p className="text-[14px] text-[var(--anchor-gray)]">Your cart is empty.</p>
        </div>
      ) : (
        <div className="mt-4 grid gap-4">
          {cartGroup("Pizza box · Customer", sampleLines, capBadge)}
          {cartGroup(
            "Pizza box · OEM",
            oemLines,
            <span className="rounded-full bg-violet-500/12 px-2 py-0.5 text-[11px] font-semibold text-violet-700">Custom</span>
          )}
          {cartGroup("Swag & printables", otherStock)}
          {cartGroup("Tradeshow loan", loanLines)}
          {otherRequest.trim() && view === "checkout" && (
            <div className="px-1">
              <span className="text-[12px] font-semibold uppercase tracking-[0.04em] text-[var(--anchor-gray)]">Not listed</span>
              <p className="mt-0.5 whitespace-pre-line text-[14px] text-black">{otherRequest.trim()}</p>
            </div>
          )}
        </div>
      )}

      {view === "shop" && (
        <div className="mt-4 border-t border-[var(--mo-sep)] pt-3">
          {otherOpen ? (
            <Textarea
              value={otherRequest}
              onChange={(e) => setOtherRequest(e.target.value)}
              placeholder="Describe what you need that isn't in the store…"
              rows={2}
              autoFocus
            />
          ) : (
            <button type="button" onClick={() => setOtherOpen(true)} className="text-[14px] font-medium text-[var(--anchor-green)]">
              Need something that isn&apos;t listed?
            </button>
          )}
        </div>
      )}

      {view === "checkout" && missing.length > 0 && (
        <div className="mt-4 rounded-[14px] bg-[var(--mo-thin)] px-3.5 py-3">
          <div className="text-[12px] font-semibold uppercase tracking-[0.04em] text-[var(--anchor-gray)]">Still needed</div>
          <ul className="mt-1 grid gap-0.5 text-[13px] text-black">
            {missing.map((m) => (
              <li key={m} className="capitalize-first">
                {m.charAt(0).toUpperCase() + m.slice(1)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {view === "checkout" && [oemLines.length > 0, stockLines.length > 0 || !!otherRequest.trim(), loanLines.length > 0].filter(Boolean).length > 1 && (
        <p className="mt-3 text-[12px] leading-snug text-[var(--anchor-gray)]">
          This places{" "}
          {[
            oemLines.length ? "an OEM order" : "",
            stockLines.length || otherRequest.trim() ? "a customer order" : "",
            loanLines.length ? "a tradeshow checkout" : "",
          ]
            .filter(Boolean)
            .join(", ")}
          . Each is handled by its own team, so you&apos;ll track them separately.
        </p>
      )}

      {error && (
        <div className="mt-3">
          <Alert tone="error">{error}</Alert>
        </div>
      )}

      {view === "shop" ? (
        <Pill
          size="lg"
          className="mt-4 w-full"
          disabled={cart.length === 0 && !otherRequest.trim()}
          onClick={() => {
            setError(null);
            setView("checkout");
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        >
          Check Out
        </Pill>
      ) : (
        <>
          <Pill
            size="lg"
            className="mt-4 w-full"
            disabled={placing || uploading || (cart.length === 0 && !otherRequest.trim())}
            onClick={placeOrder}
          >
            {placing ? "Placing Order…" : uploading ? "Uploading Artwork…" : "Place Order"}
          </Pill>
          <Pill variant="plain" size="sm" className="mt-1 w-full" onClick={() => setView("shop")}>
            Keep Shopping
          </Pill>
        </>
      )}
    </Surface>
  );

  // ── Shop ──────────────────────────────────────────────────────────────────
  const tiles = SECTION_TILES.filter((t) => t.key !== "tradeshow" || canBorrow);

  const shop = (
    <div className="grid min-w-0 gap-5">
      <section>
        <h2 className="mb-3 px-1 text-[22px] font-bold tracking-[-0.025em] text-black">What do you need?</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {tiles.map((t) => {
            const on = section === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => openSection(t.key)}
                aria-pressed={on}
                className={
                  "mo-surface flex flex-col items-start gap-3 p-4 text-left transition duration-200 hover:-translate-y-0.5 " +
                  (on ? "!shadow-[0_0_0_2px_var(--anchor-green),0_10px_30px_-10px_rgba(4,120,53,0.35)]" : "") +
                  (t.key === "potm" ? " col-span-2 sm:col-span-1" : "")
                }
              >
                <span
                  className={`flex h-10 w-10 items-center justify-center rounded-[12px] transition ${
                    on ? "bg-[var(--anchor-green)] text-white" : "bg-[var(--anchor-green)]/10 text-[var(--anchor-green)]"
                  }`}
                >
                  <Icon name={t.icon} className="h-[22px] w-[22px]" />
                </span>
                <span>
                  <span className="block text-[15px] font-semibold leading-tight text-black">{t.label}</span>
                  <span className="mt-0.5 block text-[12px] leading-tight text-[var(--anchor-gray)]">
                    {t.key === "potm" && potmLabel ? potmLabel : t.hint}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </section>

      {section && (
        <Surface className="p-5 sm:p-6">
          <SectionTitle
            title={
              <>
                {SECTION_TILES.find((t) => t.key === section)?.label}
                {section === "potm" && potmLabel ? <span className="text-[var(--anchor-gray)]"> · {potmLabel}</span> : null}
              </>
            }
            hint={
              section === "samples" && boxMode === "customer"
                ? `Up to ${CUSTOMER_SAMPLE_CAP} samples per customer order, shipped from stock.`
                : section === "samples" && boxMode === "oem"
                  ? "Everything is printed for the partner and the anchors are printed separately. Partner details and artwork come at checkout."
                  : section === "tradeshow"
                    ? "Booth kit, displays and banners are borrowed and returned. You'll name the event at checkout."
                    : undefined
            }
            right={
              section === "samples" && boxMode ? (
                canOrderOem ? (
                  <Segmented
                    size="sm"
                    ariaLabel="Who the order is for"
                    tone={boxMode === "oem" ? "violet" : "green"}
                    value={boxMode}
                    onChange={(m) => (m === boxMode ? undefined : setModePrompt(true))}
                    options={[
                      { value: "customer" as MarketingOrderType, label: "Customer" },
                      { value: "oem" as MarketingOrderType, label: "OEM" },
                    ]}
                  />
                ) : undefined
              ) : undefined
            }
          />

          {capNotice && (
            <div className="mt-4 flex items-start gap-3 rounded-[14px] bg-amber-500/10 p-3.5 text-[14px] text-amber-900">
              <Icon name="flag" className="mt-0.5 h-4 w-4 text-amber-600" />
              <div>
                <strong className="font-semibold">Customer orders stop at {CUSTOMER_SAMPLE_CAP} samples.</strong>{" "}
                {canOrderOem ? (
                  <>
                    Bigger than that, or for a manufacturing partner?{" "}
                    <button type="button" onClick={() => setModePrompt(true)} className="font-semibold text-violet-700">
                      Make it an OEM order
                    </button>
                  </>
                ) : (
                  "For a larger order, ask your inside sales rep about an OEM order."
                )}
              </div>
            </div>
          )}

          <div className="mt-4">
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search" className="h-10 px-3.5" />
          </div>

          {invError && (
            <div className="mt-3">
              <Alert tone="error">{invError}</Alert>
            </div>
          )}

          <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3">
            {invLoading ? (
              <div className="col-span-full py-6 text-center text-[14px] text-[var(--anchor-gray)]">Loading…</div>
            ) : visibleItems.length === 0 && !(section === "samples" && boxMode === "oem") ? (
              <div className="col-span-full py-10 text-center text-[14px] text-[var(--anchor-gray)]">
                {search.trim()
                  ? `No results for “${search.trim()}”.`
                  : section === "potm"
                    ? "Nothing is featured as Product of the Month yet."
                    : "Nothing here yet."}
              </div>
            ) : (
              visibleItems.map(renderCard)
            )}
            {section === "samples" && boxMode === "oem" && !invLoading && (
              <button
                type="button"
                onClick={addCustomOemAnchor}
                className="flex aspect-square flex-col items-center justify-center gap-2 rounded-[18px] border-2 border-dashed border-violet-300 p-4 text-center text-violet-700 transition hover:bg-violet-500/5"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-500/12">
                  <Icon name={flashKey === "custom-oem" ? "check" : "plus"} className="h-5 w-5" strokeWidth={2.2} />
                </span>
                <span className="text-[14px] font-semibold">Anchor not listed</span>
                <span className="text-[12px] leading-snug text-violet-700/80">Add a custom anchor and name it at checkout</span>
              </button>
            )}
          </div>
        </Surface>
      )}
    </div>
  );

  // ── Checkout ──────────────────────────────────────────────────────────────
  const checkout = (
    <div className="grid min-w-0 gap-5">
      <div className="flex items-center justify-between gap-3 px-1">
        <h2 className="text-[28px] font-bold tracking-[-0.03em] text-black">Checkout</h2>
        <Pill variant="plain" size="sm" onClick={() => setView("shop")} className="!px-0">
          <Icon name="chevronLeft" className="h-4 w-4" strokeWidth={2.4} />
          Store
        </Pill>
      </div>

      {(oemLines.length > 0 || stockLines.length > 0) && (
        <Surface className="p-5 sm:p-6">
          <SectionTitle title="Your items" hint="Add print details, notes or box changes." />
          <div className="mt-4 divide-y divide-[var(--mo-sep)]">
            {oemLines.map((l) => (
              <div key={l.key} className="grid gap-3 py-4 first:pt-0 last:pb-0">
                <div className="flex items-center gap-3">
                  {thumb(byId.get(l.item_id), "line", true)}
                  <div className="min-w-0 flex-1">
                    {l.item_id ? (
                      <div className="truncate text-[15px] font-semibold text-black">{l.model}</div>
                    ) : (
                      <Input
                        value={l.model}
                        onChange={(e) => patchLine(l.key, { model: e.target.value })}
                        className="h-9 px-3 text-[14px]"
                        placeholder="Anchor model or part number"
                        maxLength={OEM_LIMITS.SHORT}
                      />
                    )}
                    <div className="text-[12px] text-violet-700">
                      {l.quantity} · OEM, printed custom
                    </div>
                  </div>
                </div>
                <Segmented
                  full
                  size="sm"
                  tone="violet"
                  ariaLabel={`How ${l.model || "this anchor"} is built`}
                  value={l.build}
                  onChange={(b) => patchLine(l.key, { build: b })}
                  options={SAMPLE_BUILDS.map((b) => ({ value: b.key, label: b.label }))}
                />
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input
                    value={l.imprint}
                    onChange={(e) => patchLine(l.key, { imprint: e.target.value })}
                    className="h-10 px-3.5"
                    placeholder="Anchor imprint"
                    maxLength={OEM_LIMITS.TEXT}
                  />
                  {l.build !== "anchor" && (
                    <Input
                      value={l.print}
                      onChange={(e) => patchLine(l.key, { print: e.target.value })}
                      className="h-10 px-3.5"
                      placeholder={l.build === "full" ? "Box, insert & printables print" : "Overlay print"}
                      maxLength={OEM_LIMITS.TEXT}
                    />
                  )}
                </div>
              </div>
            ))}

            {stockLines.map((l) => {
              const it = byId.get(l.item_id);
              const box = boxInfo.get(l.item_id);
              const customizable = !!box && l.build === "full";
              const removed = l.remove || [];
              const anchorOut = removed.includes(l.item_id);
              const swap = l.swap || { item_id: "", custom: "" };
              return (
                <div key={l.key} className="grid gap-3 py-4 first:pt-0 last:pb-0">
                  <div className="flex items-center gap-3">
                    {thumb(it, "line")}
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[15px] font-semibold text-black">{it?.name || "Item"}</div>
                      <div className="truncate text-[12px] text-[var(--anchor-gray)]">
                        {l.quantity}
                        {l.build ? ` · ${box && l.remove ? describeBoxChoice(box.parts, l.remove, swapFor(l)?.name) : sampleBuildLabel(l.build)}` : ""}
                      </div>
                    </div>
                  </div>
                  <Input
                    value={l.note}
                    onChange={(e) => patchLine(l.key, { note: e.target.value })}
                    className="h-10 px-3.5"
                    placeholder="Note (optional)"
                    maxLength={500}
                  />
                  {customizable && (
                    <div>
                      <button
                        type="button"
                        onClick={() => setOpenCustomize((p) => ({ ...p, [l.key]: !p[l.key] }))}
                        aria-expanded={!!openCustomize[l.key]}
                        className="inline-flex items-center gap-1 text-[14px] font-medium text-[var(--anchor-green)]"
                      >
                        Customize box
                        <Icon
                          name="chevronDown"
                          className={`h-4 w-4 transition-transform ${openCustomize[l.key] ? "rotate-180" : ""}`}
                          strokeWidth={2.2}
                        />
                      </button>
                      {openCustomize[l.key] && (
                        <div className="mt-2 overflow-hidden rounded-[14px] bg-[var(--mo-thin)]">
                          {box!.parts.map((p) => {
                            const kept = !removed.includes(p.item_id);
                            return (
                              <label
                                key={p.item_id}
                                className="flex cursor-pointer items-center justify-between gap-3 border-b border-[var(--mo-sep)] px-3.5 py-2.5 text-[14px] text-black last:border-b-0"
                              >
                                <span className="min-w-0">
                                  {p.per_box > 1 ? `${p.per_box} × ` : ""}
                                  {p.name}
                                  {p.kind === "anchor" ? <span className="text-[var(--anchor-gray)]"> · anchor</span> : null}
                                </span>
                                {/* iOS switch */}
                                <input
                                  type="checkbox"
                                  className="peer sr-only"
                                  checked={kept}
                                  onChange={() =>
                                    patchLine(l.key, {
                                      remove: kept ? [...removed, p.item_id] : removed.filter((x) => x !== p.item_id),
                                    })
                                  }
                                />
                                <span
                                  aria-hidden
                                  className={`relative h-[26px] w-[44px] shrink-0 rounded-full transition-colors ${
                                    kept ? "bg-[var(--anchor-green)]" : "bg-[var(--mo-fill-strong)]"
                                  } peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--anchor-green)]/40`}
                                >
                                  <span
                                    className={`absolute top-[2px] h-[22px] w-[22px] rounded-full bg-white shadow transition-all ${
                                      kept ? "left-[20px]" : "left-[2px]"
                                    }`}
                                  />
                                </span>
                              </label>
                            );
                          })}
                          {anchorOut && (
                            <div className="grid gap-2 border-t border-[var(--mo-sep)] px-3.5 py-3">
                              <Select
                                value={l.swap ? swap.item_id || CUSTOM_SWAP : ""}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  patchLine(l.key, {
                                    swap: !v ? null : v === CUSTOM_SWAP ? { item_id: "", custom: swap.custom } : { item_id: v, custom: "" },
                                  });
                                }}
                                aria-label="What goes in the box instead"
                                className="h-10 px-3"
                              >
                                <option value="">No anchor in its place</option>
                                <option value={CUSTOM_SWAP}>A custom anchor (not in inventory)…</option>
                                <optgroup label="Replace with a loose anchor">
                                  {inventory
                                    .filter((x) => isSwapAnchor(x, l.item_id))
                                    .sort((a, b) => a.name.localeCompare(b.name))
                                    .map((a) => (
                                      <option key={a.id} value={a.id}>
                                        {a.name} ({a.quantity_available} loose)
                                      </option>
                                    ))}
                                </optgroup>
                              </Select>
                              {l.swap && !swap.item_id && (
                                <Input
                                  value={swap.custom}
                                  onChange={(e) => patchLine(l.key, { swap: { item_id: "", custom: e.target.value } })}
                                  placeholder="Describe the custom anchor"
                                  maxLength={200}
                                  className="h-10 px-3"
                                />
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </Surface>
      )}

      {oemLines.length > 0 && (
        <Surface className="p-5 sm:p-6">
          <SectionTitle
            title="OEM partner"
            hint="Who it's branded for, and the files to print from."
            right={
              <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-violet-500/12 text-violet-600">
                <Icon name="building" className="h-5 w-5" />
              </span>
            }
          />
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Input
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              className="h-11 px-3.5"
              placeholder="Partner company"
              aria-label="Partner company"
              maxLength={OEM_LIMITS.SHORT}
            />
            <Input
              value={project}
              onChange={(e) => setProject(e.target.value)}
              className="h-11 px-3.5"
              placeholder="Program or project (optional)"
              aria-label="Program or project"
              maxLength={OEM_LIMITS.SHORT}
            />
            <Input
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
              className="h-11 px-3.5"
              placeholder="Contact name (optional)"
              aria-label="Partner contact name"
            />
            <div className="grid grid-cols-2 gap-3">
              <Input
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                className="h-11 px-3.5"
                placeholder="Email"
                aria-label="Partner contact email"
              />
              <Input
                type="tel"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                className="h-11 px-3.5"
                placeholder="Phone"
                aria-label="Partner contact phone"
              />
            </div>
          </div>

          <div className="mt-6 text-[15px] font-semibold text-black">Artwork</div>
          <div className="mt-2">
            <Segmented
              full
              tone="violet"
              ariaLabel="Artwork"
              value={artworkStatus}
              onChange={setArtworkStatus}
              options={OEM_ARTWORK_STATUSES.map((s) => ({
                value: s.key,
                label: s.key === "ready" ? "Attached" : s.key === "coming" ? "Partner sends" : "We design",
              }))}
            />
            <p className="mt-1.5 px-1 text-[12px] text-[var(--anchor-gray)]">
              {OEM_ARTWORK_STATUSES.find((s) => s.key === artworkStatus)?.hint}
            </p>
          </div>

          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void addFiles(e.dataTransfer.files);
            }}
            className="mt-3 flex flex-col items-center gap-2 rounded-[16px] border-[1.5px] border-dashed border-[var(--mo-fill-strong)] bg-[var(--mo-thin)] px-4 py-6 text-center"
          >
            <span className="flex h-10 w-10 items-center justify-center rounded-full bg-violet-500/12 text-violet-600">
              <Icon name="upload" className="h-5 w-5" />
            </span>
            <p className="text-[14px] text-black">
              Drop files here or{" "}
              <button type="button" onClick={() => fileInput.current?.click()} className="font-semibold text-violet-700">
                browse
              </button>
            </p>
            <p className="text-[12px] text-[var(--anchor-gray)]">
              PDF, AI, EPS, SVG or PNG · up to 200 MB each · {OEM_ARTWORK_MAX_FILES} files
            </p>
            <input ref={fileInput} type="file" multiple className="hidden" onChange={(e) => void addFiles(e.target.files)} />
          </div>
          {(artwork.length > 0 || uploads.length > 0) && (
            <ul className="mt-2 divide-y divide-[var(--mo-sep)] overflow-hidden rounded-[14px] bg-[var(--mo-thin)]">
              {artwork.map((f) => (
                <li key={f.path} className="flex items-center gap-3 px-3.5 py-2.5 text-[14px]">
                  <Icon name="check" className="h-4 w-4 text-[var(--anchor-green)]" strokeWidth={2.4} />
                  <span className="min-w-0 flex-1 truncate text-black">{f.filename}</span>
                  <span className="shrink-0 text-[12px] text-[var(--anchor-gray)]">{fileSize(f.size)}</span>
                  <button
                    type="button"
                    aria-label={`Remove ${f.filename}`}
                    onClick={() => setArtwork((prev) => prev.filter((x) => x.path !== f.path))}
                    className="shrink-0 text-[var(--anchor-gray)] hover:text-red-600"
                  >
                    <Icon name="xmark" className="h-4 w-4" />
                  </button>
                </li>
              ))}
              {uploads.map((u) => (
                <li key={u.key} className={`flex items-center gap-3 px-3.5 py-2.5 text-[14px] ${u.error ? "text-red-600" : ""}`}>
                  <span className="min-w-0 flex-1 truncate">{u.filename}</span>
                  <span className="shrink-0 text-[12px]">{u.error || "Uploading…"}</span>
                  {u.error && (
                    <button
                      type="button"
                      aria-label="Dismiss"
                      onClick={() => setUploads((prev) => prev.filter((x) => x.key !== u.key))}
                      className="shrink-0"
                    >
                      <Icon name="xmark" className="h-4 w-4" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <div className="relative mt-3">
            <Icon name="link" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--anchor-gray)]" />
            <Input
              type="url"
              value={artworkLink}
              onChange={(e) => setArtworkLink(e.target.value)}
              className="h-11 pl-10 pr-3.5"
              placeholder="Or paste a link (Dropbox, Google Drive, WeTransfer)"
              aria-label="Link to artwork files"
            />
          </div>

          <label className="mt-4 flex cursor-pointer items-center justify-between gap-4 rounded-[14px] bg-[var(--mo-thin)] px-3.5 py-3">
            <span>
              <span className="block text-[15px] font-medium text-black">Proof before production</span>
              <span className="block text-[12px] text-[var(--anchor-gray)]">
                Marketing sends a digital proof of every piece for sign-off first.
              </span>
            </span>
            <input type="checkbox" className="peer sr-only" checked={proofRequired} onChange={(e) => setProofRequired(e.target.checked)} />
            <span
              aria-hidden
              className={`relative h-[31px] w-[51px] shrink-0 rounded-full transition-colors ${
                proofRequired ? "bg-[var(--anchor-green)]" : "bg-[var(--mo-fill-strong)]"
              } peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--anchor-green)]/40`}
            >
              <span
                className={`absolute top-[2px] h-[27px] w-[27px] rounded-full bg-white shadow transition-all ${
                  proofRequired ? "left-[22px]" : "left-[2px]"
                }`}
              />
            </span>
          </label>
        </Surface>
      )}

      {loanLines.length > 0 && (
        <Surface className="p-5 sm:p-6">
          <SectionTitle title="Tradeshow" hint="The gear is checked out to you and comes back after the show." />
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <Input
              value={eventName}
              onChange={(e) => setEventName(e.target.value)}
              className="h-11 px-3.5"
              placeholder="Event, e.g. WRE 2026"
              aria-label="Event"
            />
            <label className="grid gap-1 text-[13px] text-[var(--anchor-gray)]">
              Due back (optional)
              <Input type="date" value={dueBack} onChange={(e) => setDueBack(e.target.value)} className="h-11 px-3.5" />
            </label>
          </div>
        </Surface>
      )}

      {needsShipping && (
        <Surface className="p-5 sm:p-6">
          <SectionTitle
            title="Shipping"
            hint="Orders go to the customer or partner, not to you."
            right={
              <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[var(--anchor-green)]/10 text-[var(--anchor-green)]">
                <Icon name="truck" className="h-5 w-5" />
              </span>
            }
          />
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <DeliveryFields
              neededBy={neededBy}
              onNeededBy={setNeededBy}
              shipTo={shipTo}
              onShipTo={setShipTo}
              neededByHint={
                oemLines.length ? "Custom printing takes weeks, not days. Give production as much lead time as you can." : undefined
              }
            />
            <label className="grid gap-1.5 text-sm sm:col-span-2">
              <span className="text-[13px] font-medium text-[var(--anchor-gray)]">Notes (optional)</span>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Deadline, event name, or anything else the marketing team should know"
                rows={3}
              />
            </label>
          </div>
        </Surface>
      )}
    </div>
  );

  return (
    <>
      <div className={`grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_21rem] ${cart.length && view === "shop" ? "pb-28 lg:pb-0" : ""}`}>
        {view === "shop" ? shop : checkout}
        <div id="store-cart" className="scroll-mt-4 lg:sticky lg:top-4">
          {cartCard}
        </div>
      </div>

      {/* Phone-only cart bar, frosted like an iOS toolbar. It sits above the
          app's bottom nav pill and stops short of the floating help button. It
          takes you to the cart rather than straight to checkout, so the last
          thing before placing an order is the full list. */}
      {cart.length > 0 && view === "shop" && (
        <div className="fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-30 pl-4 pr-[4.5rem] lg:hidden">
          <button
            type="button"
            onClick={() => document.getElementById("store-cart")?.scrollIntoView({ behavior: "smooth", block: "start" })}
            className="mx-auto flex h-12 w-full max-w-2xl items-center justify-between gap-3 rounded-full bg-white/75 px-5 text-[15px] font-semibold text-black shadow-[0_0_0_1px_rgba(0,0,0,0.05),0_10px_30px_-8px_rgba(0,0,0,0.25)] backdrop-blur-xl backdrop-saturate-150"
          >
            <span className="flex items-center gap-2">
              <Icon name="bag" className="h-5 w-5 text-[var(--anchor-green)]" />
              {cartUnits} item{cartUnits === 1 ? "" : "s"}
            </span>
            <span className="flex items-center gap-0.5 text-[var(--anchor-green)]">
              View Cart
              <Icon name="chevronRight" className="h-4 w-4" strokeWidth={2.4} />
            </span>
          </button>
        </div>
      )}

      <Modal open={modePrompt} onClose={() => setModePrompt(false)} className="mo-apple" style={{ padding: 0, overflow: "hidden" }}>
        <div className="px-6 pb-2 pt-6">
          <h2 className="text-[22px] font-bold tracking-[-0.025em] text-black">Who is this order for?</h2>
          <p className="mt-1 text-[14px] leading-snug text-[var(--anchor-gray)]">
            Either way, each sample can go as a fully built box, the anchor with its overlay, or just the anchor.
          </p>
        </div>
        <div className="mx-4 my-3 overflow-hidden rounded-[18px] bg-[var(--mo-thin)]">
          {(["customer", "oem"] as MarketingOrderType[]).map((m) => {
            const oem = m === "oem";
            const current = boxMode === m;
            return (
              <button
                key={m}
                type="button"
                onClick={() => chooseMode(m)}
                className="flex w-full items-center gap-3.5 border-b border-[var(--mo-sep)] px-4 py-4 text-left transition last:border-b-0 hover:bg-black/[0.03]"
              >
                <span
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] text-white ${
                    oem ? "bg-violet-600" : "bg-[var(--anchor-green)]"
                  }`}
                >
                  <Icon name={oem ? "building" : "person"} className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-[16px] font-semibold text-black">{MODE_COPY[m].title}</span>
                    <span className="text-[12px] font-medium text-[var(--anchor-gray)]">{MODE_COPY[m].tag}</span>
                  </span>
                  <span className="mt-0.5 block text-[13px] leading-snug text-[var(--anchor-gray)]">{MODE_COPY[m].body}</span>
                </span>
                {current ? (
                  <Icon name="check" className={`h-5 w-5 ${oem ? "text-violet-600" : "text-[var(--anchor-green)]"}`} strokeWidth={2.4} />
                ) : (
                  <Icon name="chevronRight" className="h-4 w-4 text-[var(--anchor-gray)]" strokeWidth={2.2} />
                )}
              </button>
            );
          })}
        </div>
        {linesLostOnSwitch > 0 && (
          <p className="px-6 text-[13px] font-medium text-amber-700">
            Switching removes the {linesLostOnSwitch} {boxMode === "oem" ? "OEM" : "customer"} pizza box line
            {linesLostOnSwitch === 1 ? "" : "s"} already in your cart.
          </p>
        )}
        <div className="px-4 pb-4 pt-2">
          <Pill variant="gray" className="w-full" onClick={() => setModePrompt(false)}>
            Cancel
          </Pill>
        </div>
      </Modal>
    </>
  );
}
