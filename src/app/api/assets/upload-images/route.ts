import { NextRequest, NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizePrefix(p: string) {
  return String(p || "").trim().replace(/^\/+|\/+$/g, "");
}

export async function POST(req: NextRequest) {
  try {
    // Verify auth
    const supabase = await supabaseRoute();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify internal role
    const { data: prof } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    const role = String((prof as any)?.role || "");
    if (role !== "admin" && role !== "anchor_rep") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const formData = await req.formData();
    const prefix = normalizePrefix(String(formData.get("prefix") || ""));

    if (!prefix) {
      return NextResponse.json({ error: "Missing prefix" }, { status: 400 });
    }

    const files = formData.getAll("files") as File[];
    if (!files.length) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 });
    }

    const results: { name: string; ok: boolean; error?: string }[] = [];

    for (const file of files) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
      const path = `${prefix}/pics/${safeName}`;
      const buffer = Buffer.from(await file.arrayBuffer());

      const { error } = await supabaseAdmin.storage
        .from("knowledge")
        .upload(path, buffer, {
          contentType: file.type || "application/octet-stream",
          upsert: true,
        });

      results.push({ name: file.name, ok: !error, error: error?.message });
    }

    const failed = results.filter((r) => !r.ok);
    return NextResponse.json({ results, failed: failed.length });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Upload failed" }, { status: 500 });
  }
}
