import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { ingestStorageFile } from "@/lib/knowledge/ingestStorageFile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BUCKET = "knowledge";
const PAGE_SIZE = 1000;

// The same public roots the Webflow /api/public/doc link accepts. A file can
// only be replaced here if it already lives under one of these, so a stale
// path can never be used to smuggle a new file into a non-public location.
const PUBLIC_PREFIXES = ["solutions/", "anchor/u-anchors/", "spec/"];

type StorageEntry = { name: string; id?: string | null; metadata?: any | null };

function cleanPrefix(p: string) {
  return String(p || "").trim().replace(/^\/+|\/+$/g, "");
}

function cleanPath(p: string) {
  return String(p || "")
    .trim()
    .replace(/^\/+/, "")
    .replace(/\\/g, "/");
}

// A path may be replaced only if it lives under a public root, has no
// directory traversal, and isn't an internal/test/pricebook path — the same
// gate /api/public/doc uses to decide what it will serve.
function isPublicServable(path: string) {
  if (!path) return false;
  if (path.includes("..")) return false;
  const lower = path.toLowerCase();
  if (!PUBLIC_PREFIXES.some((pre) => lower.startsWith(pre))) return false;
  if (isInternalPath(path)) return false;
  return true;
}

// True only if a storage object already exists at exactly this path. Replace
// must never create a new file — it can only overwrite an existing library
// item so the Webflow link that points at it keeps resolving.
async function storageFileExists(path: string): Promise<boolean> {
  const slash = path.lastIndexOf("/");
  const dir = slash >= 0 ? path.slice(0, slash) : "";
  const name = slash >= 0 ? path.slice(slash + 1) : path;
  if (!name) return false;
  const { data, error } = await supabaseAdmin.storage
    .from(BUCKET)
    .list(dir, { limit: PAGE_SIZE, search: name });
  if (error || !data) return false;
  return data.some((e: any) => String(e?.name) === name);
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
    // Page through the directory.
    for (;;) {
      const { data, error } = await supabaseAdmin.storage
        .from(BUCKET)
        .list(dir, { limit: PAGE_SIZE, offset, sortBy: { column: "name", order: "asc" } });
      if (error) break;
      const entries = (data || []) as StorageEntry[];
      if (!entries.length) break;

      for (const e of entries) {
        const fullPath = `${dir}/${e.name}`;
        const isFolder = !e.id && (!e.metadata || Object.keys(e.metadata).length === 0);
        if (isFolder) {
          queue.push(fullPath);
        } else {
          out.push(fullPath);
        }
      }

      if (entries.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }
  }

  return Array.from(new Set(out)).sort();
}

async function requireAdmin() {
  const supabase = await supabaseRoute();
  const { data: auth, error } = await supabase.auth.getUser();
  if (error || !auth?.user) return { error: "Unauthorized", status: 401 as const };

  const { data: prof } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", auth.user.id)
    .maybeSingle();

  const role = String((prof as any)?.role || "");
  if (role !== "admin" && role !== "anchor_rep") {
    return { error: "Forbidden", status: 403 as const };
  }
  return { user: auth.user, role };
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

function parentSolutionSlug(p: string) {
  // solutions/<slug>/...  →  <slug>
  const m = p.match(/^solutions\/([^/]+)/i);
  return m ? m[1].toLowerCase() : "";
}

export async function GET() {
  const gate = await requireAdmin();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  // 1) Walk the Resource Library: every file under solutions/, no internal/test/pricebook.
  const allPaths = await listRecursive("solutions");
  const libraryPaths = allPaths.filter((p) => !isInternalPath(p));

  // 2) Map storage parent slugs to product names so the admin sees a friendly
  //    parent ("Existing Mechanical Tie Down") instead of a slug.
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

  // 3) Look up matching knowledge_documents rows in a single query so admin
  //    actions (status / allowed) work for files that have been ingested.
  let kdRows: Record<string, any> = {};
  if (libraryPaths.length > 0) {
    const { data } = await supabaseAdmin
      .from("knowledge_documents")
      .select("id,title,status,allowed,audience,source_path,category,updated_at,created_at")
      .in("source_path", libraryPaths);
    for (const r of (data || []) as any[]) kdRows[String(r.source_path)] = r;
  }

  // 4) Compose the final list.
  const items = libraryPaths.map((p) => {
    const kd = kdRows[p] || null;
    const slug = parentSolutionSlug(p);
    return {
      path: p,
      filename: basename(p),
      title: kd?.title || titleFromPath(p),
      product_name: productsBySlug[slug] || slug || null,
      knowledge_document_id: kd?.id || null,
      status: kd?.status || null,
      allowed: kd?.allowed ?? null,
      category: kd?.category || null,
      indexed: !!kd,
      updated_at: kd?.updated_at || null,
      created_at: kd?.created_at || null,
    };
  });

  return NextResponse.json({ items });
}

// POST — replace the file behind an existing library item, in place.
//
// The Webflow CMS links point at /api/public/doc?path=<path>, which always
// resolves to whatever object currently lives at <path>. So to update a doc
// "everywhere it's linked" we overwrite the bytes at the SAME path (upsert)
// rather than uploading under a new name. Two-phase, matching the rest of the
// app's uploads so large files never hit Vercel's ~4.5MB body cap:
//   { phase: "sign",   path }  → { path, token, signedUrl }  (upload bytes to Supabase)
//   { phase: "commit", path }  → re-ingests so the copilot's RAG stays in sync
export async function POST(req: Request) {
  const gate = await requireAdmin();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const body = await req.json().catch(() => null);
  const phase = String(body?.phase || "").trim();
  const path = cleanPath(String(body?.path || ""));

  if (!path) return NextResponse.json({ error: "Missing path" }, { status: 400 });
  if (!isPublicServable(path)) {
    return NextResponse.json({ error: "That path can't be replaced here." }, { status: 400 });
  }
  if (!(await storageFileExists(path))) {
    return NextResponse.json(
      { error: "No existing file at that path to replace." },
      { status: 404 },
    );
  }

  // ── Phase 1: mint a signed upload URL bound to the existing path ──────────
  if (phase === "sign") {
    const { data, error } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUploadUrl(path, { upsert: true });

    if (error || !data) {
      return NextResponse.json(
        { error: error?.message || "Could not create upload URL" },
        { status: 500 },
      );
    }
    return NextResponse.json({ path, token: data.token, signedUrl: data.signedUrl });
  }

  // ── Phase 2: re-index the freshly overwritten file ───────────────────────
  // ingestStorageFile is idempotent: it drops prior chunks for this source_path
  // and re-inserts, so the chatbot answers from the new content and the row's
  // updated_at refreshes. Non-text files (PDF/xlsx/images) short-circuit inside
  // the helper — the storage swap alone already updates the public link.
  if (phase === "commit") {
    let ingested: any = null;
    try {
      const { data: kd } = await supabaseAdmin
        .from("knowledge_documents")
        .select("title,category")
        .eq("source_path", path)
        .maybeSingle();
      ingested = await ingestStorageFile({
        path,
        title: String((kd as any)?.title || basename(path)),
        category: (kd as any)?.category ?? null,
        productTags: [],
        createdBy: gate.user.id,
      });
    } catch (err) {
      console.warn("[library-docs/replace] ingestion failed:", err);
    }
    return NextResponse.json({ path, ingested });
  }

  return NextResponse.json({ error: "Unknown phase" }, { status: 400 });
}
