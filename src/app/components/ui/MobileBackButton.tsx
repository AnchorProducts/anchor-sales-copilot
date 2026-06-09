"use client";

import { usePathname, useRouter } from "next/navigation";

// A floating top-left "← Back" button for mobile. The app's top navbar is hidden
// app-wide (see AppNavbar) and, as an installed PWA (manifest display:standalone),
// there's no browser back button — so without this, a rep deep in a form or
// detail page has no obvious way out except the bottom-nav Dashboard. Mounted
// once globally in the root layout, alongside the other floating controls
// (AdminViewAsSwitcher, PageHelpButton).
//
// Desktop has the sidebar, so this is mobile-only (lg:hidden). It's hidden on
// top-level/home and auth screens where "back" has no meaning. A worded pill
// (not a bare arrow) reads clearer for less app-savvy users.

const HIDE_EXACT = new Set(["/", "/dashboard", "/signup", "/forgot", "/reset"]);
// /docs/* is a full-screen document viewer with its own in-header Back button —
// the floating pill would be a redundant second "Back".
const HIDE_PREFIXES = ["/auth", "/docs"];

export function MobileBackButton() {
  const pathname = usePathname() || "";
  const router = useRouter();

  if (HIDE_EXACT.has(pathname)) return null;
  if (HIDE_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"))) return null;

  const onClick = () => {
    // Prefer real history (what users expect from "back"); fall back to the
    // dashboard when there's nothing to go back to (e.g. a deep-linked open).
    if (typeof window !== "undefined" && window.history.length > 1) router.back();
    else router.push("/dashboard");
  };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Back"
      title="Back"
      className="fixed z-[60] flex h-8 items-center gap-0.5 rounded-full border border-white/15 bg-[var(--anchor-deep)] pl-1.5 pr-3 text-white shadow-[0_6px_18px_rgba(0,0,0,0.2)] transition hover:bg-[var(--anchor-green)] active:scale-95 left-[calc(env(safe-area-inset-left)+12px)] top-[calc(env(safe-area-inset-top)+10px)] lg:hidden"
    >
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M15 18l-6-6 6-6" />
      </svg>
      <span className="text-xs font-semibold">Back</span>
    </button>
  );
}
