"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Navbar, NavbarInner } from "./Navbar";

export type NavMenuItem = {
  label: string;
  href?: string;
  onClick?: () => void;
};

type AppNavbarProps = {
  title: string;
  subtitle?: string;
  menuItems: NavMenuItem[];
  mobileMenuItems?: NavMenuItem[];
  hero?: React.ReactNode;
};

export function AppNavbar({ title, subtitle, menuItems, mobileMenuItems, hero }: AppNavbarProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const item = menuItems[0];

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  return (
    <Navbar>
      <NavbarInner className={hero ? "flex-col items-start gap-0 py-3 sm:py-4" : undefined}>
        <div className="flex w-full min-w-0 items-center justify-between gap-3">
          {/* Logo + title */}
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/dashboard" className="shrink-0">
              <img src="/anchorp.svg" alt="Anchor" className="ds-logo" />
            </Link>
            <div className="min-w-0 leading-tight">
              <div className="truncate text-sm font-semibold tracking-wide text-white">{title}</div>
              {subtitle && (
                <div className="truncate text-[12px] text-white/80">{subtitle}</div>
              )}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {/* Mobile hamburger — only when mobileMenuItems provided */}
            {mobileMenuItems && (
              <div className="relative sm:hidden" ref={ref}>
                <button
                  type="button"
                  onClick={() => setOpen((v) => !v)}
                  aria-label="Open menu"
                  className="flex h-9 w-9 flex-col items-center justify-center gap-[5.5px] rounded-xl border border-white/25 bg-white/5 transition hover:bg-white/10 active:bg-white/15"
                >
                  <span className="block h-px w-[18px] rounded-full bg-white" />
                  <span className="block h-px w-[18px] rounded-full bg-white" />
                  <span className="block h-px w-[18px] rounded-full bg-white" />
                </button>

                {open && (
                  <div className="absolute right-0 top-full z-50 mt-2 min-w-[190px] overflow-hidden rounded-2xl border border-black/10 bg-white shadow-xl">
                    {mobileMenuItems.map((mi, i) => (
                      <div key={i}>
                        {mi.href ? (
                          <Link
                            href={mi.href}
                            onClick={() => setOpen(false)}
                            className="block px-4 py-3.5 text-sm font-medium text-black transition-colors hover:bg-[var(--surface-soft)] active:bg-[var(--surface-soft)]"
                          >
                            {mi.label}
                          </Link>
                        ) : (
                          <button
                            type="button"
                            onClick={() => { mi.onClick?.(); setOpen(false); }}
                            className="block w-full px-4 py-3.5 text-left text-sm font-medium text-black transition-colors hover:bg-[var(--surface-soft)] active:bg-[var(--surface-soft)]"
                          >
                            {mi.label}
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Primary button — always on desktop, hidden on mobile when hamburger is present.
                Back-link variant (with href) renders as an arrow only; action variant (onClick) keeps its label. */}
            {item && (
              item.href ? (
                <Link
                  href={item.href}
                  aria-label={item.label}
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/5 text-sm font-semibold text-white transition hover:bg-white/10 active:bg-white/15${mobileMenuItems ? " hidden sm:inline-flex" : ""}`}
                >
                  ←
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={item.onClick}
                  className={`shrink-0 rounded-xl border border-white/25 bg-white/5 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-white/10 active:bg-white/15${mobileMenuItems ? " hidden sm:inline-flex" : ""}`}
                >
                  {item.label}
                </button>
              )
            )}

            {/* Settings gear — always visible, on the right */}
            <Link
              href="/dashboard/settings"
              aria-label="Settings"
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/25 bg-white/5 text-white transition hover:bg-white/10 active:bg-white/15"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </Link>
          </div>
        </div>

        {/* Optional hero slot */}
        {hero && <div className="mt-3 w-full sm:mt-5">{hero}</div>}
      </NavbarInner>
    </Navbar>
  );
}
