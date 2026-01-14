import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request) {
  try {
    const supabase = await supabaseRoute(); // ✅ 0 args + await

    const { data: authData, error: authErr } = await supabase.auth.getUser();
    const user = authData?.user;

    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("conversations")
      .select("id,title,updated_at,created_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(30);

    if (error) throw error;

    return NextResponse.json({ conversations: data || [] }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}
