// Client-side image compression.
//
// Roof photos taken on a phone are frequently 5-12 MB each. The /api/leads
// route receives every file's bytes through the serverless function before
// streaming them to Supabase storage, so a few full-resolution photos blow past
// the platform request-size limit and the host returns a plain-text "Request
// Entity Too Large" page (HTTP 413). Shrinking images in the browser before
// they're attached keeps the upload well under that limit and is faster for the
// user too.
//
// Only raster images are compressed. Videos and anything we can't decode are
// returned untouched so the caller's existing handling still applies.

export type CompressOptions = {
  /** Longest edge of the output image, in pixels. */
  maxDimension?: number;
  /** JPEG/WebP quality, 0-1. */
  quality?: number;
  /**
   * Skip compression for images already smaller than this (bytes). Tiny images
   * gain nothing and re-encoding can even grow them.
   */
  skipUnderBytes?: number;
};

const DEFAULTS: Required<CompressOptions> = {
  maxDimension: 2000,
  quality: 0.7,
  skipUnderBytes: 300 * 1024, // 300 KB
};

function isCompressibleImage(file: File): boolean {
  const type = (file.type || "").toLowerCase();
  // HEIC/HEIF can't be decoded by <canvas> in most browsers; leave it alone.
  return (
    type === "image/jpeg" ||
    type === "image/png" ||
    type === "image/webp"
  );
}

function loadBitmap(file: File): Promise<{ width: number; height: number; draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void; cleanup: () => void }> {
  // Prefer createImageBitmap (decodes off the main thread) when available.
  // imageOrientation: "from-image" applies the EXIF orientation tag so photos
  // taken on a phone (which store rotation as metadata, not baked-in pixels)
  // aren't stored sideways once we re-encode and drop the EXIF tag.
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

/**
 * Compress a single image file. Returns a new File on success, or the original
 * file unchanged when the input isn't a compressible image, is already small,
 * decoding fails, or the re-encoded result would be larger.
 */
export async function compressImage(file: File, opts: CompressOptions = {}): Promise<File> {
  const { maxDimension, quality, skipUnderBytes } = { ...DEFAULTS, ...opts };

  if (typeof document === "undefined") return file; // SSR / non-browser guard
  if (!isCompressibleImage(file)) return file;
  if (file.size <= skipUnderBytes) return file;

  let bitmap: Awaited<ReturnType<typeof loadBitmap>> | null = null;
  try {
    bitmap = await loadBitmap(file);
    const { width, height } = bitmap;
    if (!width || !height) return file;

    const scale = Math.min(1, maxDimension / Math.max(width, height));
    const targetW = Math.max(1, Math.round(width * scale));
    const targetH = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = targetW;
    canvas.height = targetH;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    // We always encode to JPEG, which has no alpha channel. Without a fill,
    // transparent regions of a PNG/WebP flatten to black; paint white first so
    // transparency reads as a normal background instead.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, targetW, targetH);
    bitmap.draw(ctx, targetW, targetH);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", quality)
    );
    if (!blob || blob.size >= file.size) return file; // no win — keep original

    const newName = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], newName, { type: "image/jpeg", lastModified: file.lastModified });
  } catch {
    return file; // any failure: fall back to the original file
  } finally {
    bitmap?.cleanup();
  }
}

/** Compress a batch of files, preserving order. Non-images pass through. */
export function compressImages(files: File[], opts?: CompressOptions): Promise<File[]> {
  return Promise.all(files.map((f) => compressImage(f, opts)));
}
