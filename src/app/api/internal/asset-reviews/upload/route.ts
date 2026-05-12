import { NextRequest, NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sanitizeFilename(name: string) {
  return String(name || "")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function POST(req: NextRequest) {
  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." },
        { status: 500 }
      );
    }

    const supabase = await supabaseRoute();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("role,full_name,company,email")
      .eq("id", user.id)
      .maybeSingle();

    const role = String((prof as any)?.role || "");
    if (role !== "admin" && role !== "anchor_rep") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const formData = await req.formData();
    const productId = String(formData.get("productId") || "").trim();
    const note = String(formData.get("note") || "").trim();

    if (!productId) {
      return NextResponse.json({ error: "Missing productId" }, { status: 400 });
    }

    const { data: product } = await supabaseAdmin
      .from("products")
      .select("id,name")
      .eq("id", productId)
      .maybeSingle();

    if (!product) {
      return NextResponse.json({ error: "Unknown product" }, { status: 400 });
    }

    const files = formData.getAll("files") as File[];
    if (!files.length) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 });
    }

    const results: { name: string; ok: boolean; error?: string; id?: string }[] = [];

    for (const file of files) {
      const safeName = sanitizeFilename(file.name);
      const finalName = `${Date.now()}-${safeName}`;
      const path = `pending/${productId}/${finalName}`;
      const buffer = Buffer.from(await file.arrayBuffer());

      const { error: uploadErr } = await supabaseAdmin.storage
        .from("knowledge")
        .upload(path, buffer, {
          contentType: file.type || "application/octet-stream",
          upsert: false,
        });

      if (uploadErr) {
        results.push({ name: file.name, ok: false, error: uploadErr.message });
        continue;
      }

      const { data: row, error: rowErr } = await supabaseAdmin
        .from("pending_uploads")
        .insert({
          product_id: productId,
          product_name: (product as any).name,
          uploaded_by: user.id,
          uploaded_by_name: (prof as any)?.full_name || null,
          uploaded_by_company: (prof as any)?.company || null,
          uploaded_by_email: (prof as any)?.email || user.email || null,
          filename: file.name,
          storage_path: path,
          content_type: file.type || "application/octet-stream",
          size_bytes: file.size,
          note: note || null,
        })
        .select("id")
        .single();

      if (rowErr) {
        // Best effort: undo the storage upload so we don't orphan files.
        await supabaseAdmin.storage.from("knowledge").remove([path]);
        results.push({ name: file.name, ok: false, error: rowErr.message });
        continue;
      }

      results.push({ name: file.name, ok: true, id: row?.id });
    }

    const failed = results.filter((r) => !r.ok);
    return NextResponse.json({ results, failed: failed.length });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Upload failed" }, { status: 500 });
  }
}
