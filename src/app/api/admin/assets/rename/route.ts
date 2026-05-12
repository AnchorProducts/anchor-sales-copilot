import { NextRequest, NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireAdmin() {
  const supabase = await supabaseRoute();
  const { data: auth, error } = await supabase.auth.getUser();
  if (error || !auth?.user) return { error: "Unauthorized", status: 401 as const };

  const { data: prof } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", auth.user.id)
    .maybeSingle();

  const role = String((prof as any)?.role || "");
  if (role !== "admin") return { error: "Forbidden", status: 403 as const };

  return { user: auth.user };
}

export async function POST(req: NextRequest) {
  const gate = await requireAdmin();
  if ("error" in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const body = await req.json().catch(() => ({}));
  const id: string | undefined = body.id;
  const path: string | undefined = body.path;
  const productId: string | undefined = body.productId;
  const title = String(body.title || "").trim();
  const isStorageOnly =
    !id || (typeof id === "string" && id.startsWith("storage:"));

  if (!title) {
    return NextResponse.json({ error: "title is required" }, { status: 400 });
  }
  if (!path && !id) {
    return NextResponse.json({ error: "id or path is required" }, { status: 400 });
  }

  // Real DB row → update title in place.
  if (!isStorageOnly && id) {
    const { error: updateErr } = await supabaseAdmin
      .from("assets")
      .update({ title })
      .eq("id", id);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, updated: "row" });
  }

  // Storage-only entry → insert a row for it so the title persists.
  if (!path) {
    return NextResponse.json({ error: "path is required for storage rows" }, { status: 400 });
  }
  if (!productId) {
    return NextResponse.json({ error: "productId is required for storage rows" }, { status: 400 });
  }

  // If a row already exists for this product/path, update it; otherwise insert.
  const { data: existing } = await supabaseAdmin
    .from("assets")
    .select("id")
    .eq("product_id", productId)
    .eq("path", path)
    .maybeSingle();

  if (existing?.id) {
    const { error: updateErr } = await supabaseAdmin
      .from("assets")
      .update({ title })
      .eq("id", existing.id);
    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, updated: "row" });
  }

  const fileExt = String(path).split(".").pop()?.toLowerCase() || "";
  const isImage = ["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(fileExt);
  const isVideo = ["mp4", "mov", "webm"].includes(fileExt);
  const type = isImage ? "image" : isVideo ? "video" : "document";
  const visibility = path.toLowerCase().includes("/internal/") ? "internal" : "public";

  const { error: insertErr } = await supabaseAdmin
    .from("assets")
    .insert({ product_id: productId, title, type, path, visibility });

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, updated: "inserted" });
}
