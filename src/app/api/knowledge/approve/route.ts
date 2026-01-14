import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const supabase = await supabaseRoute(); // ✅ 0 args + await

    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr || !auth?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const id = String(body?.id || "").trim();
    const action = String(body?.action || "").trim(); // "approve" | "reject"

    if (!id || (action !== "approve" && action !== "reject")) {
      return NextResponse.json({ error: "Bad request" }, { status: 400 });
    }

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

    const now = new Date().toISOString();

    const patch =
      action === "approve"
        ? {
            status: "approved",
            approved_at: now,
            approved_by: auth.user.id,
            updated_at: now,
          }
        : {
            status: "rejected",
            updated_at: now,
          };

    const { error } = await supabase.from("knowledge_documents").update(patch).eq("id", id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Server error" }, { status: 500 });
  }
}
