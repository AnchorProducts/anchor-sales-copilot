"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const HIDE_EXACT = new Set(["/", "/signup", "/forgot", "/reset"]);
const HIDE_PREFIXES = ["/auth", "/chat"];

function shouldHide(pathname: string) {
  if (HIDE_EXACT.has(pathname)) return true;
  return HIDE_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

type IconKind = "grid" | "sparkles" | "library" | "settings";

function NavIcon({ kind }: { kind: IconKind }) {
  const c = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  const className = "h-6 w-6";
  switch (kind) {
    case "grid":
      return (
        <svg viewBox="0 0 24 24" className={className} {...c}>
          <rect x="3" y="3" width="7" height="7" rx="1.5" />
          <rect x="14" y="3" width="7" height="7" rx="1.5" />
          <rect x="3" y="14" width="7" height="7" rx="1.5" />
          <rect x="14" y="14" width="7" height="7" rx="1.5" />
        </svg>
      );
    case "sparkles":
      return (
        <svg viewBox="0 0 24 24" className={className} {...c}>
          <path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5z" />
          <path d="M19 14l1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2z" />
        </svg>
      );
    case "library":
      return (
        <svg viewBox="0 0 24 24" className={className} {...c}>
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        </svg>
      );
    case "settings":
      return (
        <svg viewBox="0 0 24 24" className={className} {...c}>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      );
  }
}

function NavItem({
  href,
  active,
  ariaLabel,
  kind,
}: {
  href: string;
  active: boolean;
  ariaLabel: string;
  kind: IconKind;
}) {
  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      aria-current={active ? "page" : undefined}
      className={
        "flex h-12 items-center justify-center rounded-full transition " +
        (active
          ? "bg-[var(--anchor-mint)] px-6 text-[var(--anchor-deep)]"
          : "w-12 text-white/70 hover:text-white")
      }
    >
      <NavIcon kind={kind} />
    </Link>
  );
}

export function MobileBottomNav() {
  const pathname = usePathname() || "";
  if (shouldHide(pathname)) return null;

  const isSettings = pathname.startsWith("/dashboard/settings");
  const isCopilot = pathname.startsWith("/chat");
  const isAssets = pathname.startsWith("/assets") || pathname.startsWith("/internal-assets");
  // Dashboard is "active" for /dashboard and any /dashboard/* that isn't settings, plus /admin (so admins see a sensible active tab)
  const isDashboard =
    !isSettings && !isCopilot && !isAssets &&
    (pathname === "/dashboard" || pathname.startsWith("/dashboard") || pathname.startsWith("/admin"));

  return (
    <nav
      aria-label="Primary"
      style={{
        position: "fixed",
        bottom: "calc(1rem + env(safe-area-inset-bottom))",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 100,
      }}
      className="lg:hidden"
    >
      <div className="flex items-center justify-around gap-2 rounded-full bg-[var(--anchor-deep)] px-3 py-2 shadow-[0_8px_24px_rgba(0,0,0,0.18)]">
        <NavItem href="/dashboard" kind="grid" ariaLabel="Dashboard" active={isDashboard} />
        <NavItem href="/chat" kind="sparkles" ariaLabel="Copilot" active={isCopilot} />
        <NavItem href="/assets" kind="library" ariaLabel="Assets" active={isAssets} />
        <NavItem href="/dashboard/settings" kind="settings" ariaLabel="Settings" active={isSettings} />
      </div>
    </nav>
  );
}
