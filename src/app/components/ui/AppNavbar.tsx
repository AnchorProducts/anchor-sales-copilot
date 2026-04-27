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

            {/* Primary button — always on desktop, hidden on mobile when hamburger is present */}
            {item && (
              item.href ? (
                <Link
                  href={item.href}
                  className={`shrink-0 rounded-xl border border-white/25 bg-white/5 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-white/10 active:bg-white/15${mobileMenuItems ? " hidden sm:inline-flex" : ""}`}
                >
                  ← {item.label}
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
          </div>
        </div>

        {/* Optional hero slot */}
        {hero && <div className="mt-3 w-full sm:mt-5">{hero}</div>}
      </NavbarInner>
    </Navbar>
  );
}
