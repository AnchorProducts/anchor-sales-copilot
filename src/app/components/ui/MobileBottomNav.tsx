"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { useEffectiveRole } from "@/lib/role/viewAs";

const HIDE_EXACT = new Set(["/", "/signup", "/forgot", "/reset"]);
const HIDE_PREFIXES = ["/auth", "/chat"];

function shouldHide(pathname: string) {
  if (HIDE_EXACT.has(pathname)) return true;
  return HIDE_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

type IconKind = "grid" | "sparkles" | "library" | "clipboard" | "camera" | "wallet" | "shield" | "settings" | "lifebuoy";

// Sections the bottom nav can surface as a recent. The Dashboard is fixed and
// intentionally excluded. Order matters only for prefix matching (more specific
// /dashboard/* prefixes resolve before the generic /admin one).
type Section = { key: string; prefix: string; label: string; kind: IconKind; href: string };
const CATALOG: Section[] = [
  { key: "settings", prefix: "/dashboard/settings", label: "Settings", kind: "settings", href: "/dashboard/settings" },
  { key: "consults", prefix: "/dashboard/opportunities", label: "Consults", kind: "clipboard", href: "/dashboard/opportunities" },
  { key: "commission", prefix: "/dashboard/commission", label: "Commission", kind: "wallet", href: "/dashboard/commission/new" },
  { key: "notable", prefix: "/dashboard/notable-projects", label: "Notable", kind: "camera", href: "/dashboard/notable-projects/new" },
  { key: "reports", prefix: "/dashboard/reports", label: "Reports", kind: "clipboard", href: "/dashboard/reports" },
  { key: "assets", prefix: "/assets", label: "Assets", kind: "library", href: "/assets" },
  { key: "assets", prefix: "/internal-assets", label: "Assets", kind: "library", href: "/assets" },
  { key: "chat", prefix: "/chat", label: "Copilot", kind: "sparkles", href: "/chat" },
  { key: "admin", prefix: "/admin", label: "Admin", kind: "shield", href: "/admin" },
  // Two prefixes map to the same `support` section key — visiting either the
  // user-facing list or the admin queue counts as touching Support, so the
  // bottom-nav recents slot will pick it up either way.
  { key: "support", prefix: "/dashboard/support", label: "Support", kind: "lifebuoy", href: "/dashboard/support" },
  { key: "support", prefix: "/admin/support", label: "Support", kind: "lifebuoy", href: "/admin/support" },
];

const SECTION_BY_KEY = new Map(CATALOG.map((s) => [s.key, s]));
// Dashboard + 2 recents + pinned Support + pinned Settings = 5 buttons.
// Settings/Support are never surfaced as recents (excluded below).
const RECENT_SLOTS = 2;
const DEFAULT_KEYS = ["chat", "assets"]; // fill when there aren't enough recents yet
const NEVER_AS_RECENT = new Set(["settings", "support"]);
const STORE_KEY = "anchor:recent-nav";

function matchSection(pathname: string): Section | null {
  for (const s of CATALOG) {
    if (pathname === s.prefix || pathname.startsWith(s.prefix + "/")) return s;
  }
  return null;
}

type Recent = { key: string; path: string };

function NavIcon({ kind }: { kind: IconKind }) {
  const c = { fill: "none" as const, stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const cn = "h-6 w-6";
  switch (kind) {
    case "grid":
      return (<svg viewBox="0 0 24 24" className={cn} {...c}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>);
    case "sparkles":
      return (<svg viewBox="0 0 24 24" className={cn} {...c}><path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5z" /><path d="M19 14l1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2z" /></svg>);
    case "library":
      return (<svg viewBox="0 0 24 24" className={cn} {...c}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>);
    case "clipboard":
      return (<svg viewBox="0 0 24 24" className={cn} {...c}><rect x="8" y="2" width="8" height="4" rx="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><line x1="9" y1="12" x2="15" y2="12" /><line x1="9" y1="16" x2="13" y2="16" /></svg>);
    case "camera":
      return (<svg viewBox="0 0 24 24" className={cn} {...c}><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>);
    case "wallet":
      return (<svg viewBox="0 0 24 24" className={cn} {...c}><path d="M20 12V8H4a2 2 0 0 1 0-4h14v4" /><rect x="2" y="6" width="20" height="14" rx="2" /><circle cx="16" cy="13" r="1.5" /></svg>);
    case "shield":
      return (<svg viewBox="0 0 24 24" className={cn} {...c}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>);
    case "settings":
      return (<svg viewBox="0 0 24 24" className={cn} {...c}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>);
    case "lifebuoy": // Support — rendered as a question mark.
      return (<svg viewBox="0 0 24 24" className={cn} {...c}><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>);
  }
}

function NavItem({ href, active, ariaLabel, kind, tutorialKey }: { href: string; active: boolean; ariaLabel: string; kind: IconKind; tutorialKey?: string }) {
  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      aria-current={active ? "page" : undefined}
      data-tutorial={tutorialKey}
      className={
        "flex h-12 items-center justify-center rounded-full transition " +
        (active ? "bg-[var(--anchor-mint)] px-6 text-[var(--anchor-deep)]" : "w-12 text-white/70 hover:text-white")
      }
    >
      <NavIcon kind={kind} />
    </Link>
  );
}

export function MobileBottomNav() {
  const pathname = usePathname() || "";
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [recents, setRecents] = useState<Recent[]>([]);
  const [actualRole, setActualRole] = useState<string | null>(null);

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
      setActualRole((prof as { role?: string } | null)?.role || null);
    })();
    return () => { alive = false; };
  }, [supabase]);

  // Honor View-As: an admin previewing the external/internal experience
  // should see the user-facing support link, not the admin queue.
  const effectiveRole = useEffectiveRole(actualRole);
  const isAdmin = effectiveRole === "admin";

  // Load stored recents once, then record the current section. Done in an async
  // task so the state update isn't a synchronous effect-body setState.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const s = matchSection(pathname);
      let stored: Recent[] = [];
      try {
        const raw = localStorage.getItem(STORE_KEY);
        const parsed = raw ? (JSON.parse(raw) as Recent[]) : [];
        if (Array.isArray(parsed)) stored = parsed.filter((r) => r && SECTION_BY_KEY.has(r.key));
      } catch {
        // ignore
      }
      const next = s
        ? [{ key: s.key, path: pathname }, ...stored.filter((r) => r.key !== s.key)].slice(0, 6)
        : stored;
      if (s) {
        try { localStorage.setItem(STORE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      }
      if (!cancelled) setRecents(next);
    })();
    return () => { cancelled = true; };
  }, [pathname]);

  if (shouldHide(pathname)) return null;

  const currentKey = matchSection(pathname)?.key ?? null;
  const dashboardActive = currentKey === null && (pathname === "/dashboard" || pathname.startsWith("/dashboard") || pathname.startsWith("/admin"));

  // Middle buttons: the most-recent sections (Settings + Support are pinned
  // and so excluded here), padded with defaults for new users.
  const keys: string[] = [];
  for (const r of recents) {
    if (keys.length >= RECENT_SLOTS) break;
    if (!NEVER_AS_RECENT.has(r.key) && !keys.includes(r.key) && SECTION_BY_KEY.has(r.key)) keys.push(r.key);
  }
  for (const k of DEFAULT_KEYS) {
    if (keys.length >= RECENT_SLOTS) break;
    if (!keys.includes(k)) keys.push(k);
  }

  const recentByKey = new Map(recents.map((r) => [r.key, r.path]));

  return (
    <nav
      aria-label="Primary"
      data-tutorial="primary-nav"
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        paddingBottom: "calc(0.5rem + env(safe-area-inset-bottom))",
        paddingTop: "0.5rem",
        zIndex: 100,
        justifyContent: "center",
        pointerEvents: "none",
      }}
      // `flex lg:hidden` — inline `display` would clobber the `lg:hidden`
      // utility (inline styles beat utility classes), which is why this lives
      // in className instead of the style prop.
      className="flex lg:hidden"
    >
      <div className="pointer-events-auto flex items-center justify-around gap-2 rounded-full bg-[var(--anchor-deep)] px-3 py-2 shadow-[0_8px_24px_rgba(0,0,0,0.18)]">
        <NavItem href="/dashboard" kind="grid" ariaLabel="Dashboard" active={dashboardActive} tutorialKey="nav-dashboard" />
        {keys.map((k) => {
          const s = SECTION_BY_KEY.get(k)!;
          return (
            <NavItem
              key={k}
              href={recentByKey.get(k) ?? s.href}
              kind={s.kind}
              ariaLabel={s.label}
              active={currentKey === k}
              tutorialKey="nav-recents"
            />
          );
        })}
        <NavItem
          href={isAdmin ? "/admin/support" : "/dashboard/support"}
          kind="lifebuoy"
          ariaLabel="Support"
          active={currentKey === "support"}
          tutorialKey="nav-support"
        />
        <NavItem href="/dashboard/settings" kind="settings" ariaLabel="Settings" active={currentKey === "settings"} tutorialKey="settings-mobile" />
      </div>
    </nav>
  );
}
