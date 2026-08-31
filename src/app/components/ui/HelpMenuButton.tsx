"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { useEffectiveRole } from "@/lib/role/viewAs";
import { pageTourForPath, startPageTutorial, startTutorial } from "@/app/components/tutorial/AppTutorial";
import { openInstallGuide, isMobileDevice } from "@/app/components/InstallGate";
import {
  useHideWhenOverlapping,
  HIDE_WHEN_OVERLAPPING_CLASS,
  SHOW_WHEN_CLEAR_CLASS,
} from "@/app/components/ui/useHideWhenOverlapping";

// Single floating Help button (bottom-right). Opens a small menu with:
//   • Page walkthrough — the guided tour for the current page (when one exists)
//   • Install on your phone — home-screen install steps (phone browsers only)
//   • Ask a question   — files a support request
//   • FAQ              — common questions
// Replaces the separate walkthrough + support floating buttons.
const HIDE_EXACT = new Set(["/", "/signup", "/forgot", "/reset"]);
// /grab/* is the PUBLIC marketing-aisle page, opened by scanning a QR code
// on a shelf. Whoever is holding the phone may have no account at all, so
// every piece of app chrome on it is either a dead end or a way out of the
// one thing they came to do.
const HIDE_PREFIXES = ["/auth", "/docs", "/grab"];

// Is this the installed home-screen app rather than a browser tab? iOS Safari
// answers with its own non-standard flag instead of the display-mode query.
function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function subscribeDisplayMode(onChange: () => void) {
  const mq = window.matchMedia("(display-mode: standalone)");
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

// The user agent never changes mid-session, so there is nothing to subscribe to.
function subscribeNothing() {
  return () => {};
}

const itemClass =
  "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-[var(--anchor-deep)] transition hover:bg-[var(--anchor-mint)]/40";

export function HelpMenuButton() {
  const pathname = usePathname() || "";
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [actualRole, setActualRole] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  // Step out of the way when a page button ends up underneath this pill.
  // Never while the menu is open — that would yank it out from under the user.
  const floatRef = useRef<HTMLDivElement | null>(null);
  const covering = useHideWhenOverlapping(floatRef, { enabled: !open });

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!data.user || !alive) return;
      const { data: prof } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.user.id)
        .maybeSingle();
      if (!alive) return;
      setActualRole((prof as { role?: string } | null)?.role || null);
    })();
    return () => {
      alive = false;
    };
  }, [supabase]);

  // Close the menu whenever the route changes.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Offer the install steps on a phone browser only, and not to someone already
  // running the installed app. Read via useSyncExternalStore so the server
  // snapshot is a plain `false` — matching SSR — with no extra render pass.
  const installed = useSyncExternalStore(subscribeDisplayMode, isStandalone, () => false);
  const mobile = useSyncExternalStore(subscribeNothing, isMobileDevice, () => false);
  const showInstall = mobile && !installed;

  // Honor View-As: an admin previewing a sales role gets the user-facing
  // support page, not the admin queue.
  const isAdmin = useEffectiveRole(actualRole) === "admin";

  if (HIDE_EXACT.has(pathname)) return null;
  if (HIDE_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"))) return null;

  const tourKey = pageTourForPath(pathname);
  const supportHref = isAdmin ? "/admin/support" : "/dashboard/support";

  function runWalkthrough() {
    setOpen(false);
    if (!tourKey) return;
    if (tourKey === "dashboard") startTutorial();
    else startPageTutorial(tourKey);
  }

  function showInstallGuide() {
    setOpen(false);
    openInstallGuide();
  }

  return (
    <>
      {open && (
        <button
          type="button"
          aria-hidden
          tabIndex={-1}
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-[89] cursor-default"
        />
      )}

      <div
        ref={floatRef}
        // Tagged so globals.css can stand it down while a dialog is open — it
        // outranks the modal overlay and would otherwise float over it.
        data-help-fab=""
        className={
          "fixed right-4 bottom-24 z-[90] lg:bottom-6 " +
          (covering ? HIDE_WHEN_OVERLAPPING_CLASS : SHOW_WHEN_CLEAR_CLASS)
        }
      >
        {open && (
          <div
            role="menu"
            className="absolute bottom-14 right-0 w-60 overflow-hidden rounded-2xl border border-black/10 bg-white p-1.5 shadow-[0_12px_32px_rgba(0,0,0,0.22)]"
          >
            {tourKey && (
              <button type="button" role="menuitem" onClick={runWalkthrough} className={itemClass}>
                <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-[var(--anchor-green)]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <circle cx="12" cy="12" r="9" />
                  <path d="M10 8l6 4-6 4z" fill="currentColor" stroke="none" />
                </svg>
                Page walkthrough
              </button>
            )}

            {showInstall && (
              <button type="button" role="menuitem" onClick={showInstallGuide} className={itemClass}>
                <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-[var(--anchor-green)]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <rect x="6" y="2" width="12" height="20" rx="2.5" />
                  <path d="M12 8v6" />
                  <path d="M9.5 11.5L12 14l2.5-2.5" />
                </svg>
                Install on your phone
              </button>
            )}

            <Link href={supportHref} role="menuitem" onClick={() => setOpen(false)} className={itemClass}>
              <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-[var(--anchor-green)]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              Ask a question
            </Link>

            <Link href="/dashboard/faq" role="menuitem" onClick={() => setOpen(false)} className={itemClass}>
              <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-[var(--anchor-green)]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="12" cy="12" r="10" />
                <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              FAQ
            </Link>
          </div>
        )}

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="Help"
          aria-expanded={open}
          aria-haspopup="menu"
          title="Help"
          data-tutorial="nav-support"
          className="flex h-12 w-12 items-center justify-center rounded-full border border-white/15 bg-[var(--anchor-deep)] text-white shadow-[0_8px_24px_rgba(0,0,0,0.22)] transition hover:bg-[var(--anchor-green)] active:scale-95"
        >
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="12" cy="12" r="10" />
            <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </button>
      </div>
    </>
  );
}
