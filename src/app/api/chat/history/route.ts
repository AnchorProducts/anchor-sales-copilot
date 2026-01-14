// src/app/api/chat/history/route.ts
import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Back-compat:
 * Some older assistant rows may have stored docs payload as JSON in `content`
 * (ex: { type: "docs_only", recommendedDocs, foldersUsed, answer }).
 * This route normalizes that into `meta` so the UI can rehydrate the "See docs" button.
 */
function normalizeRow(row: any) {
  const role = row?.role;
  const content = (row?.content ?? "").toString();
  const meta = row?.meta && typeof row.meta === "object" ? row.meta : null;

  // If meta already present, return as-is (but ensure object)
  if (meta && Object.keys(meta).length) {
    return { ...row, meta };
  }

  // Try to parse JSON stored in content (legacy)
  if (role === "assistant") {
    try {
      const parsed = JSON.parse(content);

      const hasDocs =
        parsed &&
        typeof parsed === "object" &&
        (parsed.type === "docs_only" || parsed.type === "assistant_with_docs") &&
        Array.isArray(parsed.recommendedDocs);

      if (hasDocs) {
        const nextMeta = {
          type: parsed.type,
          recommendedDocs: parsed.recommendedDocs,
          foldersUsed: Array.isArray(parsed.foldersUsed) ? parsed.foldersUsed : [],
        };

        const nextContent =
          parsed.type === "assistant_with_docs" ? (parsed.answer ?? "").toString() : "";

        return { ...row, content: nextContent, meta: nextMeta };
      }
    } catch {
      // not JSON, ignore
    }
  }

  return { ...row, meta: {} };
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const conversationId = (searchParams.get("conversationId") || "").trim();

    if (!conversationId) {
      return NextResponse.json({ error: "Missing conversationId" }, { status: 400 });
    }

    const supabase = await supabaseRoute(); // ✅ 0 args + await

    const { data: authData, error: authErr } = await supabase.auth.getUser();
    const user = authData?.user;

    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: rows, error } = await supabase
      .from("messages")
      .select("id,role,content,meta,created_at")
      .eq("user_id", user.id)
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(500);

    if (error) throw error;

    const normalized = (rows || []).map(normalizeRow);

    return NextResponse.json(
      { conversationId, messages: normalized },
      { status: 200 }
    );
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Server error" }, { status: 500 });
  }
}
