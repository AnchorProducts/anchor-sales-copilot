// src/app/api/public/library/route.ts
//
// PUBLIC, read-only feed of the Resource Library for external surfaces
// (e.g. the Webflow marketing site). Reads live from the same `knowledge`
// storage bucket the app uses, so the website is always in sync.
//
// Safety: only files under solutions/ are exposed, internal/test/pricebook
// paths are filtered out (same rule as /api/knowledge-list), and any file
// whose knowledge_documents row is marked internal-only or not allowed is
// also excluded. No auth — but it only ever returns public documents.

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "knowledge";
const PAGE_SIZE = 1000;
// Signed URLs are regenerated on every request, so a modest lifetime is fine.
const SIGNED_URL_TTL = 60 * 60; // 1 hour

type StorageEntry = { name: string; id?: string | null; metadata?: any | null };

// --- CORS ----------------------------------------------------------------
// The Webflow site lives on a different origin, so the browser needs CORS to
// fetch this endpoint. Set WEBFLOW_ALLOWED_ORIGINS (comma-separated) to lock
// it to your domain(s); falls back to "*" since the data is public anyway.
function corsHeaders(origin: string | null) {
  const allow = (process.env.WEBFLOW_ALLOWED_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  let allowOrigin = "*";
  if (allow.length > 0) {
    allowOrigin = origin && allow.includes(origin) ? origin : allow[0];
  }

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Cache-Control": "public, max-age=300", // 5 min CDN/browser cache
    Vary: "Origin",
  };
}

function cleanPrefix(p: string) {
  return String(p || "").trim().replace(/^\/+|\/+$/g, "");
}

function isInternalPath(path: string) {
  const p = String(path || "").toLowerCase();
  return (
    p.includes("/internal/") ||
    p.startsWith("internal/") ||
    p.includes("/pricebook/") ||
    p.includes("/test/") ||
    p.includes("/test-reports/")
  );
}

function basename(p: string) {
  const s = String(p || "");
  const i = s.lastIndexOf("/");
  return i >= 0 ? s.slice(i + 1) : s;
}

function titleFromPath(p: string) {
  return basename(p)
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase())
    .trim();
}

function extOf(p: string) {
  const m = basename(p).match(/\.([a-z0-9]+)$/i);
  return m ? m[1].toLowerCase() : "";
}

function parentSolutionSlug(p: string) {
  // solutions/<slug>/...  →  <slug>
  const m = p.match(/^solutions\/([^/]+)/i);
  return m ? m[1].toLowerCase() : "";
}

async function listRecursive(prefix: string): Promise<string[]> {
  const root = cleanPrefix(prefix);
  if (!root) return [];

  const out: string[] = [];
  const queue: string[] = [root];
  const seen = new Set<string>();

  while (queue.length) {
    const dir = queue.shift()!;
    if (seen.has(dir)) continue;
    seen.add(dir);

    let offset = 0;
    for (;;) {
      const { data, error } = await supabaseAdmin.storage
        .from(BUCKET)
        .list(dir, { limit: PAGE_SIZE, offset, sortBy: { column: "name", order: "asc" } });
      if (error) break;
      const entries = (data || []) as StorageEntry[];
      if (!entries.length) break;

      for (const e of entries) {
        const name = String(e?.name || "").trim();
        if (!name) continue;
        const fullPath = `${dir}/${name}`;
        const isFolder = !e.id && (!e.metadata || Object.keys(e.metadata).length === 0);
        if (isFolder) queue.push(fullPath);
        else out.push(fullPath);
      }

      if (entries.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }
  }

  return Array.from(new Set(out)).sort();
}

export async function OPTIONS(req: Request) {
  return new NextResponse(null, { status: 204, headers: corsHeaders(req.headers.get("origin")) });
}

export async function GET(req: Request) {
  const headers = corsHeaders(req.headers.get("origin"));

  try {
    // 1) Every file under the public roots, minus internal/test/pricebook paths.
    const roots = ["solutions", "anchor/u-anchors", "spec"];
    const nested = await Promise.all(roots.map((r) => listRecursive(r)));
    const allPaths = Array.from(new Set(nested.flat())).sort();
    let libraryPaths = allPaths.filter((p) => !isInternalPath(p));

    // 2) Pull matching knowledge_documents rows so we can use real titles /
    //    categories AND enforce an extra safety gate: never surface a file
    //    that has been explicitly marked internal-only or not allowed.
    const kdRows: Record<string, any> = {};
    if (libraryPaths.length > 0) {
      const { data } = await supabaseAdmin
        .from("knowledge_documents")
        .select("title,category,audience,allowed,source_path,updated_at")
        .in("source_path", libraryPaths);
      for (const r of (data || []) as any[]) kdRows[String(r.source_path)] = r;
    }

    libraryPaths = libraryPaths.filter((p) => {
      const kd = kdRows[p];
      if (!kd) return true; // un-indexed solutions/ files follow path-based public rule
      const audience = String(kd.audience || "").toLowerCase();
      if (audience === "internal") return false;
      if (kd.allowed === false) return false;
      return true;
    });

    // 3) Map storage slugs to friendly product names for grouping on the site.
    const slugSet = new Set(libraryPaths.map(parentSolutionSlug).filter(Boolean));
    const productsBySlug: Record<string, string> = {};
    if (slugSet.size > 0) {
      const { data: prods } = await supabaseAdmin
        .from("products")
        .select("name")
        .eq("section", "solution");
      for (const r of (prods || []) as any[]) {
        const slug = String(r?.name || "")
          .toLowerCase()
          .trim()
          .replace(/&/g, "and")
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "");
        if (slug && slugSet.has(slug)) productsBySlug[slug] = r.name;
      }
    }

    // 4) Sign fresh download URLs in one batch and compose the response.
    const signed = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrls(libraryPaths, SIGNED_URL_TTL);

    const urlByPath: Record<string, string | null> = {};
    for (const s of (signed.data || []) as any[]) {
      if (s?.path) urlByPath[String(s.path)] = s?.signedUrl ?? null;
    }

    const documents = libraryPaths.map((p) => {
      const kd = kdRows[p] || null;
      const slug = parentSolutionSlug(p);
      return {
        path: p,
        filename: basename(p),
        title: kd?.title || titleFromPath(p),
        type: extOf(p),
        category: kd?.category || null,
        solution: productsBySlug[slug] || slug || null,
        solution_slug: slug || null,
        url: urlByPath[p] ?? null,
        updated_at: kd?.updated_at || null,
      };
    });

    return NextResponse.json(
      { documents, count: documents.length, expires_in: SIGNED_URL_TTL },
      { status: 200, headers },
    );
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500, headers });
  }
}
