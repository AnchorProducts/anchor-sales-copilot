"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Button from "@/app/components/ui/Button";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { toJpeg, uploadPhoto } from "@/lib/showcase/client";

/* ============================================================================
 * One showcase photo: pick → convert to JPEG → upload, right away.
 *
 * The upload happens when the photo is chosen, not on submit, because it's the
 * slow part and people file from yards on one bar. The resulting storage path
 * is held here until the form sends it, so a failed submit never costs a second
 * upload. Shared by "File a stop" and the keeper's stop editor.
 * ==========================================================================*/

export type PhotoState =
  | { kind: "none" }
  | { kind: "uploading"; name: string; previewUrl: string | null }
  | { kind: "ready"; name: string; previewUrl: string; path: string }
  // `jpeg` is kept when conversion worked, so "Try again" re-uploads without
  // asking the person to find the photo again.
  | { kind: "error"; name: string; previewUrl: string | null; message: string; jpeg: File | null };

export function usePhotoUpload() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [photo, setPhoto] = useState<PhotoState>({ kind: "none" });

  // Every pick, retry and removal bumps this. An upload that finishes after its
  // photo was removed or replaced sees a newer number and drops its result.
  const attempt = useRef(0);
  const preview = useRef<string | null>(null);

  const setPreview = useCallback((url: string | null) => {
    if (preview.current && preview.current !== url) URL.revokeObjectURL(preview.current);
    preview.current = url;
  }, []);

  useEffect(() => () => setPreview(null), [setPreview]);

  const send = useCallback(
    async (jpeg: File, previewUrl: string) => {
      const mine = ++attempt.current;
      setPhoto({ kind: "uploading", name: jpeg.name, previewUrl });
      const result = await uploadPhoto(supabase, jpeg);
      if (mine !== attempt.current) return;
      setPhoto(
        result.ok
          ? { kind: "ready", name: jpeg.name, previewUrl, path: result.data.path }
          : { kind: "error", name: jpeg.name, previewUrl, message: result.error, jpeg }
      );
    },
    [supabase]
  );

  const pick = useCallback(
    async (file: File) => {
      const mine = ++attempt.current;
      setPreview(null);
      setPhoto({ kind: "uploading", name: file.name, previewUrl: null });

      let jpeg: File;
      try {
        jpeg = await toJpeg(file);
      } catch (e) {
        if (mine !== attempt.current) return;
        setPhoto({
          kind: "error",
          name: file.name,
          previewUrl: null,
          message: e instanceof Error ? e.message : "Couldn't open that photo.",
          jpeg: null,
        });
        return;
      }
      if (mine !== attempt.current) return;

      const previewUrl = URL.createObjectURL(jpeg);
      setPreview(previewUrl);
      await send(jpeg, previewUrl);
    },
    [send, setPreview]
  );

  const retry = useCallback(() => {
    if (photo.kind === "error" && photo.jpeg && photo.previewUrl) {
      void send(photo.jpeg, photo.previewUrl);
    }
  }, [photo, send]);

  const clear = useCallback(() => {
    attempt.current++;
    setPreview(null);
    setPhoto({ kind: "none" });
  }, [setPreview]);

  return { photo, pick, retry, clear };
}

export function PhotoPicker({
  photo,
  onPick,
  onRetry,
  onRemove,
  label = "Add a photo",
  hint,
}: {
  photo: PhotoState;
  onPick: (file: File) => void | Promise<void>;
  onRetry: () => void;
  onRemove: () => void;
  label?: string;
  hint?: string;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const choose = () => inputRef.current?.click();

  return (
    <>
      {/* No `capture` attribute: it sends a phone straight to the camera and
          hides the camera roll, and the photo worth filing is often one that
          was taken an hour ago. */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = ""; // so choosing the same photo again still fires
          if (file) void onPick(file);
        }}
      />

      {photo.kind === "none" ? (
        <>
          <Button variant="secondary" onClick={choose} className="justify-self-start">
            {label}
          </Button>
          {hint && <span className="text-xs text-[var(--anchor-gray)]">{hint}</span>}
        </>
      ) : (
        <div className="flex items-start gap-3 rounded-xl border border-black/10 p-3">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[var(--surface-strong)]">
            {photo.previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photo.previewUrl} alt={photo.name} className="h-full w-full object-cover" />
            ) : (
              <span className="px-1 text-center text-[10px] font-semibold text-[var(--anchor-gray)]">
                IMG
              </span>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-[var(--anchor-deep)]">{photo.name}</div>
            <div className="mt-0.5 text-xs">
              {photo.kind === "uploading" && (
                <span className="text-[var(--anchor-gray)]">
                  {photo.previewUrl ? "Uploading…" : "Preparing…"}
                </span>
              )}
              {photo.kind === "ready" && <span className="text-[var(--anchor-green)]">Uploaded</span>}
              {photo.kind === "error" && <span className="text-red-700">{photo.message}</span>}
            </div>

            <div className="mt-2 flex flex-wrap gap-2">
              {photo.kind === "error" && photo.jpeg && (
                <Button variant="secondary" className="!px-3 !py-1 text-xs" onClick={onRetry}>
                  Try again
                </Button>
              )}
              {photo.kind === "error" && !photo.jpeg && (
                <Button variant="secondary" className="!px-3 !py-1 text-xs" onClick={choose}>
                  Choose another
                </Button>
              )}
              <Button variant="ghost" className="!px-3 !py-1 text-xs" onClick={onRemove}>
                {photo.kind === "uploading" ? "Cancel" : "Remove"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
