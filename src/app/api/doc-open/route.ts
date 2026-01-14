// src/app/api/doc-open/route.ts
import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function filenameFromPath(path: string) {
  const clean = path.split("?")[0];
  return clean.split("/").pop() || "document";
}

export async function GET(req: Request) {
  try {
    const supabase = await supabaseRoute(); // ✅ 0 args + await

    const { data: auth, error: authErr } = await supabase.auth.getUser();
    const user = auth?.user;

    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const url = new URL(req.url);
    const path = (url.searchParams.get("path") || "").trim();
    const download = url.searchParams.get("download") === "1";

    if (!path) return NextResponse.json({ error: "Missing path" }, { status: 400 });

    const BUCKET = "knowledge";

    const { data, error } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(path, 60 * 10);

    const signed = data?.signedUrl;

    if (error || !signed) {
      return NextResponse.json({ error: error?.message || "Sign failed" }, { status: 500 });
    }

    // ✅ If not downloading, just redirect
    if (!download) {
      return NextResponse.redirect(signed, { status: 302 });
    }

    // ✅ If downloading, proxy the file so we can force attachment
    const upstream = await fetch(signed);
    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Fetch failed: ${upstream.status}` },
        { status: 502 }
      );
    }

    const contentType = upstream.headers.get("content-type") || "application/octet-stream";
    const filename = filenameFromPath(path);

    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
