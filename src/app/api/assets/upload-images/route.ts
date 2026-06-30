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
    // Direct (immediate) image publish is admin-only; anchor_reps must go
    // through /api/internal/asset-reviews/upload so an admin can review.
    if (role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // The browser uploads image bytes straight to Supabase Storage via signed
    // upload URLs, so they never pass through this serverless function (Vercel
    // caps request bodies at ~4.5MB, which a batch of phone photos blows past
    // — see "Failed to parse body as FormData"). We only mint the signed URLs.
    const body = await req.json().catch(() => null);
    const prefix = normalizePrefix(String(body?.prefix || ""));

    if (!prefix) {
      return NextResponse.json({ error: "Missing prefix" }, { status: 400 });
    }

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
      const safeName = name.replace(/[^a-zA-Z0-9._-]/g, "-");
      const path = `${prefix}/pics/${safeName}`;

      const { data, error } = await supabaseAdmin.storage
        .from("knowledge")
        .createSignedUploadUrl(path, { upsert: true });

      if (error || !data) {
        uploads.push({ name, path, error: error?.message || "Could not create upload URL" });
        continue;
      }
      uploads.push({ name, path, token: data.token, signedUrl: data.signedUrl });
    }

    return NextResponse.json({ uploads });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Upload failed" }, { status: 500 });
  }
}
