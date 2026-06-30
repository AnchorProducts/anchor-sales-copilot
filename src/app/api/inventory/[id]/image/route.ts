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

// POST — two-phase photo upload via signed URLs. The browser uploads the image
// bytes straight to Supabase Storage, so they never pass through this function
// (Vercel caps request bodies at ~4.5MB, which phone photos exceed). JSON body:
//   { phase: "sign", fileName, contentType }  → mints a signed upload URL
//   { phase: "commit", path }                 → points the item at the upload
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

    const body = await req.json().catch(() => null);
    const phase = clean(body?.phase);

    // ── Phase 1: mint a signed upload URL ─────────────────────────────────
    if (phase === "sign") {
      const contentType = clean(body?.contentType);
      if (!contentType.startsWith("image/")) {
        return NextResponse.json({ error: "Only image files are allowed." }, { status: 400 });
      }
      const safeName = sanitizeFilename(clean(body?.fileName) || "photo");
      const path = `inventory/${itemId}/${Date.now()}-${safeName}`;
      const { data, error } = await supabaseAdmin.storage
        .from(INVENTORY_BUCKET)
        .createSignedUploadUrl(path);
      if (error || !data) {
        return NextResponse.json(
          { error: error?.message || "Could not create upload URL." },
          { status: 500 }
        );
      }
      return NextResponse.json({ bucket: INVENTORY_BUCKET, path, token: data.token, signedUrl: data.signedUrl });
    }

    // ── Phase 2: point the item at the uploaded photo ─────────────────────
    const path = clean(body?.path);
    if (!path) return NextResponse.json({ error: "Missing path." }, { status: 400 });
    // Guard: the committed path must live under this item's folder.
    if (!path.startsWith(`inventory/${itemId}/`)) {
      return NextResponse.json({ error: "Invalid storage path." }, { status: 400 });
    }

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
