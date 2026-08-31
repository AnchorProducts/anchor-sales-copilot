// src/app/api/public/grab/return/route.ts
//
// PUBLIC (no login) marketing-aisle RETURN endpoint — the other half of the
// aisle QR. Someone who took a stack for a job and used only part of it puts the
// rest back on the shelf; until this existed the count never learned about it,
// so the aisle drifted low on its own.
//
//   GET  /api/public/grab/return?token=<t>&email=<e>
//     → { pickups: [{ id, item_name, quantity, quantity_returned, outstanding,
//                     components, created_at }] }
//        that person's pickups with units still out, newest first. Identity is
//        the email they used at pickup — the same low bar as the honor-system
//        aisle itself, and it only ever reveals that person's own history.
//
//   POST /api/public/grab/return
//        { token, name, email, returns: [{ grab_id, quantity, components: [...] }] }
//     → { ok, returned, failed }
//        Puts units back into quantity_available and each returned kit piece
//        back into its pool — the pool of the SERIES the pickup recorded, so a
//        3000 Series overlay can never come back as a 2000 Series one. Pieces
//        are chosen per return, not copied from the pickup: an unused overlay
//        comes back, an insert that was folded around an anchor does not.
//
// Gated by the shared aisle token like the pickup endpoint, never by a session.
// A return can only ever ADD stock and can never exceed what that pickup still
// has outstanding, so the worst a bad actor can do with a leaked token is
// inflate a count — which the pickup log makes visible.

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  clean,
  getGrabConfig,
  returnStock,
  notifyReturn,
  getPackagingPools,
  kitPools,
  adjustPoolStock,
  type PackagingPools,
} from "@/lib/inventory/server";
import {
  normalizeComponents,
  grabOutstanding,
  packagingKitLabel,
  type PackagingRole,
} from "@/lib/inventory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// How far back the return page looks. Long enough to cover a sample that sat in
// a truck for a season, short enough that the list stays scannable on a phone.
const LOOKBACK_DAYS = 180;

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

// The return half lives entirely on columns added by 20260831_000001. If a
// deploy lands before that migration, say so plainly instead of 500ing —
// "returns aren't on yet" is actionable; "Failed to load" is not.
// 42703 = column does not exist, 42P01 = relation does not exist.
function isUnmigrated(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === "42703" ||
    error.code === "42P01" ||
    /components|quantity_returned|packaging_kit|marketing_item_returns/.test(error.message || "")
  );
}

const UNMIGRATED_MSG =
  "Returns aren't switched on for this aisle yet. Tell the marketing team — the inventory update hasn't been applied.";

function sinceISO(): string {
  return new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

// GET — this person's still-outstanding pickups.
export async function GET(req: Request) {
  try {
    const params = new URL(req.url).searchParams;
    const token = clean(params.get("token"));
    if (!token || !(await tokenOk(token))) {
      return NextResponse.json({ error: "This pickup link is invalid or disabled." }, { status: 404 });
    }

    const email = clean(params.get("email")).toLowerCase();
    if (!EMAIL_RE.test(email)) {
      return NextResponse.json({ error: "Enter the email you used when you took them." }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("marketing_item_grabs")
      .select(
        "id,item_id,item_name,quantity,quantity_returned,components,packaging_kit,grabbed_by_name,grabbed_by_email,created_at"
      )
      .ilike("grabbed_by_email", email)
      .gte("created_at", sinceISO())
      .order("created_at", { ascending: false })
      .limit(200);
    if (isUnmigrated(error)) return NextResponse.json({ error: UNMIGRATED_MSG }, { status: 503 });
    if (error) return NextResponse.json({ error: "Failed to load your pickups." }, { status: 500 });

    // ilike is a PATTERN match, and `%`/`_` are legal in the local part of an
    // address — so the query alone would let a crafted "email" match somebody
    // else's pickups. The exact comparison below is what actually scopes this to
    // one person; the query is only the index-friendly narrowing.
    const pickups = (data || [])
      .filter((row: any) => clean(row.grabbed_by_email).toLowerCase() === email)
      .map((row: any) => ({
        id: row.id,
        item_id: row.item_id,
        item_name: row.item_name,
        quantity: row.quantity as number,
        quantity_returned: (row.quantity_returned || 0) as number,
        outstanding: grabOutstanding(row),
        components: normalizeComponents(row.components),
        packaging_kit: clean(row.packaging_kit) || null,
        kit_label: packagingKitLabel(row.packaging_kit),
        grabbed_by_name: clean(row.grabbed_by_name),
        created_at: row.created_at,
      }))
      .filter((p) => p.outstanding > 0);

    return NextResponse.json({ pickups });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to load your pickups." }, { status: 500 });
  }
}

type ReturnLine = { grab_id: string; quantity: number; components: PackagingRole[] };

function parseReturns(body: Record<string, unknown>): ReturnLine[] {
  const raw = Array.isArray(body.returns) ? (body.returns as unknown[]) : [body];
  const lines: ReturnLine[] = [];
  for (const r of raw) {
    const o = (r || {}) as Record<string, unknown>;
    const id = clean(o.grab_id);
    const qty = Math.floor(Number(o.quantity));
    if (!id || !Number.isFinite(qty) || qty <= 0) continue;
    const components = normalizeComponents(o.components);
    const existing = lines.find((l) => l.grab_id === id);
    if (existing) {
      existing.quantity += qty;
      existing.components = normalizeComponents([...existing.components, ...components]);
    } else {
      lines.push({ grab_id: id, quantity: qty, components });
    }
  }
  return lines;
}

type ReturnResult =
  | {
      ok: true;
      item_name: string;
      quantity: number;
      remaining: number;
      kit: string | null;
      components: PackagingRole[];
    }
  | { ok: false; item_name: string; quantity: number; error: string };

// Put one pickup's units back. The pickup row is the guard: the update is
// conditioned on the quantity_returned we read, so two people (or two taps)
// racing the same pickup can't return the same units twice.
async function returnOne(
  line: ReturnLine,
  who: { name: string; email: string; ip: string },
  pools: PackagingPools
): Promise<ReturnResult> {
  const { data: grab, error: grabErr } = await supabaseAdmin
    .from("marketing_item_grabs")
    .select("id,item_id,item_name,quantity,quantity_returned,components,packaging_kit,grabbed_by_email")
    .eq("id", line.grab_id)
    .maybeSingle();
  if (isUnmigrated(grabErr)) return { ok: false, item_name: "", quantity: line.quantity, error: UNMIGRATED_MSG };
  if (!grab) return { ok: false, item_name: "", quantity: line.quantity, error: "That pickup no longer exists." };

  const itemName = clean((grab as any).item_name);
  // Only the person who took it can put it back — the lookup is by email, and
  // this stops a guessed pickup id from crediting someone else's history.
  if (clean((grab as any).grabbed_by_email).toLowerCase() !== who.email.toLowerCase()) {
    return { ok: false, item_name: itemName, quantity: line.quantity, error: "That pickup isn't yours." };
  }

  const alreadyReturned = ((grab as any).quantity_returned || 0) as number;
  const outstanding = grabOutstanding(grab as any);
  if (outstanding <= 0) {
    return { ok: false, item_name: itemName, quantity: line.quantity, error: "Already returned in full." };
  }
  if (line.quantity > outstanding) {
    return {
      ok: false,
      item_name: itemName,
      quantity: line.quantity,
      error: `You only have ${outstanding} of those out.`,
    };
  }

  // Claim the units on the pickup row first: if this update loses a race it
  // affects 0 rows and nothing else has happened yet.
  const { data: claimed } = await supabaseAdmin
    .from("marketing_item_grabs")
    .update({ quantity_returned: alreadyReturned + line.quantity })
    .eq("id", line.grab_id)
    .eq("quantity_returned", alreadyReturned)
    .select("id")
    .maybeSingle();
  if (!claimed) {
    return { ok: false, item_name: itemName, quantity: line.quantity, error: "That pickup just changed — try again." };
  }

  // Only pieces that actually went out with this pickup can come back with it,
  // and only into the series it recorded taking them from.
  const kit = clean((grab as any).packaging_kit) || null;
  const forKit = kitPools(pools, kit);
  const components = normalizeComponents(line.components, normalizeComponents((grab as any).components));

  // Put the units back on the item. A deleted item (item_id null) still logs the
  // return — the drop-off happened — there's just no count left to credit.
  const itemId = clean((grab as any).item_id) || null;
  let remaining = 0;
  let restored = !itemId; // nothing to restore is not a failure
  if (itemId) {
    for (let attempt = 0; attempt < 4; attempt++) {
      const { data: item } = await supabaseAdmin
        .from("marketing_inventory_items")
        .select("quantity_available")
        .eq("id", itemId)
        .maybeSingle();
      if (!item) {
        restored = true; // the item is gone; log the drop-off and move on
        break;
      }
      const avail = (item as any).quantity_available as number;
      const moved = await returnStock(itemId, line.quantity, avail);
      if (moved.ok) {
        remaining = moved.available;
        restored = true;
        break;
      }
    }
  }

  // The count never moved, so give the units back to the pickup rather than
  // recording a return that restocked nothing — otherwise they'd be lost to
  // both the shelf and the person's outstanding list.
  if (!restored) {
    await supabaseAdmin
      .from("marketing_item_grabs")
      .update({ quantity_returned: alreadyReturned })
      .eq("id", line.grab_id)
      .eq("quantity_returned", alreadyReturned + line.quantity);
    return { ok: false, item_name: itemName, quantity: line.quantity, error: "Stock is busy — try again." };
  }

  for (const key of components) await adjustPoolStock(forKit[key]?.id, line.quantity);

  await supabaseAdmin.from("marketing_item_returns").insert({
    grab_id: line.grab_id,
    item_id: itemId,
    item_name: itemName,
    quantity: line.quantity,
    components,
    packaging_kit: components.length ? kit : null,
    returned_by_name: who.name,
    returned_by_email: who.email,
    ip: who.ip,
  });

  return { ok: true, item_name: itemName, quantity: line.quantity, remaining, kit, components };
}

// POST — record one or more returns.
export async function POST(req: Request) {
  try {
    const ip = clientIp(req);
    if (rateLimited(ip)) {
      return NextResponse.json({ error: "Too many requests too fast — try again in a minute." }, { status: 429 });
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

    const lines = parseReturns(body);
    if (!lines.length) return NextResponse.json({ error: "Set how many you're bringing back." }, { status: 400 });
    if (lines.length > 100) return NextResponse.json({ error: "Too many items at once." }, { status: 400 });

    const pools = await getPackagingPools();

    const results: ReturnResult[] = [];
    for (const line of lines) results.push(await returnOne(line, { name, email, ip }, pools));

    const returned = results.filter((r): r is Extract<ReturnResult, { ok: true }> => r.ok);
    const failed = results.filter((r): r is Extract<ReturnResult, { ok: false }> => !r.ok);

    if (returned.length) {
      void notifyReturn({
        by: name,
        email,
        items: returned.map((r) => ({
          name: r.item_name,
          quantity: r.quantity,
          remaining: r.remaining,
          components: r.components,
          kit: r.kit,
        })),
      });
    }

    if (!returned.length) {
      return NextResponse.json(
        { error: failed[0]?.error || "Couldn't record that return.", results },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        ok: true,
        returned: returned.map((r) => ({
          item_name: r.item_name,
          quantity: r.quantity,
          remaining: r.remaining,
          components: r.components,
          kit: r.kit,
        })),
        failed: failed.map((f) => ({ item_name: f.item_name, quantity: f.quantity, error: f.error })),
      },
      { status: 201 }
    );
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to record return." }, { status: 500 });
  }
}
