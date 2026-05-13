"use client";

import { Suspense, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";

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

function DocViewer() {
  const params = useSearchParams();
  const router = useRouter();

  const path = params?.get("path") || "";
  const from = params?.get("from") || "/dashboard";
  const title = params?.get("title") || basenameFromPath(path);
  const backLabel = deriveBackLabel(from);

  const inlineSrc = useMemo(() => {
    if (!path) return "";
    return `/api/doc-open?path=${encodeURIComponent(path)}&download=0`;
  }, [path]);

  const downloadHref = useMemo(() => {
    if (!path) return "";
    return `/api/doc-open?path=${encodeURIComponent(path)}&download=1`;
  }, [path]);

  function goBack() {
    // Prefer history.back so scroll position on the source page is preserved.
    // Fall back to an explicit navigation if there's no entry to go back to
    // (e.g., the user opened the viewer URL directly).
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.replace(from);
    }
  }

  return (
    <main className="ds-page flex h-dvh min-h-dvh flex-col">
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

        <a
          href={downloadHref}
          className="shrink-0 rounded-lg border border-[var(--anchor-green)] px-2.5 py-1.5 text-xs font-semibold text-[var(--anchor-green)] transition-colors hover:bg-[var(--anchor-green)] hover:text-white sm:text-sm"
          aria-label="Download document"
        >
          Download
        </a>
      </header>

      <div className="flex-1 overflow-hidden bg-[var(--surface-page)]">
        {inlineSrc ? (
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
        ) : (
          <div className="p-6 text-sm text-[var(--anchor-gray)]">No document specified.</div>
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
