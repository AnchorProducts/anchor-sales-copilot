import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/server";

export const runtime = "nodejs";

function withForwardedHeaders(base: NextResponse, out: NextResponse) {
  base.headers.forEach((value, key) => out.headers.set(key, value));
  return out;
}

export async function GET(req: Request) {
  const base = NextResponse.next();

  try {
    const { searchParams } = new URL(req.url);
    const conversationId = (searchParams.get("conversationId") || "").trim();
    if (!conversationId) {
      return NextResponse.json({ error: "Missing conversationId" }, { status: 400 });
    }

    const supabase = supabaseRoute(req, base);

    const { data: authData } = await supabase.auth.getUser();
    const user = authData.user;
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: rows, error } = await supabase
      .from("messages")
      .select("role,content,created_at")
      .eq("user_id", user.id)
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: true })
      .limit(500);

    if (error) throw error;

    const out = NextResponse.json({ messages: rows || [] }, { status: 200 });
    return withForwardedHeaders(base, out);
  } catch (err: any) {
    const out = NextResponse.json(
      { error: err?.message || "Server error" },
      { status: 500 }
    );
    return withForwardedHeaders(base, out);
  }
}
