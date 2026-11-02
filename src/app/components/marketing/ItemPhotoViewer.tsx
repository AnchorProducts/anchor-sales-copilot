"use client";

// Every photo of one inventory item — anchor, anchor with overlay, full box —
// one large at a time, with the rest as thumbnails grouped by kind. Photos are
// transparent cut-outs, so nothing is framed.

import { useEffect, useState } from "react";
import Modal from "@/app/components/ui/Modal";
import { Icon } from "@/app/components/ui/kit";
import { PHOTO_KINDS, type PhotoKind } from "@/lib/inventory";

type Photo = { path: string; kind: PhotoKind; url: string | null; thumb_url: string | null };

export default function ItemPhotoViewer({
  item,
  onClose,
}: {
  item: { id: string; name: string; image_url?: string | null } | null;
  onClose: () => void;
}) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [active, setActive] = useState<string | null>(null);
  // Rendered with key={item.id}, so each item starts fresh.
  const [loading, setLoading] = useState(!!item);

  useEffect(() => {
    if (!item) return;
    let alive = true;
    (async () => {
      const res = await fetch(`/api/inventory/${encodeURIComponent(item.id)}/image`, { cache: "no-store" }).catch(() => null);
      const json = res ? await res.json().catch(() => null) : null;
      if (!alive) return;
      const list: Photo[] = res?.ok ? json?.photos || [] : [];
      // Shown in the same order as the groups below.
      const ordered = PHOTO_KINDS.flatMap((k) => list.filter((p) => p.kind === k.key));
      setPhotos(ordered);
      setActive(ordered[0]?.path || null);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [item]);

  const current = photos.find((p) => p.path === active) || null;
  const groups = PHOTO_KINDS.map((k) => ({ ...k, photos: photos.filter((p) => p.kind === k.key) })).filter(
    (g) => g.photos.length
  );
  const idx = current ? photos.indexOf(current) : -1;
  const step = (d: number) => {
    if (photos.length < 2) return;
    setActive(photos[(idx + d + photos.length) % photos.length].path);
  };

  return (
    <Modal open={!!item} onClose={onClose} className="max-w-2xl">
      {item && (
        <div className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="truncate text-[19px] font-semibold tracking-[-0.02em] text-black">{item.name}</h2>
              {current && groups.length > 1 && (
                <p className="text-[13px] text-[var(--anchor-gray)]">
                  {PHOTO_KINDS.find((k) => k.key === current.kind)?.label}
                </p>
              )}
            </div>
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--mo-fill)] text-black"
            >
              <Icon name="xmark" className="h-4 w-4" />
            </button>
          </div>

          <div className="relative mt-3 flex aspect-square max-h-[60vh] w-full items-center justify-center">
            {current?.url || current?.thumb_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={current.url || current.thumb_url || ""} alt={item.name} className="h-full w-full object-contain" />
            ) : loading ? (
              <span className="text-sm text-[var(--anchor-gray)]">Loading…</span>
            ) : item.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={item.image_url} alt={item.name} className="h-full w-full object-contain" />
            ) : (
              <span className="text-sm text-[var(--anchor-gray)]">No photos yet.</span>
            )}
            {photos.length > 1 && (
              <>
                <button
                  type="button"
                  aria-label="Previous photo"
                  onClick={() => step(-1)}
                  className="absolute left-0 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-lg font-semibold text-white"
                >
                  ‹
                </button>
                <button
                  type="button"
                  aria-label="Next photo"
                  onClick={() => step(1)}
                  className="absolute right-0 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full bg-black/50 text-lg font-semibold text-white"
                >
                  ›
                </button>
              </>
            )}
          </div>

          {photos.length > 1 && (
            <div className="mt-4 grid gap-3">
              {groups.map((g) => (
                <div key={g.key}>
                  {groups.length > 1 && (
                    <div className="mb-1 text-[12px] font-semibold text-[var(--anchor-gray)]">{g.label}</div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {g.photos.map((p) => (
                      <button
                        key={p.path}
                        type="button"
                        onClick={() => setActive(p.path)}
                        aria-label={`Show ${g.label} photo`}
                        className={`h-16 w-16 rounded-xl p-1 transition ${
                          p.path === active ? "ring-2 ring-[var(--anchor-green)]" : "opacity-70 hover:opacity-100"
                        }`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={p.thumb_url || p.url || ""} alt="" className="h-full w-full object-contain" />
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
