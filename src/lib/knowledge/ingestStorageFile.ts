// Shared helper to ingest a storage file into knowledge_documents +
// knowledge_chunks so the chatbot's RAG can quote from it. Called from
// /api/admin/assets/upload after a successful upload.

import mammoth from "mammoth";
import JSZip from "jszip";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { embedText } from "@/lib/learning/embeddings";

// pdf-parse is CJS; require avoids default export issues in Next build
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse = require("pdf-parse");

const TEXT_BEARING_EXTS = new Set(["txt", "md", "pdf", "docx", "odt", "ods", "odp"]);
const STORAGE_BUCKET = "knowledge";

function extOf(path: string): string {
  const m = path.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : "";
}

function cleanText(s: string): string {
  return String(s || "")
    .replace(/ /g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripXmlToText(xml: string): string {
  return xml
    .replace(/<\/(text:p|text:h|text:list-item|table:table-cell)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

async function downloadBuffer(path: string): Promise<Buffer | null> {
  const { data, error } = await supabaseAdmin.storage.from(STORAGE_BUCKET).download(path);
  if (error || !data) return null;
  const ab = await data.arrayBuffer();
  return Buffer.from(ab);
}

async function extractText(path: string): Promise<string> {
  const e = extOf(path);
  if (!TEXT_BEARING_EXTS.has(e)) return "";

  const buf = await downloadBuffer(path);
  if (!buf) return "";

  try {
    if (e === "txt" || e === "md") return cleanText(buf.toString("utf8"));
    if (e === "pdf") {
      const parsed = await pdfParse(buf);
      return cleanText(parsed?.text || "");
    }
    if (e === "docx") {
      const result = await mammoth.extractRawText({ buffer: buf });
      return cleanText(result?.value || "");
    }
    if (e === "odt" || e === "ods" || e === "odp") {
      const zip = await JSZip.loadAsync(buf);
      const file = zip.file("content.xml");
      if (!file) return "";
      const xml = await file.async("string");
      return cleanText(stripXmlToText(xml));
    }
  } catch (err) {
    console.warn("[ingestStorageFile] extract failed for", path, err);
  }
  return "";
}

function chunkText(input: string, maxChars = 1200): string[] {
  const text = (input || "").trim();
  if (!text) return [];

  const parts = text.split(/\n\s*\n+/).map((p) => p.trim()).filter(Boolean);

  const chunks: string[] = [];
  let buf = "";

  for (const p of parts) {
    const next = buf ? `${buf}\n\n${p}` : p;
    if (next.length <= maxChars) {
      buf = next;
      continue;
    }
    if (buf) chunks.push(buf);
    if (p.length > maxChars) {
      for (let i = 0; i < p.length; i += maxChars) {
        chunks.push(p.slice(i, i + maxChars));
      }
      buf = "";
    } else {
      buf = p;
    }
  }
  if (buf) chunks.push(buf);
  return chunks;
}

export type IngestResult = {
  ok: boolean;
  documentId?: string;
  reason?: string;
  chunks?: number;
};

/**
 * Ingest a single storage file into knowledge_documents/knowledge_chunks.
 * Idempotent: removes any prior documents with the same source_path before
 * inserting new ones (so re-uploads replace stale embeddings).
 *
 * Safe to fire-and-forget — failures are logged but never thrown.
 */
export async function ingestStorageFile(opts: {
  path: string;
  title: string;
  category?: string | null;
  productTags?: string[];
  createdBy?: string | null;
}): Promise<IngestResult> {
  const { path, title, category, productTags, createdBy } = opts;

  const ext = extOf(path);
  if (!TEXT_BEARING_EXTS.has(ext)) {
    return { ok: false, reason: "non-text format; nothing to embed" };
  }

  const text = await extractText(path);
  if (!text || text.length < 40) {
    return { ok: false, reason: "no extractable text" };
  }

  // Remove any prior knowledge docs for this exact storage path so the
  // chatbot doesn't hold onto stale chunks across re-uploads.
  await removeKnowledgeForPath(path);

  const { data: doc, error: docErr } = await supabaseAdmin
    .from("knowledge_documents")
    .insert({
      title: title || path.split("/").pop() || "Untitled",
      content: text,
      category: category || null,
      product_tags: Array.isArray(productTags) ? productTags : [],
      created_by: createdBy || null,
      source_type: "upload",
      source_path: path,
      status: "approved",
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (docErr || !doc?.id) {
    console.error("[ingestStorageFile] knowledge_documents insert failed:", docErr);
    return { ok: false, reason: docErr?.message };
  }

  const chunks = chunkText(text, 1200);
  if (!chunks.length) return { ok: true, documentId: doc.id, chunks: 0 };

  const rows = [] as any[];
  for (let i = 0; i < chunks.length; i++) {
    try {
      const embedding = await embedText(chunks[i]);
      rows.push({
        document_id: doc.id,
        chunk_index: i,
        content: chunks[i],
        embedding,
        product_tags: Array.isArray(productTags) ? productTags : [],
        token_count: null,
      });
    } catch (err) {
      console.error("[ingestStorageFile] embed failed for chunk", i, err);
    }
  }

  if (!rows.length) return { ok: true, documentId: doc.id, chunks: 0 };

  const { error: chunkErr } = await supabaseAdmin.from("knowledge_chunks").insert(rows);
  if (chunkErr) {
    console.error("[ingestStorageFile] knowledge_chunks insert failed:", chunkErr);
    return { ok: false, documentId: doc.id, reason: chunkErr.message };
  }

  return { ok: true, documentId: doc.id, chunks: rows.length };
}

/** Removes knowledge_documents (and their chunks, via FK cascade) for the
 * given storage path. Called when an admin deletes a file from the Resource
 * Library so the chatbot stops quoting from it. */
export async function removeKnowledgeForPath(path: string): Promise<void> {
  if (!path) return;
  const { error } = await supabaseAdmin
    .from("knowledge_documents")
    .delete()
    .eq("source_path", path);
  if (error) {
    console.warn("[removeKnowledgeForPath] delete failed:", error.message);
  }
}
