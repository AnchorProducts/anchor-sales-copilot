import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  clean,
  getInventoryProfile,
  canWriteInventory,
  signItemImage,
  sanitizeFilename,
  INVENTORY_BUCKET,
} from "@/lib/inventory/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// POST — upload (or replace) an item's photo. multipart/form-data, field "file".
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const supabase = await supabaseRoute();
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr || !auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const profile = await getInventoryProfile(auth.user.id);
    if (!canWriteInventory(clean(profile?.role))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const itemId = clean(id);
    if (!itemId) return NextResponse.json({ error: "Missing item id." }, { status: 400 });

    const { data: item } = await supabaseAdmin
      .from("marketing_inventory_items")
      .select("id,image_path")
      .eq("id", itemId)
      .maybeSingle();
    if (!item) return NextResponse.json({ error: "Item not found." }, { status: 404 });

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
    }
    if (!clean(file.type).startsWith("image/")) {
      return NextResponse.json({ error: "Only image files are allowed." }, { status: 400 });
    }

    const safeName = sanitizeFilename(file.name || "photo");
    const path = `inventory/${itemId}/${Date.now()}-${safeName}`;
    const contentType = file.type || "application/octet-stream";
    const buf = Buffer.from(await file.arrayBuffer());

    const { error: upErr } = await supabaseAdmin.storage
      .from(INVENTORY_BUCKET)
      .upload(path, buf, { contentType, upsert: false });
    if (upErr) return NextResponse.json({ error: upErr.message || "Upload failed." }, { status: 500 });

    const oldPath = clean((item as any).image_path);

    const { error: updErr } = await supabaseAdmin
      .from("marketing_inventory_items")
      .update({ image_path: path, updated_by: auth.user.id, updated_at: new Date().toISOString() })
      .eq("id", itemId);
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

    // Best-effort cleanup of the replaced image so storage doesn't accumulate.
    if (oldPath && oldPath !== path) {
      void supabaseAdmin.storage.from(INVENTORY_BUCKET).remove([oldPath]);
    }

    return NextResponse.json({ ok: true, image_path: path, image_url: await signItemImage(path) });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to upload image." }, { status: 500 });
  }
}

// DELETE — remove an item's photo.
export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const supabase = await supabaseRoute();
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr || !auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const profile = await getInventoryProfile(auth.user.id);
    if (!canWriteInventory(clean(profile?.role))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const itemId = clean(id);
    const { data: item } = await supabaseAdmin
      .from("marketing_inventory_items")
      .select("image_path")
      .eq("id", itemId)
      .maybeSingle();
    if (!item) return NextResponse.json({ error: "Item not found." }, { status: 404 });

    const path = clean((item as any).image_path);
    if (path) void supabaseAdmin.storage.from(INVENTORY_BUCKET).remove([path]);

    const { error } = await supabaseAdmin
      .from("marketing_inventory_items")
      .update({ image_path: null, updated_by: auth.user.id, updated_at: new Date().toISOString() })
      .eq("id", itemId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to remove image." }, { status: 500 });
  }
}
