"use client";

// In-app multi-shot camera. Opens a live rear-camera preview and lets the user
// snap several photos in a row — each one stacks up as a thumbnail — then "Done"
// hands the whole batch back at once. This keeps a rep on a roof from bouncing
// back to the form after every single shot (the native <input capture> closes
// after one photo). Captured frames are plain JPEG Files, so the caller's
// existing compression + upload flow applies unchanged.

import { useCallback, useEffect, useRef, useState } from "react";

type Shot = { id: string; file: File; url: string };
type Facing = "environment" | "user";

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

  const [facing, setFacing] = useState<Facing>("environment");
  const [shots, setShots] = useState<Shot[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  // Keep a ref copy so cleanup can revoke object URLs without stale closures.
  shotsRef.current = shots;

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    const v = videoRef.current;
    if (v) v.srcObject = null;
  }, []);

  const startStream = useCallback(
    async (mode: Facing) => {
      setReady(false);
      setError(null);
      stopStream();
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error("This browser doesn't support in-app camera capture.");
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: mode },
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
          setError("Camera access was blocked. Allow the camera in your browser settings, or use the photo picker instead.");
        } else if (name === "NotFoundError" || name === "OverconstrainedError" || name === "NotReadableError") {
          setError("Couldn't reach a camera. Use the photo picker instead.");
        } else {
          setError((e as { message?: string })?.message || "Couldn't open the camera. Use the photo picker instead.");
        }
      }
    },
    [stopStream]
  );

  // Open/close lifecycle: reset the batch, start the stream, and always tear
  // the stream + object URLs down on close/unmount.
  useEffect(() => {
    if (!open) return;
    seqRef.current = 0;
    setShots([]);
    setFacing("environment");
    void startStream("environment");
    return () => {
      stopStream();
      shotsRef.current.forEach((s) => URL.revokeObjectURL(s.url));
    };
    // Intentionally only re-run when `open` toggles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const flip = useCallback(() => {
    const next: Facing = facing === "environment" ? "user" : "environment";
    setFacing(next);
    void startStream(next);
  }, [facing, startStream]);

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

  const cancel = useCallback(() => {
    stopStream();
    shots.forEach((s) => URL.revokeObjectURL(s.url));
    onClose();
  }, [shots, stopStream, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-black">
      {/* Live preview */}
      <div className="relative flex-1 overflow-hidden">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 h-full w-full object-cover"
        />

        {/* Top controls */}
        <div className="absolute inset-x-0 top-0 flex items-center justify-between p-3">
          <button
            type="button"
            onClick={cancel}
            className="rounded-full bg-black/45 px-4 py-2 text-sm font-semibold text-white backdrop-blur"
          >
            Cancel
          </button>
          <span className="rounded-full bg-black/45 px-3 py-2 text-[12px] font-semibold text-white backdrop-blur">
            {shots.length} photo{shots.length === 1 ? "" : "s"}
          </span>
          {!error && (
            <button
              type="button"
              onClick={flip}
              aria-label="Switch camera"
              className="rounded-full bg-black/45 p-2 text-white backdrop-blur"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h6"/><path d="M13 20h7a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-6"/><path d="m7 9-3 3 3 3"/><path d="m17 15 3-3-3-3"/></svg>
            </button>
          )}
        </div>

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

      {/* Bottom bar: shutter + done */}
      <div className="flex items-center justify-between bg-black px-6 pb-8 pt-3">
        <div className="w-20" />
        <button
          type="button"
          onClick={capture}
          disabled={!ready || !!error}
          aria-label="Take photo"
          className="flex h-[72px] w-[72px] items-center justify-center rounded-full border-4 border-white/80 disabled:opacity-40"
        >
          <span className="h-14 w-14 rounded-full bg-white" />
        </button>
        <button
          type="button"
          onClick={finish}
          disabled={shots.length === 0}
          className="w-20 text-right text-base font-semibold text-white disabled:opacity-40"
        >
          Done
        </button>
      </div>
    </div>
  );
}
