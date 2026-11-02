import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { signStorageUrl } from "@/lib/storage/signedLinks";
import {
  clean,
  getInventoryProfile,
  canViewInventory,
  canWriteInventory,
  signItemImage,
  sanitizeFilename,
  INVENTORY_BUCKET,
} from "@/lib/inventory/server";
import { isPhotoKind, itemCoverPath, parseItemPhotos, type ItemPhoto, type PhotoKind } from "@/lib/inventory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// An item's photos. Several per item, each tagged with what it shows (anchor,
// anchor with overlay, full box, or just "other"); image_path is kept pointing
// at the main one so pages that only know image_path still show it. See
// 20261102_000001. Before that migration there is no photos column, and this
// falls back to the old one-photo behaviour: a new upload replaces the photo.

type Ctx = { params: Promise<{ id: string }> };

function missingPhotosColumn(error: { code?: string; message?: string } | null) {
  return !!error && (error.code === "42703" || /photos/.test(error.message || ""));
}

async function authorize(write: boolean) {
  const supabase = await supabaseRoute();
  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr || !auth?.user) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const profile = await getInventoryProfile(auth.user.id);
  const role = clean(profile?.role);
  if (!(write ? canWriteInventory(role) : canViewInventory(role))) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { userId: auth.user.id };
}

// The item's photos as stored, plus whether the photos column exists yet.
async function loadItem(itemId: string) {
  let legacy = false;
  let { data, error } = await supabaseAdmin
    .from("marketing_inventory_items")
    .select("id,image_path,category,photos")
    .eq("id", itemId)
    .maybeSingle();
  if (missingPhotosColumn(error)) {
    legacy = true;
    ({ data, error } = await supabaseAdmin
      .from("marketing_inventory_items")
      .select("id,image_path,category")
      .eq("id", itemId)
      .maybeSingle());
  }
  if (error || !data) return null;
  const row = data as any;
  let photos = parseItemPhotos(row.photos);
  // A photo set before the migration's backfill ran (or on a legacy database)
  // still counts.
  const imagePath = clean(row.image_path);
  if (!photos.length && imagePath) {
    photos = [{ path: imagePath, kind: row.category === "samples" ? "anchor" : "other" }];
  }
  return { imagePath, photos, legacy };
}

async function savePhotos(itemId: string, userId: string, photos: ItemPhoto[]) {
  return supabaseAdmin
    .from("marketing_inventory_items")
    .update({
      photos,
      image_path: itemCoverPath(photos),
      updated_by: userId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", itemId);
}

async function signAll(photos: ItemPhoto[]) {
  return Promise.all(
    photos.map(async (p) => ({
      ...p,
      // Thumbnail for grids, a larger copy for the photo viewer.
      thumb_url: await signItemImage(p.path),
      url: await signStorageUrl(INVENTORY_BUCKET, p.path, { width: 1400 }),
    }))
  );
}

// GET — the item's photos with signed links. Anyone who can see inventory.
export async function GET(_req: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const a = await authorize(false);
    if (a.error) return a.error;
    const item = await loadItem(clean(id));
    if (!item) return NextResponse.json({ error: "Item not found." }, { status: 404 });
    return NextResponse.json({ ok: true, photos: await signAll(item.photos) });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to load photos." }, { status: 500 });
  }
}

// POST — two-phase photo upload via signed URLs. The browser uploads the image
// bytes straight to Supabase Storage, so they never pass through this function
// (Vercel caps request bodies at ~4.5MB, which phone photos exceed). JSON body:
//   { phase: "sign", fileName, contentType }  → mints a signed upload URL
//   { phase: "commit", path, kind }           → adds the upload to the item
export async function POST(req: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const a = await authorize(true);
    if (a.error) return a.error;
    const userId = a.userId!;

    const itemId = clean(id);
    if (!itemId) return NextResponse.json({ error: "Missing item id." }, { status: 400 });
    const item = await loadItem(itemId);
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
      const path = `inventory/${itemId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeName}`;
      const { data, error } = await supabaseAdmin.storage.from(INVENTORY_BUCKET).createSignedUploadUrl(path);
      if (error || !data) {
        return NextResponse.json({ error: error?.message || "Could not create upload URL." }, { status: 500 });
      }
      return NextResponse.json({ bucket: INVENTORY_BUCKET, path, token: data.token, signedUrl: data.signedUrl });
    }

    // ── Phase 2: add the uploaded photo to the item ───────────────────────
    const path = clean(body?.path);
    if (!path) return NextResponse.json({ error: "Missing path." }, { status: 400 });
    // Guard: the committed path must live under this item's folder.
    if (!path.startsWith(`inventory/${itemId}/`)) {
      return NextResponse.json({ error: "Invalid storage path." }, { status: 400 });
    }
    const kind: PhotoKind = isPhotoKind(body?.kind) ? body.kind : "other";

    if (item.legacy) {
      // No photos column yet: one photo per item, so this replaces it.
      const { error } = await supabaseAdmin
        .from("marketing_inventory_items")
        .update({ image_path: path, updated_by: userId, updated_at: new Date().toISOString() })
        .eq("id", itemId);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      if (item.imagePath && item.imagePath !== path) {
        void supabaseAdmin.storage.from(INVENTORY_BUCKET).remove([item.imagePath]);
      }
      return NextResponse.json({ ok: true, image_path: path, image_url: await signItemImage(path) });
    }

    const photos = [...item.photos.filter((p) => p.path !== path), { path, kind }];
    const { error } = await savePhotos(itemId, userId, photos);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    const cover = itemCoverPath(photos);
    return NextResponse.json({ ok: true, image_path: cover, image_url: await signItemImage(cover) });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to upload image." }, { status: 500 });
  }
}

// PATCH — rearrange one photo. JSON body { path, main?: true, kind? }:
//   main → move it to the front of its kind (the main anchor photo is the
//          item's main photo everywhere)
//   kind → re-tag it (e.g. a box shot uploaded under "Anchor")
export async function PATCH(req: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const a = await authorize(true);
    if (a.error) return a.error;
    const itemId = clean(id);
    const item = await loadItem(itemId);
    if (!item) return NextResponse.json({ error: "Item not found." }, { status: 404 });
    if (item.legacy) {
      return NextResponse.json(
        { error: "Run the 20261102_000001 migration to manage several photos." },
        { status: 409 }
      );
    }

    const body = await req.json().catch(() => null);
    const path = clean(body?.path);
    const target = item.photos.find((p) => p.path === path);
    if (!target) return NextResponse.json({ error: "Photo not found." }, { status: 404 });

    let photos = item.photos.map((p) => (p.path === path && isPhotoKind(body?.kind) ? { ...p, kind: body.kind } : p));
    if (body?.main) {
      const moved = photos.find((p) => p.path === path)!;
      photos = [moved, ...photos.filter((p) => p.path !== path)];
    }
    const { error } = await savePhotos(itemId, a.userId!, photos);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, photos: await signAll(photos) });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to update photo." }, { status: 500 });
  }
}

// DELETE — remove one photo (?path=), or every photo when no path is given.
export async function DELETE(req: Request, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const a = await authorize(true);
    if (a.error) return a.error;
    const itemId = clean(id);
    const item = await loadItem(itemId);
    if (!item) return NextResponse.json({ error: "Item not found." }, { status: 404 });

    const only = clean(new URL(req.url).searchParams.get("path"));
    const gone = only ? item.photos.filter((p) => p.path === only).map((p) => p.path) : item.photos.map((p) => p.path);
    if (!only && item.imagePath && !gone.includes(item.imagePath)) gone.push(item.imagePath);
    const photos = item.photos.filter((p) => !gone.includes(p.path));

    const { error } = item.legacy
      ? await supabaseAdmin
          .from("marketing_inventory_items")
          .update({ image_path: null, updated_by: a.userId!, updated_at: new Date().toISOString() })
          .eq("id", itemId)
      : await savePhotos(itemId, a.userId!, photos);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    // Best-effort cleanup so storage doesn't accumulate files nothing points at.
    if (gone.length) void supabaseAdmin.storage.from(INVENTORY_BUCKET).remove(gone);

    return NextResponse.json({ ok: true, photos: item.legacy ? [] : await signAll(photos) });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to remove image." }, { status: 500 });
  }
}
