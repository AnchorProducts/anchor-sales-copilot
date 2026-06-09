"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";

export const dynamic = "force-dynamic";

function basenameFromPath(p: string): string {
  const seg = p.split("/").filter(Boolean).pop() || p;
  return seg.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ").trim() || "Document";
}

function deriveBackLabel(from: string): string {
  if (from.startsWith("/chat")) return "Copilot";
  if (from.startsWith("/internal-assets/docs")) return "Documents";
  if (from.startsWith("/internal-assets")) return "Internal Assets";
  if (from.startsWith("/assets")) return "Solution";
  return "Back";
}

function isMobileDevice() {
  if (typeof navigator === "undefined") return false;
  return /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

// Office docs (Word/PowerPoint/Excel) have no native renderer in mobile
// browsers. We render them inline via the Microsoft Office Online viewer,
// which needs a publicly fetchable URL — we pass it a short-lived signed URL.
const OFFICE_EXTS = new Set(["doc", "docx", "ppt", "pptx", "xls", "xlsx"]);
// Images render in an <img> here rather than via top-level navigation. This is
// required for SVG: Supabase serves SVGs with content-disposition:attachment +
// a sandbox CSP (anti-XSS), so navigating to one downloads/blanks on mobile.
// An <img> ignores those headers and can't execute SVG scripts, so it's both
// functional and safe. (Also fixes desktop, where images hit the PDF fallback.)
const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "webp", "svg", "gif", "avif", "bmp"]);
function extOf(path: string) {
  const m = path.split("?")[0].toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : "";
}

function DocViewer() {
  const params = useSearchParams();
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);

  const path = params?.get("path") || "";
  const from = params?.get("from") || "/dashboard";
  const title = params?.get("title") || basenameFromPath(path);
  const backLabel = deriveBackLabel(from);

  // Session token so the mobile redirect / download can authenticate /api/doc-open
  // (a top-level navigation can't send the auth cookie). null = not loaded yet.
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (alive) setToken(data?.session?.access_token || "");
    });
    return () => { alive = false; };
  }, [supabase]);

  const tokenQS = token ? `&token=${encodeURIComponent(token)}` : "";

  const isOffice = OFFICE_EXTS.has(extOf(path));
  const isImage = IMAGE_EXTS.has(extOf(path));

  const inlineSrc = useMemo(() => {
    if (!path) return "";
    return `/api/doc-open?path=${encodeURIComponent(path)}&download=0${tokenQS}`;
  }, [path, tokenQS]);

  // For Office docs, fetch a signed URL and embed the Microsoft Office Online
  // viewer (renders Word/PPT/Excel inline on mobile + desktop). "" = loading,
  // null = failed.
  const [officeSrc, setOfficeSrc] = useState<string | "" | null>("");
  useEffect(() => {
    if (!isOffice || !path || token === null) return;
    let alive = true;
    fetch(`/api/doc-open?path=${encodeURIComponent(path)}&download=0&mode=url${tokenQS}`, {
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!alive) return;
        const url = j?.url as string | undefined;
        setOfficeSrc(
          url
            ? `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`
            : null
        );
      })
      .catch(() => {
        if (alive) setOfficeSrc(null);
      });
    return () => {
      alive = false;
    };
  }, [isOffice, path, token, tokenQS]);

  // On mobile, the <object> PDF embed below falls back to a "can't preview"
  // screen on iOS Safari. Hand the doc straight to the phone's browser
  // (its native PDF viewer) instead. Office docs are excluded — they render
  // inline via the Office viewer iframe. Wait until the token is resolved so
  // the redirect URL is authenticated.
  useEffect(() => {
    if (!inlineSrc || token === null) return;
    if (isOffice || isImage) return;
    if (!isMobileDevice()) return;
    window.location.replace(inlineSrc);
  }, [inlineSrc, token, isOffice, isImage]);

  const downloadHref = useMemo(() => {
    if (!path) return "";
    return `/api/doc-open?path=${encodeURIComponent(path)}&download=1${tokenQS}`;
  }, [path, tokenQS]);

  function downloadDoc() {
    if (!downloadHref || typeof document === "undefined") return;
    // Programmatic click so the current page stays mounted (with its
    // Back button) instead of the tab navigating to a file-stream URL,
    // which renders a black screen on mobile Safari.
    const a = document.createElement("a");
    a.href = downloadHref;
    a.rel = "noopener";
    a.download = title;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function goBack() {
    // Go straight to the originating page rather than history.back(): the viewer
    // is opened via a hard navigation, and the embedded Office viewer pushes its
    // own entries onto the session history on iOS, so "back" doesn't reliably
    // return to the tacklebox. `from` is always the page that opened the viewer.
    // Guard against a manipulated `from` (must be a same-origin path, not a
    // protocol-relative or absolute URL) so this can't become an open redirect.
    const dest = /^\/(?!\/)/.test(from) ? from : "/dashboard";
    router.push(dest);
  }

  return (
    // Deliberately NOT .ds-page: the global class adds top/bottom padding to
    // clear the floating back pill and bottom nav, both of which are hidden on
    // /docs/* so the viewer can be full-screen. The header handles the iOS
    // safe-area itself.
    <main className="flex h-dvh min-h-dvh flex-col overflow-hidden bg-[var(--surface-page)]">
      <header
        className="sticky top-0 z-10 flex items-center gap-2 border-b border-[var(--border-default)] bg-[var(--surface-card)] px-3 sm:gap-3 sm:px-5"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 0.65rem)", paddingBottom: "0.65rem" }}
      >
        <button
          type="button"
          onClick={goBack}
          aria-label={`Back to ${backLabel}`}
          className="flex shrink-0 items-center gap-1.5 rounded-lg px-2 py-2 text-sm font-semibold text-[var(--anchor-deep)] transition-colors hover:bg-[var(--surface-soft)]"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.25}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5"
            aria-hidden
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
          <span className="hidden sm:inline">Back to {backLabel}</span>
          <span className="sm:hidden">Back</span>
        </button>

        <div className="min-w-0 flex-1 truncate text-center text-sm font-semibold text-[var(--anchor-deep)] sm:text-base">
          {title}
        </div>

        <button
          type="button"
          onClick={downloadDoc}
          className="shrink-0 rounded-lg border border-[var(--anchor-green)] px-2.5 py-1.5 text-xs font-semibold text-[var(--anchor-green)] transition-colors hover:bg-[var(--anchor-green)] hover:text-white sm:text-sm"
          aria-label="Download document"
        >
          Download
        </button>
      </header>

      <div className="flex-1 overflow-auto bg-[var(--surface-page)]">
        {!inlineSrc ? (
          <div className="p-6 text-sm text-[var(--anchor-gray)]">No document specified.</div>
        ) : isImage ? (
          // Images (incl. SVG) render in an <img> so they display inline on
          // mobile instead of downloading. overflow-auto on the container lets
          // tall drawings scroll; the browser handles pinch-zoom.
          <div className="flex min-h-full items-center justify-center p-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={inlineSrc}
              alt={title}
              className="max-w-full object-contain"
            />
          </div>
        ) : isOffice ? (
          // Word/PowerPoint/Excel via the Microsoft Office Online viewer.
          officeSrc === "" ? (
            <div className="flex h-full items-center justify-center p-6 text-sm text-[var(--anchor-gray)]">
              Loading preview…
            </div>
          ) : officeSrc ? (
            <iframe
              src={officeSrc}
              title={title}
              className="h-full w-full border-0"
              allowFullScreen
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
              <p className="text-sm text-[var(--anchor-gray)]">
                This document couldn&apos;t be previewed.
              </p>
              <button
                type="button"
                onClick={downloadDoc}
                className="rounded-lg bg-[var(--anchor-green)] px-4 py-2 text-sm font-semibold text-white"
              >
                Download document
              </button>
            </div>
          )
        ) : (
          // <object> renders inline on desktop browsers AND falls back to its
          // children on iOS where iframe PDF rendering is not supported.
          <object data={inlineSrc} type="application/pdf" className="h-full w-full">
            <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
              <p className="text-sm text-[var(--anchor-gray)]">
                This document can&apos;t preview inline on this device.
              </p>
              <a
                href={inlineSrc}
                className="rounded-lg bg-[var(--anchor-green)] px-4 py-2 text-sm font-semibold text-white"
              >
                Open document
              </a>
            </div>
          </object>
        )}
      </div>
    </main>
  );
}

export default function DocViewerPage() {
  return (
    <Suspense fallback={<main className="ds-page p-6 text-sm text-[var(--anchor-gray)]">Loading…</main>}>
      <DocViewer />
    </Suspense>
  );
}
