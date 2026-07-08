"use client";

// In-app multi-shot camera. Opens a live rear-camera preview and lets the user
// snap several photos in a row — each one stacks up as a thumbnail — then "Done"
// hands the whole batch back at once. This keeps a rep on a roof from bouncing
// back to the form after every single shot. Captured frames are plain JPEG
// Files, so the caller's existing compression + upload flow applies unchanged.
//
// Rendered through a portal to <body> at the maximum z-index so the app's
// header/nav can never cover the controls. UI is intentionally minimal: a live
// preview, one small close (X), a shutter, and Done — no menu bar.

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type Shot = { id: string; file: File; url: string };

export default function CameraCapture({
  open,
  onClose,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  onDone: (files: File[]) => void;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const shotsRef = useRef<Shot[]>([]);
  const seqRef = useRef(0);

  const [shots, setShots] = useState<Shot[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Keep a ref copy so cleanup can revoke object URLs without stale closures.
  shotsRef.current = shots;

  useEffect(() => setMounted(true), []);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    const v = videoRef.current;
    if (v) v.srcObject = null;
  }, []);

  const startStream = useCallback(async () => {
    setReady(false);
    setError(null);
    stopStream();
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("This browser doesn't support in-app camera capture.");
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" }, // rear camera for roof photos
          width: { ideal: 2560 },
          height: { ideal: 1440 },
        },
        audio: false,
      });
      streamRef.current = stream;
      const v = videoRef.current;
      if (v) {
        v.srcObject = stream;
        await v.play().catch(() => {});
      }
      setReady(true);
    } catch (e: unknown) {
      const name = (e as { name?: string })?.name || "";
      if (name === "NotAllowedError" || name === "SecurityError") {
        setError("Camera access was blocked. Allow the camera in your browser settings, or add photos from your library instead.");
      } else if (name === "NotFoundError" || name === "OverconstrainedError" || name === "NotReadableError") {
        setError("Couldn't reach a camera. Add photos from your library instead.");
      } else {
        setError((e as { message?: string })?.message || "Couldn't open the camera. Add photos from your library instead.");
      }
    }
  }, [stopStream]);

  // Open/close lifecycle: reset the batch, start the stream, and always tear the
  // stream + object URLs down on close/unmount.
  useEffect(() => {
    if (!open) return;
    seqRef.current = 0;
    setShots([]);
    void startStream();
    return () => {
      stopStream();
      shotsRef.current.forEach((s) => URL.revokeObjectURL(s.url));
    };
    // Intentionally only re-run when `open` toggles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const capture = useCallback(async () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth || !v.videoHeight) return;
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.92));
    if (!blob) return;
    seqRef.current += 1;
    const n = seqRef.current;
    const file = new File([blob], `photo-${Date.now()}-${n}.jpg`, {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
    const url = URL.createObjectURL(blob);
    setShots((prev) => [...prev, { id: `${Date.now()}-${n}`, file, url }]);
  }, []);

  const removeShot = useCallback((id: string) => {
    setShots((prev) => {
      const gone = prev.find((s) => s.id === id);
      if (gone) URL.revokeObjectURL(gone.url);
      return prev.filter((s) => s.id !== id);
    });
  }, []);

  const finish = useCallback(() => {
    const files = shots.map((s) => s.file);
    stopStream();
    shots.forEach((s) => URL.revokeObjectURL(s.url));
    onDone(files);
  }, [shots, stopStream, onDone]);

  const close = useCallback(() => {
    stopStream();
    shots.forEach((s) => URL.revokeObjectURL(s.url));
    onClose();
  }, [shots, stopStream, onClose]);

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 flex flex-col bg-black" style={{ zIndex: 2147483647 }}>
      {/* Live preview */}
      <div className="relative flex-1 overflow-hidden">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 h-full w-full object-cover"
        />

        {/* Single small close button — no menu bar. */}
        <button
          type="button"
          onClick={close}
          aria-label="Close camera"
          className="absolute right-3 flex h-10 w-10 items-center justify-center rounded-full bg-black/50 text-white backdrop-blur"
          style={{ top: "calc(env(safe-area-inset-top, 0px) + 12px)" }}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
        </button>

        {error && (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
            <p className="max-w-sm text-sm text-white/90">{error}</p>
          </div>
        )}
      </div>

      {/* Thumbnails of what's been captured so far */}
      {shots.length > 0 && (
        <div className="flex gap-2 overflow-x-auto bg-black px-3 py-2">
          {shots.map((s) => (
            <div key={s.id} className="relative shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={s.url} alt="" className="h-16 w-16 rounded-md object-cover" />
              <button
                type="button"
                onClick={() => removeShot(s.id)}
                aria-label="Remove photo"
                className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/80 text-[12px] leading-none text-white"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Bottom bar: centered shutter + Done (with count). */}
      <div
        className="relative flex items-center justify-center bg-black px-6 pt-3"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 24px)" }}
      >
        <button
          type="button"
          onClick={capture}
          disabled={!ready || !!error}
          aria-label="Take photo"
          className="flex h-[76px] w-[76px] items-center justify-center rounded-full border-4 border-white/85 disabled:opacity-40"
        >
          <span className="h-[58px] w-[58px] rounded-full bg-white" />
        </button>
        <button
          type="button"
          onClick={finish}
          disabled={shots.length === 0}
          className="absolute right-6 text-base font-semibold text-white disabled:opacity-40"
        >
          Done{shots.length ? ` (${shots.length})` : ""}
        </button>
      </div>
    </div>,
    document.body,
  );
}
