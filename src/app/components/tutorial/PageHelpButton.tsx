"use client";

import { usePathname } from "next/navigation";
import { pageTourForPath, startPageTutorial, startTutorial } from "./AppTutorial";

// A floating "?" button that launches the walkthrough for the current page.
// Mounted once globally (in the root layout); it shows only on pages that have
// a tour. AppNavbar is hidden app-wide, so this is the per-page tutorial entry
// point. Sits above the mobile bottom nav and below the tour overlay (z-100).
const HIDE_EXACT = new Set(["/", "/signup", "/forgot", "/reset"]);
const HIDE_PREFIXES = ["/auth"];

export function PageHelpButton() {
  const pathname = usePathname() || "";

  if (HIDE_EXACT.has(pathname)) return null;
  if (HIDE_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"))) return null;

  const key = pageTourForPath(pathname);
  if (!key) return null;

  const onClick = () => {
    // The dashboard's walkthrough is the role tour.
    if (key === "dashboard") startTutorial();
    else startPageTutorial(key);
  };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Page walkthrough"
      title="Walkthrough"
      className="fixed right-4 bottom-24 z-[90] flex h-11 w-11 items-center justify-center rounded-full border border-white/15 bg-[var(--anchor-deep)] text-white shadow-[0_8px_24px_rgba(0,0,0,0.22)] transition hover:bg-[var(--anchor-green)] active:scale-95 lg:bottom-6"
    >
      {/* Play-in-circle = "start the walkthrough" — kept distinct from the
          Support nav item's question mark, and consistent with the View-As
          menu's Replay walkthrough icon. */}
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="12" cy="12" r="9" />
        <path d="M10 8l6 4-6 4z" fill="currentColor" stroke="none" />
      </svg>
    </button>
  );
}
