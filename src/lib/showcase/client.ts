import { useEffect, useRef } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";

/* ============================================================================
 * The browser half of the showcase: the shapes the website returns, the one
 * fetch wrapper every screen goes through, and turning a phone photo into
 * something the public site can actually show.
 * ==========================================================================*/

export type StopStatus = "pending" | "published" | "declined";

export type PhotoStatus = "pending" | "published" | "declined";

/** One photograph on a stop. Each is reviewed on its own. */
export type StopPhoto = {
  id: string;
  status: PhotoStatus;
  /** Public address when published; otherwise a signed preview that expires
   *  after 30 minutes, or null. Lists refetch on focus, so it stays fresh. */
  url: string | null;
  reviewNote: string | null;
  mine: boolean;
  submittedAt: string;
};

/** GET /api/showcase/submit — the caller's own filings, newest first. */
export type Submission = {
  id: string;
  date: string;
  city: string;
  event: string;
  note: string | null;
  status: StopStatus;
  reviewNote: string | null;
  submittedAt: string;
  /** Only the photographs this caller attached. */
  photos: StopPhoto[];
};

/** GET /api/showcase/stops — every stop, ascending by date. Keepers only. */
export type ScheduleStop = {
  id: string;
  date: string;
  city: string;
  event: string;
  requested: boolean;
  note: string | null;
  status: StopStatus;
  reviewNote: string | null;
  mine: boolean;
  submittedAt: string | null;
  photos: StopPhoto[];
};

export const MAX_TEXT = 200;
export const MAX_NOTE = 1000;
/** Per filing or per add — the website refuses more in one request. */
export const MAX_PHOTOS = 10;

export function photoCounts(photos: StopPhoto[]) {
  let live = 0;
  let pending = 0;
  let declined = 0;
  for (const p of photos) {
    if (p.status === "published") live++;
    else if (p.status === "pending") pending++;
    else declined++;
  }
  return { live, pending, declined };
}

/** "3 photos: 2 live · 1 in review", or "No photos". */
export function photoSummary(photos: StopPhoto[]): string {
  if (!photos.length) return "No photos";
  const c = photoCounts(photos);
  const parts = [
    c.live ? `${c.live} live` : "",
    c.pending ? `${c.pending} in review` : "",
    c.declined ? `${c.declined} declined` : "",
  ].filter(Boolean);
  return `${photos.length} photo${photos.length === 1 ? "" : "s"}: ${parts.join(" · ")}`;
}

/** A past stop on the site with nothing from the day, live or on its way. */
export function needsPhotos(stop: ScheduleStop, day: string): boolean {
  return (
    stop.date < day &&
    stop.status === "published" &&
    !stop.photos.some((p) => p.status !== "declined")
  );
}

/** The picture a stop is shown with: a live one, else one in review. */
export function coverUrl(photos: StopPhoto[]): string | null {
  return (
    photos.find((p) => p.status === "published" && p.url)?.url ??
    photos.find((p) => p.status === "pending" && p.url)?.url ??
    null
  );
}

/** `code` on the 403 from our own assigned-list gate (src/lib/showcase/portal.ts),
 *  so it can't be mistaken for the website's "doesn't keep the schedule". */
export const NOT_ASSIGNED = "not_assigned";

export const NO_ACCESS =
  "Your anchorp.com account isn't authorized for the showcase yet — ask marketing to add you to Portal Access.";

export type ApiResult<T> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; error: string; code?: string };

/** Today in the viewer's own timezone as yyyy-mm-dd — most stops are filed the
 *  day they happen, and a UTC-derived default is the wrong day all evening. */
export function today(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

/** "2026-09-14" → "Mon, Sep 14, 2026", read as a calendar day, not UTC midnight. */
export function formatDay(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return ymd;
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** The website's errors are terse and lower-case ("that stop is no longer there"). */
function sentence(text: string): string {
  const t = text.trim();
  if (!t) return t;
  return t[0].toUpperCase() + t.slice(1) + (/[.!?]$/.test(t) ? "" : ".");
}

/**
 * Call one of our /api/showcase routes with the caller's Supabase token.
 *
 * The token is read fresh on every call rather than held, and a 401 gets one
 * session refresh and one retry — a phone that sat in a pocket all afternoon
 * usually just has an expired token, and that shouldn't read as "no access".
 * Never throws: the screens only ever deal with a result.
 */
export async function showcaseFetch<T>(
  supabase: SupabaseClient,
  path: string,
  init: { method: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown } = { method: "GET" }
): Promise<ApiResult<T>> {
  const send = async (): Promise<Response | ApiResult<T>> => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return { ok: false, status: 401, error: "Your session expired. Sign in again." };
    try {
      return await fetch(path, {
        method: init.method,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
        cache: "no-store",
      });
    } catch {
      return {
        ok: false,
        status: 0,
        error: "Couldn't reach the server. Check your connection and try again.",
      };
    }
  };

  let res = await send();
  if (res instanceof Response && res.status === 401) {
    await supabase.auth.refreshSession().catch(() => null);
    res = await send();
  }
  if (!(res instanceof Response)) return res;

  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (res.ok) return { ok: true, status: res.status, data: (json ?? {}) as T };

  const code = typeof json?.code === "string" ? json.code : undefined;
  const raw = typeof json?.error === "string" ? json.error : "";
  let error: string;
  if (res.status === 401) error = NO_ACCESS;
  else if (res.status === 403 && code !== NOT_ASSIGNED) {
    error = "You don't have access to the showcase schedule.";
  } else if (res.status === 409) {
    error = "That photo is already on the site. Ask marketing to change a published photo.";
  } else error = raw ? sentence(raw) : "Something went wrong. Try again.";
  return { ok: false, status: res.status, error, code };
}

/* ── Photos ────────────────────────────────────────────────────────────────
 * Every photo is re-encoded to JPEG before it uploads. An iPhone shoots HEIC,
 * the website accepts it, and publishing copies the file to the public page
 * unchanged — where Chrome, Firefox and Android show a broken image. Shrinking
 * the long edge also turns a 6 MB photo into a fast upload from a yard, and
 * drawing it to a canvas drops the EXIF block (GPS included) on the way. */

const LONG_EDGE = 2400;
const JPEG_QUALITY = 0.8;

type Decoded = { source: CanvasImageSource; width: number; height: number; close: () => void };

async function decode(file: File): Promise<Decoded> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
    } catch {
      /* fall through to <img>, which is how Safari decodes HEIC */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return {
      source: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      close: () => URL.revokeObjectURL(url),
    };
  } catch (e) {
    URL.revokeObjectURL(url);
    throw e;
  }
}

export async function toJpeg(file: File): Promise<File> {
  let image: Decoded;
  try {
    image = await decode(file);
  } catch {
    // Chrome on a desktop can't read HEIC at all. A phone's own browser can.
    throw new Error("This browser can't open that photo. Choose a JPEG or PNG instead.");
  }

  try {
    const scale = Math.min(1, LONG_EDGE / Math.max(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Couldn't prepare that photo. Try again.");
    ctx.fillStyle = "#fff"; // a transparent PNG would otherwise go black
    ctx.fillRect(0, 0, width, height);
    ctx.drawImage(image.source, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY)
    );
    if (!blob) throw new Error("Couldn't prepare that photo. Try again.");

    const base = file.name.replace(/\.[^.]+$/, "").replace(/[^\w-]+/g, "-").slice(0, 60) || "photo";
    return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
  } finally {
    image.close();
  }
}

/**
 * Upload an already-converted JPEG: ask the website for a single-use signed
 * URL, then send the bytes straight to Supabase Storage. A retry must come back
 * through here — the token can't be reused.
 */
export async function uploadPhoto(
  supabase: SupabaseClient,
  jpeg: File
): Promise<ApiResult<{ path: string }>> {
  const ticket = await showcaseFetch<{ bucket?: string; path?: string; token?: string }>(
    supabase,
    "/api/showcase/upload-url",
    { method: "POST", body: { filename: jpeg.name } }
  );
  if (!ticket.ok) return ticket;

  const { bucket, path, token } = ticket.data;
  if (!bucket || !path || !token) {
    return { ok: false, status: 500, error: "Couldn't get an upload link. Try again." };
  }

  const failed = {
    ok: false as const,
    status: 0,
    error: "The photo didn't upload. Check your connection and try again.",
  };
  try {
    const { error } = await supabase.storage
      .from(bucket)
      .uploadToSignedUrl(path, token, jpeg, { contentType: "image/jpeg" });
    if (error) return failed;
  } catch {
    return failed;
  }
  return { ok: true, status: 200, data: { path } };
}

/**
 * Refetch when the person comes back to the app. Marketing's decisions don't
 * send notifications, so returning to the screen is how anyone finds out.
 */
export function useRefetchOnFocus(refetch: () => void) {
  const latest = useRef(refetch);
  useEffect(() => {
    latest.current = refetch;
  }, [refetch]);

  useEffect(() => {
    let last = 0;
    const onReturn = () => {
      if (document.visibilityState !== "visible") return;
      // focus and visibilitychange usually fire together — one fetch, not two
      const now = Date.now();
      if (now - last < 2000) return;
      last = now;
      latest.current();
    };
    window.addEventListener("focus", onReturn);
    document.addEventListener("visibilitychange", onReturn);
    return () => {
      window.removeEventListener("focus", onReturn);
      document.removeEventListener("visibilitychange", onReturn);
    };
  }, []);
}
