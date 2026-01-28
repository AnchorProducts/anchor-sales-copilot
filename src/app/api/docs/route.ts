// src/app/api/docs/route.ts
import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type DocType =
  | "sales_sheet"
  | "data_sheet"
  | "product_data_sheet"
  | "install_manual"
  | "install_sheet"
  | "install_video"
  | "cad_dwg"
  | "cad_step"
  | "product_drawing"
  | "product_image"
  | "render"
  | "asset"
  | "unknown";

type DocOut = {
  title: string;
  doc_type: DocType;
  path: string;
  url: string | null;
  excerpt?: string;
};

/* ---------------------------------------------
   Helpers
--------------------------------------------- */

function normalizePathInput(s: string) {
  return decodeURIComponent((s || "").trim()).replace(/^\/+/, "").replace(/\/+$/, "");
}

function extOf(path: string) {
  const m = path.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : "";
}

function baseName(path: string) {
  const last = path.split("/").pop() || path;
  return last.replace(/\.[a-z0-9]+$/i, "");
}

function titleCaseWords(s: string) {
  return s
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function humanizeDocNameFromFile(path: string) {
  const b = baseName(path).toLowerCase();

  if (b.includes("sales-sheet")) return "Sales Sheet";
  if (b.includes("product-data-sheet")) return "Product Data Sheet";
  if (b.includes("data-sheet")) return "Data Sheet";
  if (b.includes("install-manual")) return "Install Manual";
  if (b.includes("install-sheet")) return "Install Sheet";
  if (b.includes("install-video")) return "Install Video";
  if (b.includes("product-drawing")) return "Product Drawing";
  if (b.includes("product-image")) return "Product Image";
  if (b.includes("render")) return "Render";
  if (b === "cad") return "CAD";

  return titleCaseWords(b.replace(/[-_]+/g, " "));
}

function docTypeFromPath(path: string): DocType {
  const p = path.toLowerCase();
  const e = extOf(p);

  if (p.includes("sales-sheet")) return "sales_sheet";
  if (p.includes("product-data-sheet")) return "product_data_sheet";
  if (p.includes("data-sheet")) return "data_sheet";
  if (p.includes("install-manual")) return "install_manual";
  if (p.includes("install-sheet")) return "install_sheet";
  if (p.includes("install-video") || ["mp4", "mov", "webm"].includes(e)) return "install_video";

  if (p.endsWith(".dwg")) return "cad_dwg";
  if (p.endsWith(".step") || p.endsWith(".stp")) return "cad_step";

  if (p.includes("product-drawing")) return "product_drawing";
  if (p.includes("product-image") || ["png", "jpg", "jpeg", "webp"].includes(e)) return "product_image";
  if (p.includes("render")) return "render";

  if (e === "pdf") return "asset";

  return "unknown";
}

function titleFromPath(path: string) {
  const parts = path.split("/").filter(Boolean);
  const docName = humanizeDocNameFromFile(path);

  const parent = parts.length >= 2 ? parts[parts.length - 2] : "";
  const niceParent = parent ? titleCaseWords(parent.replace(/[-_]+/g, " ")) : "";

  if (niceParent) return `${niceParent} — ${docName}`;
  return docName;
}

function cleanExcerpt(text: string, maxLen: number) {
  const t = (text || "").replace(/\s+/g, " ").replace(/\u0000/g, "").trim();
  if (!t) return "";
  return t.length > maxLen ? t.slice(0, maxLen).trim() : t;
}

async function extractTextFromStoragePath(path: string, maxLen: number) {
  const e = extOf(path);
  if (!["txt", "md"].includes(e)) return "";

  const { data, error } = await supabaseAdmin.storage.from("knowledge").download(path);
  if (error || !data) return "";

  const arrayBuf = await data.arrayBuffer();
  const buf = Buffer.from(arrayBuf);

  try {
    return cleanExcerpt(buf.toString("utf8"), maxLen);
  } catch {
    return "";
  }
}

async function signUrlsForPaths(paths: string[], expiresIn: number, withText: boolean, excerptLen: number) {
  const out: DocOut[] = [];

  for (const p of paths) {
    const doc_type = docTypeFromPath(p);
    const title = titleFromPath(p);

    let url: string | null = null;
    const { data, error } = await supabaseAdmin.storage.from("knowledge").createSignedUrl(p, expiresIn);
    if (!error) url = data?.signedUrl ?? null;

    const doc: DocOut = { title, doc_type, path: p, url };

    if (withText) {
      doc.excerpt = await extractTextFromStoragePath(p, excerptLen);
    }

    out.push(doc);
  }

  return out;
}

/**
 * Fast path listing via Postgres: storage.objects
 * Requires service role (supabaseAdmin).
 */
async function listPathsViaDb(opts: {
  prefix?: string;
  q?: string;
  page: number;
  limit: number;
}) {
  const { prefix, q, page, limit } = opts;

  const from = supabaseAdmin.schema("storage").from("objects");

  // Base filter
  let query = from.select("name", { count: "exact" }).eq("bucket_id", "knowledge");

  // Prefix filter
  if (prefix) {
    const p = normalizePathInput(prefix);
    // Like 'anchor/u-anchors/u3400/epdm/%'
    query = query.like("name", `${p}%`);
  }

  // Simple name search
  if (q) {
    const qq = String(q).toLowerCase().trim();
    if (qq) query = query.ilike("name", `%${qq}%`);
  }

  const offset = page * limit;
  const { data, error, count } = await query
    .order("name", { ascending: true })
    .range(offset, offset + limit - 1);

  if (error) throw error;

  const names = (data || []).map((r: any) => String(r?.name || "")).filter(Boolean);
  return { names, total: count ?? names.length };
}

/**
 * Convenience: build folder from structured params
 * product=u-anchors&model=u3400&membrane=epdm -> anchor/u-anchors/u3400/epdm/
 */
function folderFromStructuredParams(sp: URLSearchParams) {
  const product = (sp.get("product") || "").trim().toLowerCase();
  const model = (sp.get("model") || "").trim().toLowerCase();
  const membrane = (sp.get("membrane") || "").trim().toLowerCase();

  if (!product) return "";

  // only one product for now, but keep it extensible
  if (product === "u-anchors" || product === "u-anchor" || product === "uanchor" || product === "uanchors") {
    let folder = "anchor/u-anchors/";
    if (model) folder += `${model}/`;
    if (membrane) folder += `${membrane}/`;
    return folder;
  }

  return "";
}

/* ---------------------------------------------
   Handler
--------------------------------------------- */

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    // Inputs
    const folderRaw = searchParams.get("folder");
    const qRaw = searchParams.get("q");

    const withText = searchParams.get("withText") === "1";
    const excerptLen = Math.min(2000, Math.max(200, Number(searchParams.get("excerptLen") || 700)));

    const page = Math.max(0, Number(searchParams.get("page") || 0));
    const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit") || 20)));

    // Build folder (priority: explicit folder, else structured params)
    const structuredFolder = folderFromStructuredParams(searchParams);
    const folder = folderRaw ? normalizePathInput(folderRaw) : structuredFolder;

    const q = qRaw ? decodeURIComponent(qRaw).trim() : "";

    // ✅ List paths from DB
    const { names, total } = await listPathsViaDb({
      prefix: folder || undefined,
      q: q || undefined,
      page,
      limit,
    });

    const docs = await signUrlsForPaths(names, 60 * 30, withText, excerptLen);

    return NextResponse.json({
      docs,
      page,
      limit: docs.length,
      total,
      hasMore: (page + 1) * limit < total,
      folder: folder || "",
      q: q || "",
    });
  } catch (e: any) {
    return NextResponse.json({ docs: [], error: e?.message || "Unknown error" }, { status: 500 });
  }
}
