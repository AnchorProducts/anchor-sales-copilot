// src/app/api/public/grab/route.ts
//
// PUBLIC (no login) marketing-aisle pickup endpoint, reached by scanning the
// aisle QR code. Gated by the shared aisle token (see marketing_grab_config),
// never by a user session.
//
//   GET  /api/public/grab?token=<t>
//     → { items: [...], kits: [{ kit, label, pieces: [{ key, label, name, … }] }] }
//        the in-stock pick-list shown on /grab/<t>, plus the pizza-box kits that
//        exist as inventory items — one kit per anchor series — so the page can
//        offer exactly the pieces the aisle actually stocks, with their photos.
//
//   POST /api/public/grab
//        { token, name, email, items: [{ item_id, quantity, kit, components: [...] }], website? }
//     → { ok, taken, failed }   records the pickup and decrements stock.
//        `website` is a honeypot: bots fill hidden fields, humans leave it empty.
//
// Taking a sample "for a pizza box" also draws down the kit pieces the person
// says they need — the box, the plastic overlay, the under-anchor insert, the
// foldable over-anchor insert — from the series that sample belongs to. Each
// piece is its own inventory item tagged with packaging_kit + packaging_role.
// The anchor is the sample itself, so its own count has already moved.
//
// Stock leaves on a pickup (consumeStock) rather than going "out" as a loan, but
// it is not gone for good: /api/public/grab/return puts unused units back.
// Every write is logged to marketing_item_grabs and notified to the
// "inventory_grab" channel.

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  clean,
  getGrabConfig,
  consumeStock,
  signItemImage,
  notifyGrab,
  getPackagingPools,
  kitPools,
  adjustPoolStock,
  isMissingKitColumn,
  type KitPools,
  type PackagingPools,
} from "@/lib/inventory/server";
import {
  isInventoryCategory,
  isPackagingKit,
  normalizeComponents,
  packagingKitLabel,
  PACKAGING_KITS,
  PACKAGING_ROLES,
  PIZZA_BOX_COMPONENTS,
  type PackagingRole,
} from "@/lib/inventory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_GRAB_QTY = 10_000; // sanity ceiling; real cap is the item's stock

// Best-effort, per-instance rate limit. Serverless instances are ephemeral so
// this only slows a burst from one warm instance — a soft guard against a
// runaway scanner, not a hard security control (the token is the real gate).
const HITS = new Map<string, number[]>();
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 20;
function rateLimited(ip: string): boolean {
  const now = Date.now();
  const recent = (HITS.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  recent.push(now);
  HITS.set(ip, recent);
  return recent.length > RATE_MAX;
}

function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for") || "";
  return clean(fwd.split(",")[0]) || clean(req.headers.get("x-real-ip")) || "unknown";
}

// Validate the token against the single-row config. Returns true only when the
// token matches and the aisle is enabled.
async function tokenOk(token: string): Promise<boolean> {
  const cfg = await getGrabConfig();
  if (!cfg || !cfg.enabled || !cfg.token) return false;
  return clean(token) === cfg.token;
}

// The kits the aisle actually stocks, each with its pieces in assembly order and
// their photos — what the pickup page shows under "which pieces do you need?".
// A kit nobody has set up pieces for (the unlaunched 5000 Series today) simply
// isn't in the list, so it can't be picked.
async function kitsPayload(pools: PackagingPools) {
  const kits = [];
  for (const kit of PACKAGING_KITS) {
    const forKit = pools[kit];
    if (!forKit) continue;
    const pieces = await Promise.all(
      PIZZA_BOX_COMPONENTS.filter((c) => forKit[c.key]).map(async (c) => {
        const pool = forKit[c.key]!;
        return {
          key: c.key,
          label: c.label,
          name: pool.name,
          quantity_available: pool.quantity_available,
          image_url: await signItemImage(pool.image_path),
        };
      })
    );
    if (pieces.length) kits.push({ kit, label: packagingKitLabel(kit), pieces });
  }
  return kits;
}

// GET — the in-stock pick-list for a valid token.
export async function GET(req: Request) {
  try {
    const params = new URL(req.url).searchParams;
    const token = clean(params.get("token") || "");
    if (!token || !(await tokenOk(token))) {
      return NextResponse.json({ error: "This pickup link is invalid or disabled." }, { status: 404 });
    }

    // Optional filters:
    //   ?item=<id> — a per-item QR: return just that item (even if out of stock,
    //     so the shelf label still resolves and can say "out of stock").
    //   ?cat=<key> — a category "master" QR: only that category's in-stock items.
    const itemId = clean(params.get("item"));
    const cat = clean(params.get("cat"));

    const ITEM_COLS_BASE =
      "id,name,description,category,image_path,quantity_available,pizza_box,plastic_overlay,packaging_role";
    const listItems = (cols: string) => {
      let query = supabaseAdmin.from("marketing_inventory_items").select(cols);
      if (itemId) {
        query = query.eq("id", itemId);
      } else {
        query = query.gt("quantity_available", 0);
        if (cat && isInventoryCategory(cat)) query = query.eq("category", cat);
      }
      return query.order("name", { ascending: true }).limit(1000);
    };

    let { data, error } = await listItems(`${ITEM_COLS_BASE},packaging_kit`);
    // Pre-migration this column doesn't exist. The shelf list still loads; it
    // just can't offer kit pieces (getPackagingPools returns none either).
    if (isMissingKitColumn(error)) ({ data, error } = await listItems(ITEM_COLS_BASE));
    if (error) return NextResponse.json({ error: "Failed to load items." }, { status: 500 });

    const items = await Promise.all(
      (data || []).map(async (row: any) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        category: row.category,
        quantity_available: row.quantity_available,
        pizza_box: !!row.pizza_box,
        plastic_overlay: !!row.plastic_overlay,
        packaging_role: row.packaging_role || null,
        packaging_kit: row.packaging_kit || null,
        image_url: await signItemImage(row.image_path),
      }))
    );

    return NextResponse.json({ items, kits: await kitsPayload(await getPackagingPools()) });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to load items." }, { status: 500 });
  }
}

// Normalize the requested lines into [{ item_id, quantity, kit, components }].
// Accepts a cart (`items: [...]`) or the legacy single-item shape (`item_id` +
// `quantity`). Component choices arrive as `components: ["pizza_box", …]`; the
// pre-kit booleans still work, with `pizza_box: true` meaning the whole kit —
// which is what "give me a pizza box" meant before the pieces were split out.
//
// `kit` is only consulted when the item itself has no kit set; an item that
// knows its own series always wins, so nobody can spend the wrong count by
// posting a different one.
type Line = { item_id: string; quantity: number; kit: string | null; components: PackagingRole[] };

function lineComponents(o: Record<string, unknown>): PackagingRole[] {
  if (Array.isArray(o.components)) return normalizeComponents(o.components);
  const legacy: PackagingRole[] = [];
  if (o.pizza_box === true || o.pizza_box === "true") legacy.push(...PACKAGING_ROLES);
  if (o.plastic_overlay === true || o.plastic_overlay === "true") legacy.push("overlay");
  return normalizeComponents(legacy);
}

function parseLines(body: Record<string, unknown>): Line[] {
  const raw = Array.isArray(body.items) ? (body.items as unknown[]) : [body];
  const lines: Line[] = [];
  for (const r of raw) {
    const o = (r || {}) as Record<string, unknown>;
    const id = clean(o.item_id);
    const qty = Math.floor(Number(o.quantity));
    if (!id) continue;
    if (!Number.isFinite(qty) || qty <= 0) continue;
    const components = lineComponents(o);
    const kit = isPackagingKit(clean(o.kit)) ? clean(o.kit) : null;
    // Collapse duplicate lines for the same item (a chosen piece stays chosen).
    const existing = lines.find((l) => l.item_id === id);
    if (existing) {
      existing.quantity += qty;
      existing.components = normalizeComponents([...existing.components, ...components]);
      existing.kit = existing.kit || kit;
    } else {
      lines.push({ item_id: id, quantity: qty, kit, components });
    }
  }
  return lines;
}

// Which kit pieces this item may draw: the full kit when it's offered with a
// pizza box, the overlay alone when it's only offered an overlay — and never a
// piece that series doesn't stock as an item. A request for a piece the item
// doesn't offer is dropped rather than trusted.
function allowedComponents(
  item: { pizza_box?: boolean; plastic_overlay?: boolean },
  forKit: KitPools
): PackagingRole[] {
  const configured = PACKAGING_ROLES.filter((k) => forKit[k]);
  if (item.pizza_box) return configured;
  if (item.plastic_overlay) return configured.filter((k) => k === "overlay");
  return [];
}

type GrabResult =
  | {
      ok: true;
      item_id: string;
      item_name: string;
      quantity: number;
      remaining: number;
      kit: string | null;
      components: PackagingRole[];
    }
  | { ok: false; item_id: string; item_name: string; quantity: number; error: string };

// Decrement one item with optimistic-concurrency retries; log the pickup and
// draw down each kit piece the person asked for.
async function grabOne(
  line: Line,
  who: { name: string; email: string; ip: string },
  pools: PackagingPools
): Promise<GrabResult> {
  if (line.quantity > MAX_GRAB_QTY) {
    return { ok: false, item_id: line.item_id, item_name: "", quantity: line.quantity, error: "Quantity too large." };
  }

  let itemName = "";
  for (let attempt = 0; attempt < 4; attempt++) {
    const readItem = (cols: string) =>
      supabaseAdmin.from("marketing_inventory_items").select(cols).eq("id", line.item_id).maybeSingle();
    let { data: item, error: itemErr } = await readItem(
      "id,name,quantity_available,pizza_box,plastic_overlay,packaging_kit"
    );
    if (isMissingKitColumn(itemErr)) {
      ({ data: item } = await readItem("id,name,quantity_available,pizza_box,plastic_overlay"));
    }
    if (!item) {
      return { ok: false, item_id: line.item_id, item_name: "", quantity: line.quantity, error: "No longer exists." };
    }
    itemName = clean((item as any).name);
    const available = (item as any).quantity_available as number;
    if (line.quantity > available) {
      return {
        ok: false,
        item_id: line.item_id,
        item_name: itemName,
        quantity: line.quantity,
        error: available > 0 ? `Only ${available} left.` : "Out of stock.",
      };
    }

    const moved = await consumeStock(line.item_id, line.quantity, available);
    if (moved.ok) {
      // The item's own series is authoritative; the request's kit only fills in
      // for an item nobody has assigned one to yet.
      const kit = clean((item as any).packaging_kit) || line.kit;
      const forKit = kitPools(pools, kit);
      const components = normalizeComponents(line.components, allowedComponents(item as any, forKit));

      const logRow = {
        item_id: line.item_id,
        item_name: itemName,
        grabbed_by_name: who.name,
        grabbed_by_email: who.email,
        quantity: line.quantity,
        components,
        packaging_kit: components.length ? kit : null,
        // Kept in step with `components` so the pre-kit reading of the log —
        // "did a box / an overlay go with this?" — still answers correctly.
        pizza_box: components.includes("pizza_box"),
        plastic_overlay: components.includes("overlay"),
        ip: who.ip,
      };
      const { error: logErr } = await supabaseAdmin.from("marketing_item_grabs").insert(logRow);
      // Stock has already moved, so the pickup MUST be logged. Pre-migration,
      // log it without the kit columns rather than lose the record.
      if (isMissingKitColumn(logErr)) {
        const { components: _c, packaging_kit: _k, ...legacy } = logRow;
        await supabaseAdmin.from("marketing_item_grabs").insert(legacy);
      }

      for (const key of components) await adjustPoolStock(forKit[key]?.id, -line.quantity);

      return {
        ok: true,
        item_id: line.item_id,
        item_name: itemName,
        quantity: line.quantity,
        remaining: moved.available,
        kit: components.length ? kit : null,
        components,
      };
    }
    // conflict → retry with a fresh read
  }
  return { ok: false, item_id: line.item_id, item_name: itemName, quantity: line.quantity, error: "Stock changed — retry." };
}

// POST — record a pickup of one or more items and decrement stock. Identity
// (name + email) is entered once for the whole cart.
export async function POST(req: Request) {
  try {
    const ip = clientIp(req);
    if (rateLimited(ip)) {
      return NextResponse.json({ error: "Too many pickups too fast — try again in a minute." }, { status: 429 });
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

    // Honeypot: a real person never fills this hidden field.
    if (clean(body.website)) return NextResponse.json({ ok: true }, { status: 200 });

    if (!(await tokenOk(clean(body.token)))) {
      return NextResponse.json({ error: "This pickup link is invalid or disabled." }, { status: 404 });
    }

    const name = clean(body.name);
    const email = clean(body.email);
    if (!name) return NextResponse.json({ error: "Enter your name." }, { status: 400 });
    if (!EMAIL_RE.test(email)) return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });

    const lines = parseLines(body);
    if (!lines.length) return NextResponse.json({ error: "Pick at least one item." }, { status: 400 });
    if (lines.length > 100) return NextResponse.json({ error: "Too many items at once." }, { status: 400 });

    // Resolve every kit's piece pools once for the whole cart.
    const pools = await getPackagingPools();

    // Process sequentially — carts are small, and this keeps stock math simple.
    const results: GrabResult[] = [];
    for (const line of lines) results.push(await grabOne(line, { name, email, ip }, pools));

    const taken = results.filter((r): r is Extract<GrabResult, { ok: true }> => r.ok);
    const failed = results.filter((r): r is Extract<GrabResult, { ok: false }> => !r.ok);

    if (taken.length) {
      void notifyGrab({
        by: name,
        email,
        items: taken.map((t) => ({
          name: t.item_name,
          quantity: t.quantity,
          remaining: t.remaining,
          components: t.components,
          kit: t.kit,
        })),
      });
    }

    // Nothing succeeded → surface as an error the page can show.
    if (!taken.length) {
      return NextResponse.json(
        { error: failed[0]?.error ? `Couldn't take that: ${failed[0].error}` : "Couldn't record that pickup.", results },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        taken: taken.map((t) => ({
          item_id: t.item_id,
          item_name: t.item_name,
          quantity: t.quantity,
          remaining: t.remaining,
          components: t.components,
          kit: t.kit,
        })),
        failed: failed.map((f) => ({ item_id: f.item_id, item_name: f.item_name, quantity: f.quantity, error: f.error })),
      },
      { status: 201 }
    );
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to record pickup." }, { status: 500 });
  }
}
