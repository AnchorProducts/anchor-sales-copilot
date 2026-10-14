// Server-only. Signed storage links that are REUSED, and optionally RESIZED.
//
// WHY. Every bucket this app reads is private, so files go out through signed
// URLs — and a signed URL carries a fresh token each time it is signed. Signing
// per request therefore meant a new address per request, and a browser can only
// reuse a file it already has when the address is the same. So every list load,
// every poll, every reopened document downloaded its files again. That is
// Supabase cached egress, and in Oct 2026 the shared project (this app and the
// anchorp.com site) went over its quota.
//
// REUSE. A link is kept and handed back until less than a quarter of its life
// is left, then signed afresh. Kept in this server instance's memory: no table,
// no migration. Vercel keeps instances warm across many requests, so most
// requests get a link already issued; a cold instance just signs a new one,
// exactly as before.
//
// RESIZE. `width` asks Supabase's image transformer for a smaller copy — a
// 5 MB phone photo comes back at a few hundred KB — for places that only ever
// show a thumbnail. Only for raster images; anything else is signed as-is,
// since the transformer would refuse it.

import { supabaseAdmin } from "@/lib/supabaseAdmin";

type Kept = { url: string; expiresAt: number };

const kept = new Map<string, Kept>();
const MAX_KEPT = 5000;

const RESIZABLE = /\.(jpe?g|png|webp)$/i;

export type SignOptions = {
  /** Lifetime of a link, in seconds. Reused while more than a quarter remains. */
  ttl?: number;
  /** Thumbnail width in px. Ignored for files that are not raster images. */
  width?: number;
};

function keyFor(bucket: string, path: string, width?: number) {
  return `${bucket}|${path}|${width ?? ""}`;
}

function remember(key: string, url: string, ttl: number) {
  if (kept.size >= MAX_KEPT) {
    // Oldest first: a Map iterates in insertion order.
    const oldest = kept.keys().next().value;
    if (oldest !== undefined) kept.delete(oldest);
  }
  kept.set(key, { url, expiresAt: Date.now() + ttl * 1000 });
}

function reusable(key: string, ttl: number): string | null {
  const k = kept.get(key);
  if (!k) return null;
  if (k.expiresAt - Date.now() > (ttl * 1000) / 4) return k.url;
  kept.delete(key);
  return null;
}

/** A signed link to one file, reused while it has life left. Null on error. */
export async function signStorageUrl(
  bucket: string,
  path: string | null | undefined,
  opts: SignOptions = {}
): Promise<string | null> {
  const p = String(path ?? "").trim();
  if (!p) return null;
  const ttl = opts.ttl ?? 60 * 60;
  const width = opts.width && RESIZABLE.test(p) ? opts.width : undefined;
  const key = keyFor(bucket, p, width);

  const hit = reusable(key, ttl);
  if (hit) return hit;

  const { data, error } = await supabaseAdmin.storage
    .from(bucket)
    // resize: "contain" is required: with a width alone the transformer defaults
    // to "cover" at the ORIGINAL height, so a 4032x3024 photo came back as a
    // 480x4032 sliver. "contain" scales it down whole (480x640).
    .createSignedUrl(p, ttl, width ? { transform: { width, quality: 70, resize: "contain" } } : undefined);
  if (error || !data?.signedUrl) return null;
  remember(key, data.signedUrl, ttl);
  return data.signedUrl;
}

/** Several at once. Missing or failed paths come back as null, in order. */
export async function signStorageUrls(
  bucket: string,
  paths: (string | null | undefined)[],
  opts: SignOptions = {}
): Promise<(string | null)[]> {
  return Promise.all(paths.map((p) => signStorageUrl(bucket, p, opts)));
}
