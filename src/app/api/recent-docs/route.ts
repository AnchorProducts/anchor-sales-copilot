import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request) {
  try {
    // ✅ session-aware client (reads cookies internally via cookies())
    const supabase = await supabaseRoute();

    const { data: auth, error: authErr } = await supabase.auth.getUser();
    const user = auth?.user;

    // If not logged in, just return empty list (non-fatal)
    if (authErr || !user) {
      return NextResponse.json({ docs: [] }, { status: 200 });
    }

    // ✅ pull last 5 doc opens for this user (service role bypasses RLS)
    const { data, error } = await supabaseAdmin
      .from("doc_events")
      .select("doc_title, doc_type, doc_path, doc_url, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(5);

    if (error) {
      return NextResponse.json({ docs: [] }, { status: 200 });
    }

    return NextResponse.json({ docs: data || [] }, { status: 200 });
  } catch {
    // fail soft — this endpoint is non-critical UI sugar
    return NextResponse.json({ docs: [] }, { status: 200 });
  }
}
