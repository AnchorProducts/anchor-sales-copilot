import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/server";
import { embedText } from "@/lib/learning/embeddings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(req: Request) {
  try {
    const supabase = await supabaseRoute(); // ✅ 0 args + await

    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr || !auth?.user) return jsonError("Unauthorized", 401);

    const user = auth.user;

    let body: any;
    try {
      body = await req.json();
    } catch {
      return jsonError("Invalid JSON");
    }

    const conversation_id = body.conversationId ?? body.conversation_id ?? null;
    const session_id = body.sessionId ?? body.session_id ?? null;

    const chunk_id = body.chunkId ?? body.chunk_id ?? null;
    const document_id = body.documentId ?? body.document_id ?? null;

    const correction = typeof body.correction === "string" ? body.correction.trim() : "";
    const note = typeof body.note === "string" ? body.note.trim() : null;

    // The question + wrong answer this correction is about. Stored so a future
    // question can be semantically matched against past corrections.
    const user_message =
      typeof body.userMessage === "string" ? body.userMessage.trim() || null : null;
    const assistant_message =
      typeof body.assistantMessage === "string" ? body.assistantMessage.trim() || null : null;

    if (!conversation_id) return jsonError("conversationId is required");
    if (!session_id) return jsonError("sessionId is required");
    if (!correction) return jsonError("correction is required");

    const insertRow: any = {
      user_id: user.id,
      conversation_id,
      session_id,
      document_id,
      chunk_id,
      note,
      correction,
      status: body.status ?? "pending",
    };

    if (body.assistantMessageId || body.assistant_message_id) {
      insertRow.assistant_message_id =
        body.assistantMessageId ?? body.assistant_message_id;
    }

    // Learning fields. Embed the question (fall back to the correction text) so
    // match_knowledge_corrections can find this later. Embedding is best-effort.
    const learningRow: any = { ...insertRow, user_message, assistant_message };
    try {
      learningRow.embedding = await embedText(user_message || correction);
    } catch (e) {
      console.error("CORRECTION_EMBED_ERROR:", e);
    }

    let inserted: { id: string } | null = null;
    let insertErr: any = null;
    ({ data: inserted, error: insertErr } = await supabase
      .from("knowledge_corrections")
      .insert(learningRow)
      .select("id")
      .maybeSingle());

    // If the learning columns aren't migrated yet, don't lose the correction —
    // retry with just the original fields so it still persists for review.
    if (insertErr) {
      console.error("CORRECTION_INSERT_RETRY:", insertErr?.message);
      ({ data: inserted, error: insertErr } = await supabase
        .from("knowledge_corrections")
        .insert(insertRow)
        .select("id")
        .maybeSingle());
    }

    if (insertErr) return jsonError(insertErr.message, 500);

    return NextResponse.json({ ok: true, id: inserted?.id ?? null }, { status: 200 });
  } catch (e: any) {
    return jsonError(e?.message || "Server error", 500);
  }
}
