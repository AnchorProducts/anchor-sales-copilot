"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { useEffectiveRole } from "@/lib/role/viewAs";
import { pageTourForPath, startPageTutorial, startTutorial } from "@/app/components/tutorial/AppTutorial";

// Single floating Help button (bottom-right). Opens a small menu with:
//   • Page walkthrough — the guided tour for the current page (when one exists)
//   • Ask a question   — files a support request
//   • FAQ              — common questions
// Replaces the separate walkthrough + support floating buttons.
const HIDE_EXACT = new Set(["/", "/signup", "/forgot", "/reset"]);
const HIDE_PREFIXES = ["/auth", "/docs"];

const itemClass =
  "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium text-[var(--anchor-deep)] transition hover:bg-[var(--anchor-mint)]/40";

export function HelpMenuButton() {
  const pathname = usePathname() || "";
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [actualRole, setActualRole] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

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

      <div className="fixed right-4 bottom-24 z-[90] lg:bottom-6">
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
