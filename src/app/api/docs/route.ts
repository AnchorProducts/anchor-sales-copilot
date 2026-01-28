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
  excerpt?: string; // optional
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

function buildSearchTokens(q: string) {
  const STOP = new Set([
    "doc",
    "docs",
    "document",
    "documents",
    "pdf",
    "file",
    "files",
    "sheet",
    "sheets",
    "sales",
    "data",
    "submittal",
    "spec",
    "specs",
    "details",
    "manual",
    "manuals",
    "install",
    "installation",
    "instructions",
    "drawing",
    "drawings",
    "render",
    "image",
    "images",
    "cad",
    "dwg",
    "step",
    "stp",
  ]);

  const raw = (q || "").toLowerCase().trim();
  if (!raw) return [];

  const tokens = raw
    .replace(/[^a-z0-9\-\/]+/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .filter((t) => t.length >= 2 && !STOP.has(t));

  const extra: string[] = [];
  if (raw.includes("u anchor")) extra.push("u-anchor");
  if (raw.includes("u-anchor")) extra.push("u anchor");
  if (raw.includes("camera mount")) extra.push("camera-mount");
  if (raw.includes("light mount")) extra.push("light-mount");
  if (raw.includes("hvac")) extra.push("hvac");

  const out = Array.from(new Set([...tokens, ...extra])).filter(Boolean);
  return out.length ? out : [raw];
}

/**
 * Recursively list all file paths in a bucket (optionally within a prefix folder).
 */
async function listAllPathsRecursive(bucket: string, startPrefix?: string) {
  const storage = supabaseAdmin.storage.from(bucket);

  const root = normalizePathInput(startPrefix || "");
  const queue: string[] = [root];
  const files: string[] = [];

  while (queue.length) {
    const prefix = queue.shift() ?? "";
    const { data, error } = await storage.list(prefix || "", {
      limit: 1000,
      sortBy: { column: "name", order: "asc" },
    });

    if (error) continue;

    for (const item of data || []) {
      const name = item.name;
      const full = prefix ? `${prefix}/${name}` : name;

      // Supabase list returns folders without metadata (and no extension)
      const isFolder = !item.metadata && !extOf(name);
      if (isFolder) queue.push(full);
      else files.push(full);
    }
  }

  return files;
}

/* ---------------------------------------------
   Text extraction (NO pdf/docx deps)
   - We only extract txt + md
   - pdf/docx returns empty string to avoid build-time deps
--------------------------------------------- */

function cleanExcerpt(text: string, maxLen: number) {
  const t = (text || "")
    .replace(/\s+/g, " ")
    .replace(/\u0000/g, "")
    .trim();
  if (!t) return "";
  return t.length > maxLen ? t.slice(0, maxLen).trim() : t;
}

async function extractTextFromStoragePath(path: string, maxLen: number) {
  const e = extOf(path);

  // Only extract from txt/md to keep builds dependency-free
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

/* ---------------------------------------------
   Signing + output
--------------------------------------------- */

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

/* ---------------------------------------------
   Handler
--------------------------------------------- */

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);

    const folderRaw = searchParams.get("folder");
    const qRaw = searchParams.get("q");
    const all = searchParams.get("all") === "1";

    const withText = searchParams.get("withText") === "1";
    const excerptLen = Math.min(2000, Math.max(200, Number(searchParams.get("excerptLen") || 700)));

    const page = Math.max(0, Number(searchParams.get("page") || 0));
    const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit") || 20)));
    const offset = page * limit;

    const folder = folderRaw ? normalizePathInput(folderRaw) : "";
    const q = qRaw ? decodeURIComponent(qRaw).trim() : "";

    let paths: string[] = [];

    if (folder) {
      paths = await listAllPathsRecursive("knowledge", folder);
    } else if (q) {
      const allPaths = await listAllPathsRecursive("knowledge", "");
      const tokens = buildSearchTokens(q).map((t) => t.toLowerCase());
      paths = allPaths.filter((p) => {
        const lp = p.toLowerCase();
        return tokens.some((t) => lp.includes(t));
      });
    } else if (all) {
      paths = await listAllPathsRecursive("knowledge", "");
    } else {
      const allPaths = await listAllPathsRecursive("knowledge", "");
      allPaths.sort((a, b) => a.localeCompare(b));
      const slice = allPaths.slice(0, limit);

      const docs = await signUrlsForPaths(slice, 60 * 30, withText, excerptLen);

      return NextResponse.json({
        docs,
        page: 0,
        limit: docs.length,
        total: allPaths.length,
        hasMore: allPaths.length > limit,
      });
    }

    paths.sort((a, b) => a.localeCompare(b));
    const total = paths.length;
    const slice = paths.slice(offset, offset + limit);

    const docs = await signUrlsForPaths(slice, 60 * 30, withText, excerptLen);

    return NextResponse.json({
      docs,
      page,
      limit,
      total,
      hasMore: offset + limit < total,
    });
  } catch (e: any) {
    return NextResponse.json({ docs: [], error: e?.message || "Unknown error" }, { status: 500 });
  }
}
