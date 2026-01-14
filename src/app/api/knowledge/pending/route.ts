import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request) {
  try {
    const supabase = await supabaseRoute(); // ✅ 0 args + await

    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr || !auth?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // simple: only internal users can review (adjust to your role logic if you want)
    const { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("role,user_type")
      .eq("id", auth.user.id)
      .maybeSingle();

    if (profileErr) {
      return NextResponse.json({ error: profileErr.message }, { status: 500 });
    }

    if (profile?.user_type !== "internal") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data, error } = await supabase
      .from("knowledge_documents")
      .select("id,title,category,confidence,raw_text,meta,created_at,status")
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ items: data || [] }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}
