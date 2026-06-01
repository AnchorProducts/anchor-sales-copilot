"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { AppRole, getViewAs, setViewAs, useViewAs } from "@/lib/role/viewAs";
import { startTutorial, tutorialDoneKey, TUTORIAL_PENDING_KEY } from "@/app/components/tutorial/AppTutorial";

const HIDE_EXACT = new Set(["/", "/signup", "/forgot", "/reset"]);
const HIDE_PREFIXES = ["/auth"];

function shouldHide(pathname: string) {
  if (HIDE_EXACT.has(pathname)) return true;
  return HIDE_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

type Option = { value: AppRole; label: string; sub: string };

const OPTIONS: Option[] = [
  { value: "admin",        label: "Admin",         sub: "Full admin view" },
  { value: "anchor_rep",   label: "Internal sales", sub: "Anchor rep view" },
  { value: "external_rep", label: "External user", sub: "Outside rep view" },
];

export function AdminViewAsSwitcher() {
  const pathname = usePathname() || "";
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [actualRole, setActualRole] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const override = useViewAs();
  const popoverRef = useRef<HTMLDivElement | null>(null);

  // Pull the user's actual role once.
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user || !alive) return;
      const { data: prof } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", u.user.id)
        .maybeSingle();
      if (!alive) return;
      setActualRole((prof as { role: string | null } | null)?.role || null);
    })();
    return () => { alive = false; };
  }, [supabase]);

  // Close the popover on outside click.
  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (!popoverRef.current) return;
      if (!popoverRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  if (shouldHide(pathname)) return null;
  if (actualRole !== "admin") return null;

  // Treat "no override" as viewing as admin.
  const current: AppRole = (override ?? "admin") as AppRole;
  const currentOpt = OPTIONS.find((o) => o.value === current) ?? OPTIONS[0];
  const overriding = current !== "admin";

  function choose(role: AppRole) {
    setViewAs(role === "admin" ? null : role);
    setOpen(false);
    // Force any role-dependent server components to refresh.
    if (typeof window !== "undefined") window.location.reload();
  }

  function replayTutorial() {
    setOpen(false);
    // Run the tour for whichever view we're currently in. Also clear the
    // "done" flag for that role so the flow matches a true first-time user.
    try { window.localStorage.removeItem(tutorialDoneKey(current)); } catch { /* ignore */ }
    // Tour expects to start on the dashboard. If we're not there, set a
    // pending-replay flag and navigate; the tutorial picks it up on mount.
    if (pathname !== "/dashboard") {
      try { window.sessionStorage.setItem(TUTORIAL_PENDING_KEY, current); } catch { /* ignore */ }
      window.location.assign("/dashboard");
    } else {
      startTutorial(current);
    }
  }

  // Tiny role badge for the compact mobile button (so admins can tell at a
  // glance which view they're previewing without opening the popover).
  const shortLabel = current === "external_rep" ? "EXT" : current === "anchor_rep" ? "INT" : "ADM";

  return (
    <div
      ref={popoverRef}
      // Mobile (default): centered just under the safe-area inset, in the
      // empty zone between the greeting text on the left and the user
      // avatar on the right — clear of the bottom nav, the dashboard's
      // stat circles, and the page header.
      // Desktop (lg+): bottom-right pill — the layout already signed off on.
      className="fixed z-[60] flex flex-col items-center gap-2 left-1/2 -translate-x-1/2 top-[calc(env(safe-area-inset-top)+10px)] lg:left-auto lg:translate-x-0 lg:right-[calc(env(safe-area-inset-right)+10px)] lg:bottom-[calc(env(safe-area-inset-bottom)+92px)] lg:top-auto lg:flex-col-reverse lg:items-end"
    >
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Switch role view"
        data-tutorial="view-as-button"
        className={
          "flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[11px] font-semibold shadow-[0_6px_18px_rgba(0,0,0,0.18)] transition lg:gap-2 lg:px-3.5 lg:py-2 lg:text-[12px] " +
          (overriding
            ? "bg-[#f59e0b] text-white hover:bg-[#d97706]"
            : "bg-[var(--anchor-deep)] text-white hover:bg-[var(--anchor-green)]")
        }
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21c0-4 4-6 8-6s8 2 8 6" />
        </svg>
        {/* Mobile: short badge only. Desktop: full label. */}
        <span className="whitespace-nowrap lg:hidden">{shortLabel}</span>
        <span className="hidden whitespace-nowrap lg:inline">
          {overriding ? "Viewing as " : ""}{currentOpt.label}
        </span>
        <svg viewBox="0 0 24 24" className="h-3 w-3 opacity-70 lg:h-3.5 lg:w-3.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div
          role="menu"
          aria-label="Switch role view"
          className="w-60 overflow-hidden rounded-2xl border border-black/10 bg-white shadow-[0_10px_30px_rgba(0,0,0,0.18)]"
        >
          <div className="border-b border-black/5 px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-black/50">
            View app as
          </div>
          <ul className="py-1">
            {OPTIONS.map((o) => {
              const active = o.value === current;
              return (
                <li key={o.value}>
                  <button
                    type="button"
                    role="menuitemradio"
                    aria-checked={active}
                    onClick={() => choose(o.value)}
                    className={
                      "flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm transition " +
                      (active ? "bg-[var(--anchor-mint)]/30 text-[var(--anchor-deep)]" : "text-black hover:bg-black/[0.04]")
                    }
                  >
                    <span>
                      <span className="block font-semibold">{o.label}</span>
                      <span className="block text-[11px] text-black/55">{o.sub}</span>
                    </span>
                    {active && (
                      <svg viewBox="0 0 24 24" className="h-4 w-4 text-[var(--anchor-green)]" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="border-t border-black/5">
            <button
              type="button"
              role="menuitem"
              onClick={replayTutorial}
              className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm text-[var(--anchor-deep)] transition hover:bg-black/[0.04]"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4 text-[var(--anchor-green)]" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="9" />
                <path d="M10 8l6 4-6 4z" fill="currentColor" stroke="none" />
              </svg>
              <span>
                <span className="block font-semibold">Replay walkthrough</span>
                <span className="block text-[11px] text-black/55">Run the tour for the current view</span>
              </span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Helper for synchronous reads outside of React (rare).
export function readViewAsRole() {
  return getViewAs();
}
