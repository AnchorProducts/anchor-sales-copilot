// src/app/api/admin/learning/summary/route.ts
import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (data?.role !== "admin") throw new Error("Forbidden");
}

export async function GET(_req: Request) {
  try {
    const supabase = await supabaseRoute(); // ✅ 0 args + await

    const { data: auth, error: authError } = await supabase.auth.getUser();
    if (authError) throw new Error(authError.message);

    const user = auth?.user;
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    await assertAdmin(supabase, user.id);

    // docs with most downvotes
    const { data: docs, error: docsError } = await supabase.rpc(
      "admin_docs_most_downvoted",
      { limit_count: 25 }
    );
    if (docsError) throw new Error(docsError.message);

    // open correction tickets
    const { data: corrections, error: corrError } = await supabase
      .from("knowledge_corrections")
      .select("id,created_at,created_by,correction_text,proposed_doc_id,status")
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(50);

    if (corrError) throw new Error(corrError.message);

    return NextResponse.json({
      ok: true,
      docs: docs || [],
      corrections: corrections || [],
    });
  } catch (e: any) {
    const msg = e?.message || "Forbidden";
    const status =
      msg === "Unauthorized" ? 401 :
      msg === "Forbidden" ? 403 :
      500;

    return NextResponse.json({ error: msg }, { status });
  }
}
