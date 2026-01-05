// src/lib/knowledge/save/route.ts
import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/server";
import { embedText } from "@/lib/learning/embeddings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = {
  title: string;
  content: string;
  category?: string;
  product_tags?: string[];
  source_session_id?: string | null;
  source_type?: "chat" | "upload" | "manual_entry";
};

function chunkText(input: string, maxChars = 1200) {
  const text = (input || "").trim();
  if (!text) return [];

  // split by paragraph-ish boundaries, then pack into maxChars chunks
  const parts = text.split(/\n\s*\n+/).map((p) => p.trim()).filter(Boolean);

  const chunks: string[] = [];
  let buf = "";

  for (const p of parts) {
    const next = buf ? `${buf}\n\n${p}` : p;

    if (next.length <= maxChars) {
      buf = next;
      continue;
    }

    // flush current buffer
    if (buf) chunks.push(buf);

    // if paragraph itself is huge, hard-slice it
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

export async function POST(req: Request) {
  const base = NextResponse.next();
  const supabase = supabaseRoute(req, base);

  const { data: auth, error: authErr } = await supabase.auth.getUser();
  const user = auth?.user;
  if (authErr || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const title = (body.title || "").trim();
  const content = (body.content || "").trim();

  if (!title || !content) {
    return NextResponse.json({ error: "Missing title/content" }, { status: 400 });
  }

  // 1) create doc (draft)
  const { data: doc, error: docErr } = await supabase
    .from("knowledge_documents")
    .insert({
      title,
      content,
      category: body.category || null,
      product_tags: Array.isArray(body.product_tags) ? body.product_tags : [],
      created_by: user.id,
      source_type: body.source_type || "chat",
      source_session_id: body.source_session_id || null,
      status: "draft",
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (docErr || !doc?.id) {
    return NextResponse.json(
      { error: docErr?.message || "Doc insert failed" },
      { status: 500 }
    );
  }

  // 2) chunk + embed + insert chunks
  const chunks = chunkText(content, 1200);

  const rows: any[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    const embedding = await embedText(c);

    rows.push({
      document_id: doc.id,
      chunk_index: i,
      content: c,
      embedding,
      product_tags: Array.isArray(body.product_tags) ? body.product_tags : [],
      token_count: null,
    });
  }

  const { error: chunkErr } = await supabase.from("knowledge_chunks").insert(rows);
  if (chunkErr) {
    return NextResponse.json(
      { error: "Chunks insert failed", details: chunkErr.message, document_id: doc.id },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, document_id: doc.id });
}
