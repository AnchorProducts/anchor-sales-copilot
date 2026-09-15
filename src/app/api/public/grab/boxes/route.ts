// src/app/api/public/grab/boxes/route.ts
//
// PUBLIC (no login) pizza-box scan endpoint, behind the same shared aisle token
// as /api/public/grab.
//
// Marketing pre-assembles pizza boxes, and each box type carries one QR label
// (/grab/<t>/boxes?box=<sample id>). A rep scans every box they take, then
// says what they pulled back out, and only what's left comes off inventory.
//
//   GET  /api/public/grab/boxes?token=<t>
//     → { boxes: [{ id, name, kit, kit_label, image_url, parts: [BoxPart] }] }
//        every box type and what one box holds: the anchor, that series' pieces
//        as they're set up in the aisle, and the printables every box gets.
//
//   POST /api/public/grab/boxes
//        { token, name, email, boxes: [{ item_id, count }], take: { [item_id]: n }, website? }
//     → { ok, boxes, lines: [{ item_id, item_name, packed, quantity, removed, remaining, short }], failed }
//
// Stock moves at the scan, never at assembly, so a pulled-out brochure is simply
// never subtracted. `take` can only lower a line: it's capped at what the boxes
// held, and the server recomputes that from the box types rather than trusting
// the page. A box in someone's hands is real even when the count says it can't
// be, so a short count never refuses the scan — it takes what's recorded, logs
// the full amount, and flags the shortfall for a recount.
//
// The pass is logged once in marketing_box_scans, and each item as its own
// pickup line pointing back at it — so the admin log reads "5 boxes" while the
// Return tab can still put a single brochure back.

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { clean, consumeStock, getGrabConfig, notifyBoxPickup, signItemImage } from "@/lib/inventory/server";
import { boxParts, boxTotals, isBoxType, packagingKitLabel, type BoxPart } from "@/lib/inventory";
import { PIZZA_BOX_EXTRAS_KEY, parseBoxExtras } from "@/lib/settings/pizzaBoxExtras";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_BOXES_PER_TYPE = 500; // sanity ceiling, not a business rule

// Best-effort, per-instance rate limit — the same soft guard as the aisle
// endpoints; the token is the real gate.
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

async function tokenOk(token: string): Promise<boolean> {
  const cfg = await getGrabConfig();
  if (!cfg || !cfg.enabled || !cfg.token) return false;
  return clean(token) === cfg.token;
}

type BoxType = {
  id: string;
  name: string;
  kit: string;
  image_path: string | null;
  parts: BoxPart[];
};

// Every box type and what one box of it holds, built by boxParts from the whole
// catalog — the same way the order form and the inventory pages build a box.
async function loadBoxTypes(): Promise<BoxType[]> {
  const [{ data, error }, { data: extrasRow }] = await Promise.all([
    supabaseAdmin
      .from("marketing_inventory_items")
      .select("id,name,image_path,pizza_box,packaging_kit,packaging_role")
      .limit(1000),
    supabaseAdmin.from("app_settings").select("value").eq("key", PIZZA_BOX_EXTRAS_KEY).maybeSingle(),
  ]);
  if (error) throw new Error("Failed to load pizza boxes.");

  const catalog = ((data || []) as any[]).map((r) => ({ ...r, name: clean(r.name) }));
  const extras = parseBoxExtras((extrasRow as any)?.value);
  return catalog
    .filter(isBoxType)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((row) => ({
      id: row.id,
      name: row.name,
      kit: clean(row.packaging_kit),
      image_path: clean(row.image_path) || null,
      parts: boxParts(row, catalog, extras),
    }));
}

// GET — the box types a label can name, and what's in each.
export async function GET(req: Request) {
  try {
    const token = clean(new URL(req.url).searchParams.get("token"));
    if (!token || !(await tokenOk(token))) {
      return NextResponse.json({ error: "This pickup link is invalid or disabled." }, { status: 404 });
    }
    const types = await loadBoxTypes();
    const boxes = await Promise.all(
      types.map(async (t) => ({
        id: t.id,
        name: t.name,
        kit: t.kit,
        kit_label: packagingKitLabel(t.kit),
        image_url: await signItemImage(t.image_path),
        parts: t.parts,
      }))
    );
    return NextResponse.json({ boxes });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to load pizza boxes." }, { status: 500 });
  }
}

// Subtract up to `qty`, never below zero, with the same optimistic-concurrency
// guard as every other stock write. Reports how many actually came off.
async function takeUpTo(
  itemId: string,
  qty: number
): Promise<{ ok: true; taken: number; remaining: number } | { ok: false; error: string }> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data } = await supabaseAdmin
      .from("marketing_inventory_items")
      .select("quantity_available")
      .eq("id", itemId)
      .maybeSingle();
    if (!data) return { ok: false, error: "No longer exists." };
    const avail = (data as any).quantity_available as number;
    const taken = Math.min(qty, Math.max(0, avail));
    if (taken === 0) return { ok: true, taken: 0, remaining: avail };
    const moved = await consumeStock(itemId, taken, avail);
    if (moved.ok) return { ok: true, taken, remaining: moved.available };
    // conflict → retry with a fresh read
  }
  return { ok: false, error: "Stock changed — retry." };
}

// POST — take the scanned boxes, less whatever was pulled out of them.
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

    const types = await loadBoxTypes();
    const typeById = new Map(types.map((t) => [t.id, t]));

    // Merge duplicate lines; drop anything that isn't a box type (anymore).
    const counts = new Map<string, number>();
    for (const r of Array.isArray(body.boxes) ? (body.boxes as unknown[]) : []) {
      const o = (r || {}) as Record<string, unknown>;
      const id = clean(o.item_id);
      const n = Math.floor(Number(o.count));
      if (!typeById.has(id) || !Number.isFinite(n) || n <= 0) continue;
      counts.set(id, (counts.get(id) || 0) + n);
    }
    if (!counts.size) return NextResponse.json({ error: "Scan at least one box." }, { status: 400 });
    if ([...counts.values()].some((n) => n > MAX_BOXES_PER_TYPE)) {
      return NextResponse.json({ error: "That's more boxes than one pickup can hold." }, { status: 400 });
    }

    const boxes = [...counts].map(([id, count]) => ({ ...typeById.get(id)!, count }));
    const boxSummary = boxes.map((b) => ({ item_id: b.id, name: b.name, count: b.count }));
    const take = (body.take && typeof body.take === "object" ? body.take : {}) as Record<string, unknown>;

    // One row for the whole pass, so the admin log reads "5 boxes" rather than
    // six unrelated pickups. Best-effort: before 20260915_000001 there's no
    // table, and the pickup still goes through with its lines logged alone.
    const { data: scanRow } = await supabaseAdmin
      .from("marketing_box_scans")
      .insert({
        scanned_by_name: name,
        scanned_by_email: email,
        box_count: boxes.reduce((n, b) => n + b.count, 0),
        boxes: boxSummary,
        ip,
      })
      .select("id")
      .maybeSingle();
    const scanId: string | null = (scanRow as any)?.id || null;

    const lines = [];
    const failed = [];
    for (const line of boxTotals(boxes)) {
      const asked = line.item_id in take ? Math.floor(Number(take[line.item_id])) : line.packed;
      const quantity = Number.isFinite(asked) ? Math.max(0, Math.min(asked, line.packed)) : line.packed;
      const removed = line.packed - quantity;
      if (quantity === 0) {
        lines.push({ item_id: line.item_id, item_name: line.name, packed: line.packed, quantity, removed, remaining: 0, short: 0 });
        continue;
      }

      const moved = await takeUpTo(line.item_id, quantity);
      if (!moved.ok) {
        failed.push({ item_id: line.item_id, item_name: line.name, quantity, error: moved.error });
        continue;
      }

      await supabaseAdmin.from("marketing_item_grabs").insert({
        item_id: line.item_id,
        item_name: line.name,
        grabbed_by_name: name,
        grabbed_by_email: email,
        quantity,
        ip,
        // Only present when the scan table is, which means the column is too.
        ...(scanId ? { box_scan_id: scanId } : {}),
      });

      lines.push({
        item_id: line.item_id,
        item_name: line.name,
        packed: line.packed,
        quantity,
        removed,
        remaining: moved.remaining,
        short: quantity - moved.taken,
      });
    }

    const tookSomething = lines.some((l) => l.quantity > 0);
    if (scanId) {
      if (tookSomething) {
        await supabaseAdmin
          .from("marketing_box_scans")
          .update({
            lines: lines.map((l) => ({
              item_id: l.item_id,
              name: l.item_name,
              packed: l.packed,
              quantity: l.quantity,
              removed: l.removed,
              short: l.short,
            })),
          })
          .eq("id", scanId);
      } else {
        // Nothing moved, so there's no pass to log.
        await supabaseAdmin.from("marketing_box_scans").delete().eq("id", scanId);
      }
    }

    if (tookSomething) {
      void notifyBoxPickup({
        by: name,
        email,
        boxes: boxSummary,
        lines: lines.map((l) => ({
          name: l.item_name,
          quantity: l.quantity,
          removed: l.removed,
          remaining: l.remaining,
          short: l.short,
        })),
      });
    } else if (failed.length) {
      return NextResponse.json({ error: `Couldn't take that: ${failed[0].error}`, failed }, { status: 409 });
    }

    return NextResponse.json({ ok: true, boxes: boxSummary, lines, failed }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to record the boxes." }, { status: 500 });
  }
}
