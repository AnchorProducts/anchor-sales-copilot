// src/app/api/public/grab/boxes/route.ts
//
// PUBLIC (no login) pizza-box scan endpoint, behind the same shared aisle token
// as /api/public/grab.
//
// Marketing pre-assembles pizza boxes, and each box type carries one QR label
// (/grab/<t>/boxes?box=<anchor id>). A rep scans every box they take, then says
// what they pulled back out of them.
//
//   GET  /api/public/grab/boxes?token=<t>
//     → { boxes: [{ id, name, kit, kit_label, image_url, ready, parts: [BoxPart] }] }
//        every box type, how many are assembled and ready, and what one holds.
//
//   POST /api/public/grab/boxes
//        { token, name, email, boxes: [{ item_id, count }], take: { [item_id]: n }, website? }
//     → { ok, boxes, lines: [{ item_id, item_name, packed, quantity, removed, remaining, short }], failed }
//
// An assembled box is its own stock (see "Assembled boxes" in lib/inventory):
// its contents came off the loose counts when it was built. So a scanned box
// comes off the ready count, and anything pulled back out goes back on the
// loose counts. `take` can only lower a line — it's capped at what the boxes
// held, recomputed here from the box types rather than trusted from the page.
//
// A box in someone's hands is real even when the ready count says it isn't —
// someone built it without recording it. Its contents were never reserved, so
// they come off the loose counts instead, and the short ready count is flagged
// for a recount. Before 20260915_000002 nothing can be assembled, so every box
// works that way, just as it did before assembled boxes existed.
//
// The pass is logged once in marketing_box_scans, and each thing that left as
// its own pickup line pointing back at it — boxes and loose parts alike — so
// the Return tab can put a whole box, or a single brochure, back.

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  clean,
  getGrabConfig,
  loadBoxCatalog,
  notifyBoxPickup,
  shiftStock,
  signItemImage,
  type BoxCatalogItem,
} from "@/lib/inventory/server";
import {
  boxParts,
  boxTotals,
  findReadyBox,
  isBoxType,
  packagingKitLabel,
  readyBoxName,
  type BoxPart,
} from "@/lib/inventory";

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
  // The ready-box item, once anyone has assembled this anchor.
  readyBox: BoxCatalogItem | null;
};

// Every box type, what one box holds, and its ready-box item — built by
// boxParts from the whole catalog, the same way every other page builds a box.
async function loadBoxTypes(): Promise<{ types: BoxType[]; hasBoxOf: boolean }> {
  const { catalog, extras, hasBoxOf } = await loadBoxCatalog();
  const types = catalog
    .filter(isBoxType)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((row) => ({
      id: row.id,
      name: row.name,
      kit: clean(row.packaging_kit),
      image_path: row.image_path,
      parts: boxParts(row, catalog, extras),
      readyBox: findReadyBox(catalog, row.id),
    }));
  return { types, hasBoxOf };
}

// GET — the box types a label can name, and what's in each.
export async function GET(req: Request) {
  try {
    const token = clean(new URL(req.url).searchParams.get("token"));
    if (!token || !(await tokenOk(token))) {
      return NextResponse.json({ error: "This pickup link is invalid or disabled." }, { status: 404 });
    }
    const { types } = await loadBoxTypes();
    const boxes = await Promise.all(
      types.map(async (t) => ({
        id: t.id,
        name: t.name,
        kit: t.kit,
        kit_label: packagingKitLabel(t.kit),
        image_url: await signItemImage(t.image_path),
        ready: t.readyBox?.quantity_available ?? 0,
        parts: t.parts,
      }))
    );
    return NextResponse.json({ boxes });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to load pizza boxes." }, { status: 500 });
  }
}

type ResultLine = {
  item_id: string;
  item_name: string;
  packed: number;
  // What left inventory on this line: ready boxes for a box line, loose units
  // for a part.
  quantity: number;
  removed: number;
  remaining: number;
  short: number;
};

// POST — take the scanned boxes, and put back whatever was pulled out of them.
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

    const { types, hasBoxOf } = await loadBoxTypes();
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

    const scanned = [...counts].map(([id, count]) => ({ ...typeById.get(id)!, count, fromReady: 0 }));
    const boxSummary = scanned.map((b) => ({ item_id: b.id, name: b.name, count: b.count }));
    const take = (body.take && typeof body.take === "object" ? body.take : {}) as Record<string, unknown>;

    // One row for the whole pass, so the admin log reads "5 boxes" rather than
    // six unrelated pickups. Best-effort: before 20260915_000001 there's no
    // table, and the pickup still goes through with its lines logged alone.
    const { data: scanRow } = await supabaseAdmin
      .from("marketing_box_scans")
      .insert({
        scanned_by_name: name,
        scanned_by_email: email,
        box_count: scanned.reduce((n, b) => n + b.count, 0),
        boxes: boxSummary,
        ip,
      })
      .select("id")
      .maybeSingle();
    const scanId: string | null = (scanRow as any)?.id || null;

    const logPickup = (itemId: string, itemName: string, quantity: number) =>
      supabaseAdmin.from("marketing_item_grabs").insert({
        item_id: itemId,
        item_name: itemName,
        grabbed_by_name: name,
        grabbed_by_email: email,
        quantity,
        ip,
        // Only present when the scan table is, which means the column is too.
        ...(scanId ? { box_scan_id: scanId } : {}),
      });

    const lines: ResultLine[] = [];
    const failed: { item_id: string; item_name: string; quantity: number; error: string }[] = [];

    // 1. Boxes off the ready count. Any the count didn't know about still left
    //    the shelf; their contents come off the loose counts in step 2.
    for (const b of scanned) {
      if (!b.readyBox) {
        // Assembled boxes exist but nobody recorded building these: flag it.
        if (hasBoxOf) {
          lines.push({
            item_id: b.id,
            item_name: readyBoxName(b.name),
            packed: b.count,
            quantity: 0,
            removed: 0,
            remaining: 0,
            short: b.count,
          });
        }
        continue;
      }
      const moved = await shiftStock(b.readyBox.id, -b.count);
      if (!moved.ok) {
        failed.push({ item_id: b.readyBox.id, item_name: b.readyBox.name, quantity: b.count, error: moved.error });
        continue;
      }
      b.fromReady = b.count - moved.short;
      if (b.fromReady > 0) await logPickup(b.readyBox.id, b.readyBox.name, b.fromReady);
      lines.push({
        item_id: b.readyBox.id,
        item_name: b.readyBox.name,
        packed: b.count,
        quantity: b.fromReady,
        removed: 0,
        remaining: moved.available,
        short: moved.short,
      });
    }

    // 2. What was in the boxes, per item. Parts of a ready box were reserved
    //    when it was built, so pulling one out puts it back on the shelf. Parts
    //    of an unrecorded box never left the loose count, so what's kept comes
    //    off it and what's pulled out simply stays.
    const reserved = new Map(
      boxTotals(scanned.map((b) => ({ count: b.fromReady, parts: b.parts }))).map((l) => [l.item_id, l.packed])
    );
    for (const line of boxTotals(scanned.map((b) => ({ count: b.count, parts: b.parts })))) {
      const asked = line.item_id in take ? Math.floor(Number(take[line.item_id])) : line.packed;
      const kept = Number.isFinite(asked) ? Math.max(0, Math.min(asked, line.packed)) : line.packed;
      const removed = line.packed - kept;

      const fromLoose = line.packed - (reserved.get(line.item_id) || 0);
      const removedFromLoose = Math.min(removed, fromLoose);
      const backToShelf = removed - removedFromLoose;
      const offLoose = fromLoose - removedFromLoose;
      const delta = backToShelf - offLoose;

      let remaining = 0;
      let short = 0;
      if (delta !== 0) {
        const moved = await shiftStock(line.item_id, delta);
        if (!moved.ok) {
          failed.push({ item_id: line.item_id, item_name: line.name, quantity: offLoose, error: moved.error });
          continue;
        }
        remaining = moved.available;
        short = moved.short;
      }
      if (offLoose > 0) await logPickup(line.item_id, line.name, offLoose);
      if (offLoose > 0 || removed > 0 || short > 0) {
        lines.push({ item_id: line.item_id, item_name: line.name, packed: line.packed, quantity: offLoose, removed, remaining, short });
      }
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
