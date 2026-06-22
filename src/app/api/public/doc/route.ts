// src/app/api/public/doc/route.ts
//
// Permanent, public download link for a single Resource Library file.
//
//   GET /api/public/doc?path=solutions/u-anchor-2000/u2000-sales-sheet.pdf
//     → 302 redirect to a fresh signed URL for that file in the knowledge bucket.
//
// Why this exists: signed Supabase URLs expire, so they can't be pasted into a
// Webflow CMS "download link" field. This endpoint gives every public file a
// STABLE url that always resolves to the current file — so the marketing site's
// existing Resource Library design stays untouched and just points its links here.
//
// Safety: only files under solutions/ are servable, and internal/test/pricebook
// paths are always refused — the same public/internal rule the app uses.

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "knowledge";
const SIGNED_URL_TTL = 60 * 5; // 5 min — only needs to outlive the redirect

function cleanPath(p: string) {
  return String(p || "")
    .trim()
    .replace(/^\/+/, "") // no leading slash
    .replace(/\\/g, "/");
}

function isInternalPath(path: string) {
  const p = path.toLowerCase();
  return (
    p.includes("/internal/") ||
    p.startsWith("internal/") ||
    p.includes("/pricebook/") ||
    p.includes("/test/") ||
    p.includes("/test-reports/")
  );
}

// Top-level folders whose files may be served publicly. Everything else in the
// bucket (internal/, marketing-orders/, …) is refused.
const PUBLIC_PREFIXES = ["solutions/", "anchor/u-anchors/", "spec/"];

// A path is publicly servable only if it lives under a public prefix, contains
// no directory traversal, and isn't an internal/test/pricebook path.
function isPublicServable(path: string) {
  if (!path) return false;
  if (path.includes("..")) return false;
  const lower = path.toLowerCase();
  if (!PUBLIC_PREFIXES.some((pre) => lower.startsWith(pre))) return false;
  if (isInternalPath(path)) return false;
  return true;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const path = cleanPath(url.searchParams.get("path") || "");

  if (!isPublicServable(path)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL, { download: url.searchParams.has("download") });

  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // 302 so the link stays permanent while the signed target rotates each click.
  return NextResponse.redirect(data.signedUrl, {
    status: 302,
    headers: { "Cache-Control": "no-store" },
  });
}
