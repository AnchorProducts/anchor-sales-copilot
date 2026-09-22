import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { supabaseRoute } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  OEM_ARTWORK_BUCKET,
  OEM_ARTWORK_MAX_BYTES,
  OEM_ARTWORK_MAX_FILES,
  OEM_ARTWORK_PREFIX,
} from "@/lib/marketing/oemOrder";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clean(v: unknown) {
  return String(v ?? "").trim();
}

// Signed upload URLs for OEM order artwork. The browser uploads each file
// straight to storage and hands the paths to POST /api/marketing-orders — print
// files are far past Vercel's ~4.5MB request-body cap, so the bytes must never
// come through a function.
//
// Internal sales only, matching who can place an OEM order.
export async function POST(req: Request) {
  try {
    const supabase = await supabaseRoute();
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr || !auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", auth.user.id)
      .maybeSingle();
    const role = clean((profile as { role?: string } | null)?.role);
    if (role !== "anchor_rep" && role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await req.json().catch(() => null)) as { files?: unknown } | null;
    const files = Array.isArray(body?.files) ? (body!.files as any[]) : [];
    if (!files.length) return NextResponse.json({ error: "No files provided." }, { status: 400 });
    if (files.length > OEM_ARTWORK_MAX_FILES) {
      return NextResponse.json(
        { error: `Attach up to ${OEM_ARTWORK_MAX_FILES} files per order.` },
        { status: 400 }
      );
    }

    const batch = randomUUID();
    const uploads: { filename: string; path: string; token?: string; error?: string }[] = [];
    for (const f of files) {
      const name = clean(f?.name);
      const size = Number(f?.size) || 0;
      if (!name) {
        uploads.push({ filename: "", path: "", error: "Missing filename" });
        continue;
      }
      if (size > OEM_ARTWORK_MAX_BYTES) {
        uploads.push({ filename: name, path: "", error: `${name} is over 200 MB.` });
        continue;
      }
      const safe = name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100) || "artwork";
      const path = `${OEM_ARTWORK_PREFIX}${batch}/${Date.now()}-${safe}`;
      const { data, error } = await supabaseAdmin.storage
        .from(OEM_ARTWORK_BUCKET)
        .createSignedUploadUrl(path);
      if (error || !data) {
        uploads.push({ filename: name, path, error: error?.message || "Could not create upload URL" });
        continue;
      }
      uploads.push({ filename: name, path, token: data.token });
    }

    return NextResponse.json({ bucket: OEM_ARTWORK_BUCKET, uploads });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Couldn't prepare the upload." }, { status: 500 });
  }
}
