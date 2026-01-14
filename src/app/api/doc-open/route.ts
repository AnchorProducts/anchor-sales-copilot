// src/app/api/doc-open/route.ts
import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const base = NextResponse.next();
    const supabase = supabaseRoute(req, base);

    const { data: auth } = await supabase.auth.getUser();
    const user = auth?.user;
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const url = new URL(req.url);
    const path = (url.searchParams.get("path") || "").trim();
    if (!path) return NextResponse.json({ error: "Missing path" }, { status: 400 });

    const BUCKET = "knowledge";

    // short expiry so links don’t die later
    const { data, error } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUrl(path, 60 * 10); // 10 minutes

    const signed = data?.signedUrl;
    if (error || !signed) {
      return NextResponse.json({ error: error?.message || "Sign failed" }, { status: 500 });
    }

    // ✅ This is the key: redirect so mobile opens the actual file
    return NextResponse.redirect(signed, { status: 302 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
