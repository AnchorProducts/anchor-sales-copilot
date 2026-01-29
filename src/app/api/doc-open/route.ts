import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { supabaseRoute } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function normalizePathInput(s: string) {
  return decodeURIComponent((s || "").trim()).replace(/^\/+/, "").replace(/\/+$/, "");
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  const path = normalizePathInput(searchParams.get("path") || "");
  const download = searchParams.get("download") === "1";

  if (!path) {
    return NextResponse.json({ error: "Missing path" }, { status: 400 });
  }

  // Optional: keep this if docs should only work for logged-in users
  const supabase = await supabaseRoute();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabaseAdmin
    .storage
    .from("knowledge")
    .createSignedUrl(path, 60 * 30);

  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: "Could not create signed url" }, { status: 500 });
  }

  // If you want "download" behavior for some cases, you can hint it with headers.
  // (Note: cross-origin + storage may ignore this sometimes, but it doesn't hurt.)
  if (download) {
    const res = NextResponse.redirect(data.signedUrl, 302);
    res.headers.set("Content-Disposition", "attachment");
    return res;
  }

  // ✅ Best for desktop + mobile: redirect to the signed URL
  return NextResponse.redirect(data.signedUrl, 302);
}

// Nice-to-have so preflight/health checks don't 405
export async function HEAD() {
  return new NextResponse(null, { status: 200 });
}
