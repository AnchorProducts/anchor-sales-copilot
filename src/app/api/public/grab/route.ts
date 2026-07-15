// src/app/api/public/grab/route.ts
//
// PUBLIC (no login) marketing-aisle pickup endpoint, reached by scanning the
// aisle QR code. Gated by the shared aisle token (see marketing_grab_config),
// never by a user session.
//
//   GET  /api/public/grab?token=<t>
//     → { items: [{ id, name, description, category, quantity_available, image_url }] }
//        the in-stock pick-list shown on /grab/<t>.
//
//   POST /api/public/grab   { token, item_id, name, email, quantity, website? }
//     → { ok, quantity_available }   records the pickup and decrements stock.
//        `website` is a honeypot: bots fill hidden fields, humans leave it empty.
//
// Stock leaves permanently (consumeStock) — an aisle pickup is a consumption,
// not a returnable checkout. Every write is logged to marketing_item_grabs and
// notified to the "inventory_grab" channel.

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { clean, getGrabConfig, consumeStock, signItemImage, notifyGrab } from "@/lib/inventory/server";
import { isInventoryCategory } from "@/lib/inventory";

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

    let query = supabaseAdmin
      .from("marketing_inventory_items")
      .select("id,name,description,category,image_path,quantity_available");
    if (itemId) {
      query = query.eq("id", itemId);
    } else {
      query = query.gt("quantity_available", 0);
      if (cat && isInventoryCategory(cat)) query = query.eq("category", cat);
    }

    const { data, error } = await query.order("name", { ascending: true }).limit(1000);
    if (error) return NextResponse.json({ error: "Failed to load items." }, { status: 500 });

    const items = await Promise.all(
      (data || []).map(async (row: any) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        category: row.category,
        quantity_available: row.quantity_available,
        image_url: await signItemImage(row.image_path),
      }))
    );

    return NextResponse.json({ items });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to load items." }, { status: 500 });
  }
}

// Normalize the requested lines into [{ item_id, quantity }]. Accepts a cart
// (`items: [...]`) or the legacy single-item shape (`item_id` + `quantity`).
function parseLines(body: Record<string, unknown>): { item_id: string; quantity: number }[] {
  const raw = Array.isArray(body.items)
    ? (body.items as unknown[])
    : [{ item_id: body.item_id, quantity: body.quantity }];
  const lines: { item_id: string; quantity: number }[] = [];
  for (const r of raw) {
    const o = (r || {}) as Record<string, unknown>;
    const id = clean(o.item_id);
    const qty = Math.floor(Number(o.quantity));
    if (!id) continue;
    if (!Number.isFinite(qty) || qty <= 0) continue;
    // Collapse duplicate lines for the same item.
    const existing = lines.find((l) => l.item_id === id);
    if (existing) existing.quantity += qty;
    else lines.push({ item_id: id, quantity: qty });
  }
  return lines;
}

// Decrement one item with optimistic-concurrency retries; log the pickup.
async function grabOne(
  line: { item_id: string; quantity: number },
  who: { name: string; email: string; ip: string }
): Promise<
  | { ok: true; item_id: string; item_name: string; quantity: number; remaining: number }
  | { ok: false; item_id: string; item_name: string; quantity: number; error: string }
> {
  if (line.quantity > MAX_GRAB_QTY) {
    return { ok: false, item_id: line.item_id, item_name: "", quantity: line.quantity, error: "Quantity too large." };
  }

  let itemName = "";
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data: item } = await supabaseAdmin
      .from("marketing_inventory_items")
      .select("id,name,quantity_available")
      .eq("id", line.item_id)
      .maybeSingle();
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
      await supabaseAdmin.from("marketing_item_grabs").insert({
        item_id: line.item_id,
        item_name: itemName,
        grabbed_by_name: who.name,
        grabbed_by_email: who.email,
        quantity: line.quantity,
        ip: who.ip,
      });
      return { ok: true, item_id: line.item_id, item_name: itemName, quantity: line.quantity, remaining: moved.available };
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

    // Process sequentially — carts are small, and this keeps stock math simple.
    const results = [];
    for (const line of lines) results.push(await grabOne(line, { name, email, ip }));

    const taken = results.filter((r): r is Extract<typeof r, { ok: true }> => r.ok);
    const failed = results.filter((r): r is Extract<typeof r, { ok: false }> => !r.ok);

    if (taken.length) {
      void notifyGrab({
        by: name,
        email,
        items: taken.map((t) => ({ name: t.item_name, quantity: t.quantity, remaining: t.remaining })),
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
        taken: taken.map((t) => ({ item_id: t.item_id, item_name: t.item_name, quantity: t.quantity, remaining: t.remaining })),
        failed: failed.map((f) => ({ item_id: f.item_id, item_name: f.item_name, quantity: f.quantity, error: f.error })),
      },
      { status: 201 }
    );
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to record pickup." }, { status: 500 });
  }
}
