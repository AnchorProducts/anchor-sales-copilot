import { NextRequest, NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { sendPushToTool } from "@/lib/push/send";
import { emailToolUsers } from "@/lib/push/recipients";

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

    // Two-phase JSON flow. The browser uploads the photo bytes straight to
    // Supabase Storage via signed upload URLs ("sign" phase), then reports the
    // uploaded paths back so we can record the pending_uploads rows ("commit"
    // phase). Keeping the bytes off this serverless function avoids Vercel's
    // ~4.5MB request-body cap, which a batch of phone photos exceeds.
    const body = await req.json().catch(() => null);
    const phase = String(body?.phase || "").trim();
    const productId = String(body?.productId || "").trim();

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

    // ── Phase 1: mint signed upload URLs ──────────────────────────────────
    if (phase === "sign") {
      const files = Array.isArray(body?.files) ? body.files : [];
      if (!files.length) {
        return NextResponse.json({ error: "No files provided" }, { status: 400 });
      }

      const uploads: { name: string; path: string; token?: string; signedUrl?: string; error?: string }[] = [];
      for (const f of files) {
        const name = String(f?.name || "").trim();
        if (!name) {
          uploads.push({ name: "", path: "", error: "Missing filename" });
          continue;
        }
        const finalName = `${Date.now()}-${sanitizeFilename(name)}`;
        const path = `pending/${productId}/${finalName}`;
        const { data, error } = await supabaseAdmin.storage
          .from("knowledge")
          .createSignedUploadUrl(path);
        if (error || !data) {
          uploads.push({ name, path, error: error?.message || "Could not create upload URL" });
          continue;
        }
        uploads.push({ name, path, token: data.token, signedUrl: data.signedUrl });
      }

      return NextResponse.json({ uploads });
    }

    // ── Phase 2: record pending_uploads rows for uploaded files ───────────
    const note = String(body?.note || "").trim();
    const uploaded = Array.isArray(body?.uploaded) ? body.uploaded : [];
    if (!uploaded.length) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 });
    }

    const results: { name: string; ok: boolean; error?: string; id?: string }[] = [];

    for (const u of uploaded) {
      const name = String(u?.name || "").trim();
      const path = String(u?.path || "").trim();
      // Skip files the browser failed to upload to storage.
      if (u?.ok === false || !path) {
        results.push({ name, ok: false, error: String(u?.error || "Upload to storage failed") });
        continue;
      }
      // Guard the storage path so a caller can't write rows pointing outside
      // this product's pending folder.
      if (!path.startsWith(`pending/${productId}/`)) {
        results.push({ name, ok: false, error: "Invalid storage path" });
        continue;
      }
      const contentType = String(u?.contentType || "application/octet-stream");
      const size = Number(u?.size) || null;

      const { data: row, error: rowErr } = await supabaseAdmin
        .from("pending_uploads")
        .insert({
          product_id: productId,
          product_name: (product as any).name,
          uploaded_by: user.id,
          uploaded_by_name: (prof as any)?.full_name || null,
          uploaded_by_company: (prof as any)?.company || null,
          uploaded_by_email: (prof as any)?.email || user.email || null,
          filename: name,
          storage_path: path,
          content_type: contentType,
          size_bytes: size,
          note: note || null,
        })
        .select("id")
        .single();

      if (rowErr) {
        // Best effort: undo the storage upload so we don't orphan files.
        await supabaseAdmin.storage.from("knowledge").remove([path]);
        results.push({ name, ok: false, error: rowErr.message });
        continue;
      }

      results.push({ name, ok: true, id: row?.id });
    }

    const failed = results.filter((r) => !r.ok);
    const okCount = results.length - failed.length;
    if (okCount > 0) {
      void sendPushToTool("asset_review", {
        title: "Photos awaiting review",
        body: `${okCount} photo${okCount === 1 ? "" : "s"} uploaded for ${(product as any).name || "a tackle box"}.`,
        url: "/admin/asset-reviews",
        tag: `asset-${productId}`,
      });
      void emailToolUsers("asset_review", {
        subject: "Photos awaiting review",
        text: `${okCount} photo${okCount === 1 ? "" : "s"} uploaded for ${(product as any).name || "a tackle box"} and are awaiting review.`,
      });
    }
    return NextResponse.json({ results, failed: failed.length });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Upload failed" }, { status: 500 });
  }
}
