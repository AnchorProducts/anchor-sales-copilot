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

// POST — record a pickup and decrement stock.
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

    const itemId = clean(body.item_id);
    const name = clean(body.name);
    const email = clean(body.email);
    const quantity = Math.floor(Number(body.quantity));

    if (!itemId) return NextResponse.json({ error: "Pick an item." }, { status: 400 });
    if (!name) return NextResponse.json({ error: "Enter your name." }, { status: 400 });
    if (!EMAIL_RE.test(email)) return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > MAX_GRAB_QTY) {
      return NextResponse.json({ error: "Quantity must be a positive whole number." }, { status: 400 });
    }

    // Decrement with optimistic-concurrency retries: re-read the current count
    // and try again if another pickup landed between our read and write.
    let remaining = -1;
    let itemName = "";
    for (let attempt = 0; attempt < 4; attempt++) {
      const { data: item } = await supabaseAdmin
        .from("marketing_inventory_items")
        .select("id,name,quantity_available")
        .eq("id", itemId)
        .maybeSingle();
      if (!item) return NextResponse.json({ error: "That item no longer exists." }, { status: 404 });

      itemName = clean((item as any).name);
      const available = (item as any).quantity_available as number;
      if (quantity > available) {
        return NextResponse.json(
          { error: `Only ${available} left — can't take ${quantity}.` },
          { status: 409 }
        );
      }

      const moved = await consumeStock(itemId, quantity, available);
      if (moved.ok) {
        remaining = moved.available;
        break;
      }
      // conflict → loop and retry with a fresh read
    }
    if (remaining < 0) {
      return NextResponse.json({ error: "Stock changed while saving — please retry." }, { status: 409 });
    }

    // Log the pickup (best-effort — the stock has already moved).
    await supabaseAdmin.from("marketing_item_grabs").insert({
      item_id: itemId,
      item_name: itemName,
      grabbed_by_name: name,
      grabbed_by_email: email,
      quantity,
      ip,
    });

    void notifyGrab({ itemName, quantity, by: name, email, remaining });

    return NextResponse.json({ ok: true, quantity_available: remaining }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to record pickup." }, { status: 500 });
  }
}
