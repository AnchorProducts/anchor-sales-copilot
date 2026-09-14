"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Button from "@/app/components/ui/Button";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { MAX_PHOTOS, toJpeg, uploadPhoto } from "@/lib/showcase/client";

/* ============================================================================
 * Photos for a stop: pick several → each converts to JPEG → uploads, right away.
 *
 * Uploads happen when the photos are chosen, not on submit, because they're
 * the slow part and people add them from yards on one bar. They go ONE AT A
 * TIME for the same reason: on a weak signal, parallel uploads mostly fail
 * together. Each photo's storage path is held here until the form sends it,
 * so a failed submit never costs a second upload, and a failed upload can be
 * retried without finding the photo again.
 * ==========================================================================*/

export type UploadItem = {
  key: string;
  name: string;
  previewUrl: string | null;
  state: "preparing" | "uploading" | "ready" | "error";
  path?: string;
  message?: string;
  /** Kept after a failed upload so "Try again" re-sends it. Null when the
   *  photo couldn't even be opened. */
  jpeg?: File | null;
};

export function usePhotoUploads(limit = MAX_PHOTOS) {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [items, setItems] = useState<UploadItem[]>([]);

  // Keys still in the tray — a result for a photo already removed is dropped.
  const live = useRef(new Set<string>());
  // Per-key attempt number, so a stale upload can't overwrite a retry's result.
  const attempts = useRef(new Map<string, number>());
  const urls = useRef(new Map<string, string>());
  const seq = useRef(0);

  useEffect(() => {
    const held = urls.current;
    return () => {
      for (const url of held.values()) URL.revokeObjectURL(url);
    };
  }, []);

  const patch = useCallback((key: string, next: Partial<UploadItem>) => {
    if (!live.current.has(key)) return;
    setItems((list) => list.map((it) => (it.key === key ? { ...it, ...next } : it)));
  }, []);

  const upload = useCallback(
    async (key: string, jpeg: File) => {
      const attempt = (attempts.current.get(key) ?? 0) + 1;
      attempts.current.set(key, attempt);
      patch(key, { state: "uploading", message: undefined });

      const result = await uploadPhoto(supabase, jpeg);
      if (attempts.current.get(key) !== attempt) return;
      patch(
        key,
        result.ok
          ? { state: "ready", path: result.data.path, jpeg: undefined }
          : { state: "error", message: result.error, jpeg }
      );
    },
    [patch, supabase]
  );

  const prepare = useCallback(
    async (key: string, file: File) => {
      if (!live.current.has(key)) return;
      let jpeg: File;
      try {
        jpeg = await toJpeg(file);
      } catch (e) {
        patch(key, {
          state: "error",
          message: e instanceof Error ? e.message : "Couldn't open that photo.",
          jpeg: null,
        });
        return;
      }
      if (!live.current.has(key)) return;

      const url = URL.createObjectURL(jpeg);
      urls.current.set(key, url);
      patch(key, { name: jpeg.name, previewUrl: url });
      await upload(key, jpeg);
    },
    [patch, upload]
  );

  /** Queue photos. Returns how many were left out for being over the limit. */
  const add = useCallback(
    (files: File[]) => {
      const picked = files.slice(0, Math.max(0, limit - items.length));
      const fresh: UploadItem[] = picked.map((file) => ({
        key: `photo-${++seq.current}`,
        name: file.name,
        previewUrl: null,
        state: "preparing",
      }));
      for (const it of fresh) live.current.add(it.key);
      setItems((list) => [...list, ...fresh]);

      void (async () => {
        for (let i = 0; i < picked.length; i++) await prepare(fresh[i].key, picked[i]);
      })();

      return files.length - picked.length;
    },
    [items.length, limit, prepare]
  );

  const retry = useCallback(
    (key: string) => {
      const it = items.find((i) => i.key === key);
      if (it?.state === "error" && it.jpeg) void upload(key, it.jpeg);
    },
    [items, upload]
  );

  const remove = useCallback((key: string) => {
    live.current.delete(key);
    const url = urls.current.get(key);
    if (url) {
      URL.revokeObjectURL(url);
      urls.current.delete(key);
    }
    setItems((list) => list.filter((i) => i.key !== key));
  }, []);

  const clear = useCallback(() => {
    for (const url of urls.current.values()) URL.revokeObjectURL(url);
    urls.current.clear();
    live.current.clear();
    setItems([]);
  }, []);

  return {
    items,
    add,
    retry,
    remove,
    clear,
    /** Storage paths ready to send. */
    paths: items.flatMap((i) => (i.state === "ready" && i.path ? [i.path] : [])),
    busy: items.some((i) => i.state === "preparing" || i.state === "uploading"),
    failed: items.some((i) => i.state === "error"),
    room: Math.max(0, limit - items.length),
  };
}

export type PhotoUploads = ReturnType<typeof usePhotoUploads>;

export function PhotoTray({
  uploads,
  label = "Add photos",
  hint,
}: {
  uploads: PhotoUploads;
  label?: string;
  hint?: string;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <div className="grid gap-2">
      {/* No `capture` attribute: it sends a phone straight to the camera and
          hides the camera roll, and the photos worth adding are often ones
          taken an hour ago. */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          // Copied out before the reset below empties the input's file list.
          const files = Array.from(e.target.files ?? []);
          e.target.value = "";
          if (!files.length) return;
          const skipped = uploads.add(files);
          setNotice(
            skipped
              ? `Up to ${MAX_PHOTOS} photos at a time — ${skipped} ${skipped === 1 ? "was" : "were"} left out.`
              : null
          );
        }}
      />

      {uploads.items.length > 0 && (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {uploads.items.map((it) => (
            <li key={it.key} className="grid content-start gap-1">
              <div className="relative aspect-square overflow-hidden rounded-lg bg-[var(--surface-strong)]">
                {it.previewUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={it.previewUrl} alt={it.name} className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-[10px] font-semibold text-[var(--anchor-gray)]">
                    IMG
                  </span>
                )}

                {(it.state === "preparing" || it.state === "uploading") && (
                  <span className="absolute inset-0 flex items-center justify-center bg-white/65 text-[11px] font-semibold text-[var(--anchor-deep)]">
                    {it.state === "uploading" ? "Uploading…" : "Preparing…"}
                  </span>
                )}
                {it.state === "ready" && (
                  <span className="absolute bottom-1 left-1 rounded-full bg-white/90 px-1.5 text-[10px] font-bold text-[var(--anchor-green)]">
                    Uploaded
                  </span>
                )}

                <button
                  type="button"
                  onClick={() => uploads.remove(it.key)}
                  aria-label={`Remove ${it.name}`}
                  className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/55 text-xs text-white"
                >
                  ✕
                </button>
              </div>

              {it.state === "error" && (
                <div className="text-[11px] leading-snug text-red-700">
                  {it.message}{" "}
                  {it.jpeg && (
                    <button
                      type="button"
                      className="font-semibold underline"
                      onClick={() => uploads.retry(it.key)}
                    >
                      Try again
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {uploads.room > 0 && (
        <Button
          variant="secondary"
          onClick={() => inputRef.current?.click()}
          className="justify-self-start"
        >
          {uploads.items.length ? "Add more photos" : label}
        </Button>
      )}
      {hint && <span className="text-xs text-[var(--anchor-gray)]">{hint}</span>}
      {notice && <span className="text-xs text-[var(--anchor-deep)]">{notice}</span>}
    </div>
  );
}
