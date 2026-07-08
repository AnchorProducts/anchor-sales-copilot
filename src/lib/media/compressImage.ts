// Client-side image compression.
//
// Roof photos taken on a phone are frequently 5-12 MB each (and 48MP iPhones
// push HEIC files well past that). Both the REC form and the Resource Library
// attach these before uploading, and large originals either blow the platform
// request-size limit, hit Supabase's per-file cap, or simply fail on a flaky
// mobile connection. Shrinking images in the browser first keeps uploads small
// and fast.
//
// We attempt to decode ANY image the browser can — including HEIC/HEIF, which
// iOS Safari decodes natively — and re-encode to JPEG. Anything we can't decode
// (most notably video, or HEIC on a desktop browser that lacks a decoder) is
// returned untouched so the caller's existing handling still applies.

export type CompressOptions = {
  /** Longest edge of the output image, in pixels. */
  maxDimension?: number;
  /** Initial JPEG quality, 0-1. */
  quality?: number;
  /**
   * Skip compression for images already smaller than this (bytes). Tiny images
   * gain nothing and re-encoding can even grow them.
   */
  skipUnderBytes?: number;
  /**
   * Target output size (bytes). If the first encode is larger, we step quality
   * (then dimension) down until the result fits or we hit the floor.
   */
  targetBytes?: number;
};

const DEFAULTS: Required<CompressOptions> = {
  maxDimension: 2000,
  quality: 0.7,
  skipUnderBytes: 300 * 1024, // 300 KB
  targetBytes: 1.5 * 1024 * 1024, // 1.5 MB
};

// Quality floor and the ladder we walk down toward the target size.
const QUALITY_STEPS = [0.7, 0.6, 0.5, 0.42, 0.35];
const MIN_DIMENSION = 1024;

function isImageCandidate(file: File): boolean {
  const type = (file.type || "").toLowerCase();
  if (type.startsWith("image/")) return true;
  // Some browsers hand back an empty type for HEIC/HEIF; fall back to the name.
  if (type.startsWith("video/")) return false;
  return /\.(jpe?g|png|webp|heic|heif|gif|bmp|tiff?|avif)$/i.test(file.name || "");
}

function loadBitmap(file: File): Promise<{ width: number; height: number; draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void; cleanup: () => void }> {
  // Prefer createImageBitmap (decodes off the main thread, and on iOS Safari
  // handles HEIC) when available. imageOrientation: "from-image" applies the
  // EXIF orientation tag so phone photos aren't stored sideways once we
  // re-encode and drop the EXIF metadata.
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(file, { imageOrientation: "from-image" }).then((bmp) => ({
      width: bmp.width,
      height: bmp.height,
      draw: (ctx, w, h) => ctx.drawImage(bmp, 0, 0, w, h),
      cleanup: () => bmp.close(),
    }));
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () =>
      resolve({
        width: img.naturalWidth,
        height: img.naturalHeight,
        draw: (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h),
        cleanup: () => URL.revokeObjectURL(url),
      });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to decode image"));
    };
    img.src = url;
  });
}

function encode(
  bitmap: { draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void },
  targetW: number,
  targetH: number,
  quality: number
): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.resolve(null);
  // We always encode to JPEG, which has no alpha channel. Without a fill,
  // transparent regions of a PNG/WebP flatten to black; paint white first so
  // transparency reads as a normal background instead.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, targetW, targetH);
  bitmap.draw(ctx, targetW, targetH);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
}

/**
 * Compress a single image file. Returns a new JPEG File on success, or the
 * original file unchanged when the input isn't a decodable image, is already
 * small, or the re-encoded result would be larger.
 */
export async function compressImage(file: File, opts: CompressOptions = {}): Promise<File> {
  const { maxDimension, quality, skipUnderBytes, targetBytes } = { ...DEFAULTS, ...opts };

  if (typeof document === "undefined") return file; // SSR / non-browser guard
  if (!isImageCandidate(file)) return file; // videos and non-images pass through
  // Already-small JPEGs gain nothing. (HEIC/PNG are still worth converting even
  // when small — HEIC for compatibility, PNG because it's often huge — so only
  // short-circuit true JPEGs here.)
  const isJpeg = (file.type || "").toLowerCase() === "image/jpeg";
  if (isJpeg && file.size <= skipUnderBytes) return file;

  let bitmap: Awaited<ReturnType<typeof loadBitmap>> | null = null;
  try {
    bitmap = await loadBitmap(file);
    const { width, height } = bitmap;
    if (!width || !height) return file;

    let dimension = maxDimension;
    let best: Blob | null = null;

    // Walk quality down first; if we still can't hit the target at the lowest
    // quality, shrink the longest edge and try the ladder again.
    while (dimension >= MIN_DIMENSION) {
      const scale = Math.min(1, dimension / Math.max(width, height));
      const targetW = Math.max(1, Math.round(width * scale));
      const targetH = Math.max(1, Math.round(height * scale));

      for (const q of QUALITY_STEPS) {
        if (q > quality) continue; // respect a lower caller-supplied ceiling
        const blob = await encode(bitmap, targetW, targetH, q);
        if (!blob) continue;
        best = blob;
        if (blob.size <= targetBytes) {
          return finalize(blob, file);
        }
      }
      dimension = Math.round(dimension * 0.8); // shrink and retry the ladder
    }

    // Couldn't reach the target, but keep the smallest encode if it beats the
    // original; otherwise leave the original alone.
    if (best && best.size < file.size) return finalize(best, file);
    return file;
  } catch {
    return file; // any failure: fall back to the original file
  } finally {
    bitmap?.cleanup();
  }
}

function finalize(blob: Blob, original: File): File {
  const newName = original.name.replace(/\.[^.]+$/, "") + ".jpg";
  return new File([blob], newName, { type: "image/jpeg", lastModified: original.lastModified });
}

/** Compress a batch of files, preserving order. Non-images pass through. */
export function compressImages(files: File[], opts?: CompressOptions): Promise<File[]> {
  return Promise.all(files.map((f) => compressImage(f, opts)));
}
