// src/app/api/conversations/[id]/messages/route.ts
import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type MessageRow = {
  role: "user" | "assistant";
  content: string;
  created_at: string;
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> } // ✅ Next 15 fix
) {
  try {
    const { id } = await params; // ✅ await params

    const supabase = await supabaseRoute(); // ✅ 0 args + await

    // Auth gate
    const { data: authData, error: authErr } = await supabase.auth.getUser();
    const user = authData?.user;

    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Ensure conversation belongs to user
    const { data: convo, error: convoErr } = await supabase
      .from("conversations")
      .select("id")
      .eq("id", id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (convoErr) throw convoErr;

    if (!convo?.id) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // Load messages
    const { data, error } = await supabase
      .from("messages")
      .select("role,content,created_at")
      .eq("conversation_id", id)
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(200);

    if (error) throw error;

    return NextResponse.json(
      { conversationId: id, messages: (data || []) as MessageRow[] },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("CONVO_MESSAGES_GET_ERROR:", err);
    return NextResponse.json({ error: err?.message || "Server error" }, { status: 500 });
  }
}
