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

function withForwardedHeaders(base: NextResponse, out: NextResponse) {
  base.headers.forEach((value, key) => out.headers.set(key, value));
  return out;
}

export async function POST(req: Request) {
  const base = NextResponse.next(); // ✅ NEW

  try {
    const supabase = supabaseRoute(req, base); // ✅ FIX

    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr || !auth?.user) {
      return withForwardedHeaders(base, jsonError("Unauthorized", 401));
    }

    const user = auth.user;

    let body: any;
    try {
      body = await req.json();
    } catch {
      return withForwardedHeaders(base, jsonError("Invalid JSON"));
    }

    const conversation_id = body.conversationId ?? body.conversation_id ?? null;
    const session_id = body.sessionId ?? body.session_id ?? null;

    const chunk_id = body.chunkId ?? body.chunk_id ?? null;
    const document_id = body.documentId ?? body.document_id ?? null;

    const ratingRaw = Number(body.rating ?? body.thumb ?? body.score);
    if (!conversation_id) return withForwardedHeaders(base, jsonError("conversationId is required"));
    if (!session_id) return withForwardedHeaders(base, jsonError("sessionId is required"));
    if (!Number.isFinite(ratingRaw)) return withForwardedHeaders(base, jsonError("rating is required"));

    const rating = clamp(Math.round(ratingRaw), 1, 5);
    const note = typeof body.note === "string" ? body.note.trim() : null;

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
      insertRow.assistant_message_id = body.assistantMessageId ?? body.assistant_message_id;
    }

    const { data: inserted, error } = await supabase
      .from("knowledge_feedback")
      .insert(insertRow)
      .select("id")
      .maybeSingle();

    if (error) {
      return withForwardedHeaders(base, jsonError(error.message, 500));
    }

    const out = NextResponse.json({ ok: true, id: inserted?.id ?? null });
    return withForwardedHeaders(base, out);
  } catch (e: any) {
    return withForwardedHeaders(base, jsonError(e?.message || "Server error", 500));
  }
}
