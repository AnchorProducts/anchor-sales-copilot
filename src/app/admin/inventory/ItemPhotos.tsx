"use client";

// Several photos per inventory item, grouped by what they show. An anchor
// sample gets three groups — Anchor, Anchor with overlay, Full box — and any
// other item one plain "Photos" group. Each group takes multiple files at once.
//
// Photos are meant to be transparent PNG cut-outs, so they're drawn with no
// frame or background, and uploaded with their transparency kept (WebP/PNG,
// never flattened onto a white JPEG).
//
// New files wait in `pending` until the item is saved (a new item has no id to
// upload under yet); removing or promoting an existing photo happens at once.

import { useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { compressImage } from "@/lib/media/compressImage";
import { Icon } from "@/app/components/ui/kit";
import { PHOTO_KINDS, type PhotoKind } from "@/lib/inventory";

export type PendingPhotos = Partial<Record<PhotoKind, File[]>>;

export type SignedPhoto = { path: string; kind: PhotoKind; url: string | null; thumb_url: string | null };

export function pendingCount(p: PendingPhotos): number {
  return Object.values(p).reduce((n, files) => n + (files?.length || 0), 0);
}

// Upload every queued file under the item: sign → straight to Storage →
// commit. Returns an error message for the first failure, or null.
export async function uploadPendingPhotos(
  itemId: string,
  pending: PendingPhotos,
  supabase: SupabaseClient
): Promise<string | null> {
  const url = `/api/inventory/${encodeURIComponent(itemId)}/image`;
  let failed = 0;
  let firstErr: string | null = null;
  for (const k of PHOTO_KINDS) {
    for (const file of pending[k.key] || []) {
      try {
        // Large shots shrink to 2000px; cut-outs keep their transparency.
        const photo = await compressImage(file, { preserveAlpha: true, targetBytes: 3 * 1024 * 1024 });
        const contentType = photo.type || "image/png";
        const signRes = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phase: "sign", fileName: photo.name, contentType }),
        });
        const sign = await signRes.json().catch(() => null);
        if (!signRes.ok || !sign?.token || !sign?.path) throw new Error(sign?.error || "Couldn't start the upload.");
        const { error: upErr } = await supabase.storage
          .from(sign.bucket)
          .uploadToSignedUrl(sign.path, sign.token, photo, { contentType });
        if (upErr) throw new Error(upErr.message);
        const commit = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ phase: "commit", path: sign.path, kind: k.key }),
        });
        if (!commit.ok) {
          const cJson = await commit.json().catch(() => null);
          throw new Error(cJson?.error || "Couldn't save the photo.");
        }
      } catch (e) {
        failed += 1;
        firstErr ||= `${file.name}: ${e instanceof Error ? e.message : "upload failed"}`;
      }
    }
  }
  if (!failed) return null;
  return failed === 1 ? `Item saved, but a photo failed to upload — ${firstErr}` : `Item saved, but ${failed} photos failed to upload — ${firstErr}`;
}

export function ItemPhotosEditor({
  itemId,
  kinds,
  pending,
  onPendingChange,
  onChanged,
  disabled,
}: {
  itemId: string | null | undefined;
  kinds: PhotoKind[];
  pending: PendingPhotos;
  onPendingChange: (next: PendingPhotos) => void;
  // Called after a photo was removed or made main, so the list can refresh.
  onChanged?: () => void;
  disabled?: boolean;
}) {
  const [photos, setPhotos] = useState<SignedPhoto[]>([]);
  // Rendered with key={itemId}, so each item starts fresh.
  const [loading, setLoading] = useState(!!itemId);
  const [working, setWorking] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!itemId) return;
    let alive = true;
    (async () => {
      const res = await fetch(`/api/inventory/${encodeURIComponent(itemId)}/image`, { cache: "no-store" }).catch(() => null);
      const json = res ? await res.json().catch(() => null) : null;
      if (!alive) return;
      if (res?.ok) setPhotos(json?.photos || []);
      else setErr(json?.error || "Couldn't load this item's photos.");
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [itemId]);

  // Previews for the queued files, revoked when they change.
  const [previews, setPreviews] = useState<Partial<Record<PhotoKind, string[]>>>({});
  useEffect(() => {
    const out: Partial<Record<PhotoKind, string[]>> = {};
    for (const k of PHOTO_KINDS) out[k.key] = (pending[k.key] || []).map((f) => URL.createObjectURL(f));
    setPreviews(out);
    return () => {
      for (const urls of Object.values(out)) urls?.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [pending]);

  // A group shows if the item is offered it, or already has photos in it (say
  // its category changed since they were uploaded).
  const groups = PHOTO_KINDS.filter((k) => kinds.includes(k.key) || photos.some((p) => p.kind === k.key));

  async function act(path: string, method: "PATCH" | "DELETE") {
    if (!itemId) return;
    setWorking(path);
    setErr(null);
    try {
      const base = `/api/inventory/${encodeURIComponent(itemId)}/image`;
      const res =
        method === "DELETE"
          ? await fetch(`${base}?path=${encodeURIComponent(path)}`, { method: "DELETE" })
          : await fetch(base, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ path, main: true }),
            });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setErr(json?.error || "Couldn't update the photo.");
        return;
      }
      setPhotos(json?.photos || []);
      onChanged?.();
    } finally {
      setWorking(null);
    }
  }

  function addFiles(kind: PhotoKind, list: FileList | null) {
    const files = Array.from(list || []).filter((f) => f.type.startsWith("image/") || /\.(png|jpe?g|webp|heic|heif|gif)$/i.test(f.name));
    if (!files.length) return;
    onPendingChange({ ...pending, [kind]: [...(pending[kind] || []), ...files] });
  }

  function dropPending(kind: PhotoKind, i: number) {
    onPendingChange({ ...pending, [kind]: (pending[kind] || []).filter((_, j) => j !== i) });
  }

  return (
    <div className="block text-sm">
      <span className="font-medium">Photos</span>
      <span className="mt-0.5 block text-xs text-[var(--anchor-gray)]">
        Transparent PNGs work best — they&apos;re shown with no frame or background. Pick several at once.
        {kinds.length > 1 && " The first anchor photo is the item's main photo everywhere."}
      </span>
      {err && <div className="mt-2 rounded-lg bg-red-50 p-2 text-xs text-red-700">{err}</div>}
      {loading && <div className="mt-2 text-xs text-[var(--anchor-gray)]">Loading photos…</div>}

      <div className="mt-2 grid gap-3">
        {groups.map((k) => {
          const mine = photos.filter((p) => p.kind === k.key);
          const queued = pending[k.key] || [];
          const inputId = `item-photos-${k.key}`;
          return (
            <div key={k.key}>
              {groups.length > 1 && (
                <div className="mb-1 flex items-baseline gap-2">
                  <span className="text-[13px] font-semibold text-black">{k.label}</span>
                  {k.hint && <span className="text-[11px] text-[var(--anchor-gray)]">{k.hint}</span>}
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                {mine.map((p, i) => (
                  <div key={p.path} className="group relative h-20 w-20">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.thumb_url || p.url || ""} alt="" className="h-full w-full object-contain" />
                    {i === 0 && groups.length > 1 && (
                      <span className="absolute left-0 top-0 rounded-full bg-black/70 px-1.5 py-0.5 text-[9px] font-semibold text-white">
                        Main
                      </span>
                    )}
                    <button
                      type="button"
                      aria-label="Remove photo"
                      disabled={disabled || working === p.path}
                      onClick={() => {
                        if (window.confirm("Remove this photo?")) void act(p.path, "DELETE");
                      }}
                      className="absolute right-0 top-0 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white disabled:opacity-40"
                    >
                      <Icon name="xmark" className="h-3.5 w-3.5" />
                    </button>
                    {i > 0 && (
                      <button
                        type="button"
                        disabled={disabled || working === p.path}
                        onClick={() => void act(p.path, "PATCH")}
                        className="absolute inset-x-0 bottom-0 rounded-full bg-black/70 py-0.5 text-[10px] font-semibold text-white opacity-0 transition group-hover:opacity-100 focus:opacity-100 disabled:opacity-40"
                      >
                        Make main
                      </button>
                    )}
                  </div>
                ))}
                {queued.map((f, i) => (
                  <div key={`${f.name}-${i}`} className="relative h-20 w-20">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={previews[k.key]?.[i]} alt="" className="h-full w-full object-contain opacity-70" />
                    <span className="absolute bottom-0 left-0 rounded-full bg-[var(--anchor-green)] px-1.5 py-0.5 text-[9px] font-semibold text-white">
                      On save
                    </span>
                    <button
                      type="button"
                      aria-label="Don't upload this photo"
                      disabled={disabled}
                      onClick={() => dropPending(k.key, i)}
                      className="absolute right-0 top-0 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white"
                    >
                      <Icon name="xmark" className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
                <label
                  htmlFor={inputId}
                  className={`flex h-20 w-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-[var(--border-default)] text-[11px] font-semibold text-[var(--anchor-gray)] hover:text-[var(--anchor-green)] ${
                    disabled ? "pointer-events-none opacity-40" : ""
                  }`}
                >
                  <Icon name="plus" className="h-4 w-4" />
                  Add
                </label>
                <input
                  id={inputId}
                  type="file"
                  accept="image/png,image/webp,image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => {
                    addFiles(k.key, e.target.files);
                    e.target.value = "";
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
