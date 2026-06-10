// src/app/api/feedback/route.ts
import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export async function POST(req: Request) {
  try {
    const supabase = await supabaseRoute(); // ✅ 0 args + await

    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr || !auth?.user) {
      return jsonError("Unauthorized", 401);
    }

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

    const ratingRaw = Number(body.rating ?? body.thumb ?? body.score);

    if (!conversation_id) return jsonError("conversationId is required");
    if (!session_id) return jsonError("sessionId is required");
    if (!Number.isFinite(ratingRaw)) return jsonError("rating is required");

    const rating = clamp(Math.round(ratingRaw), 1, 5);
    const note = typeof body.note === "string" ? body.note.trim() : null;

    // The question + answer this rating is about, so admins can see the context.
    const user_message =
      typeof body.userMessage === "string" ? body.userMessage.trim() || null : null;
    const assistant_message =
      typeof body.assistantMessage === "string" ? body.assistantMessage.trim() || null : null;

    const insertRow: any = {
      user_id: user.id,
      conversation_id,
      session_id,
      document_id,
      chunk_id,
      rating,
      note,
      status: body.status ?? "new",
    };

    if (body.assistantMessageId || body.assistant_message_id) {
      insertRow.assistant_message_id =
        body.assistantMessageId ?? body.assistant_message_id;
    }

    const withMessages = { ...insertRow, user_message, assistant_message };

    let inserted: { id: string } | null = null;
    let error: { message: string } | null = null;
    ({ data: inserted, error } = await supabase
      .from("knowledge_feedback")
      .insert(withMessages)
      .select("id")
      .maybeSingle());

    // If the message columns aren't migrated yet, don't lose the feedback —
    // retry with the original fields.
    if (error) {
      ({ data: inserted, error } = await supabase
        .from("knowledge_feedback")
        .insert(insertRow)
        .select("id")
        .maybeSingle());
    }

    if (error) return jsonError(error.message, 500);

    return NextResponse.json({ ok: true, id: inserted?.id ?? null }, { status: 200 });
  } catch (e: any) {
    return jsonError(e?.message || "Server error", 500);
  }
}
