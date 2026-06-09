"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { useEffectiveRole } from "@/lib/role/viewAs";

type IconKind =
  | "grid" | "sparkles" | "library" | "clipboard" | "camera"
  | "wallet" | "shield" | "settings" | "logout" | "lifebuoy";

const HIDE_EXACT = new Set(["/", "/signup", "/forgot", "/reset"]);
// /docs/* is the full-screen document viewer. The sidebar is fixed/z-40, so if
// it rendered here it would sit on top of the viewer header and swallow clicks
// on the in-header "Back" button.
const HIDE_PREFIXES = ["/auth", "/docs"];

function shouldHide(pathname: string) {
  if (HIDE_EXACT.has(pathname)) return true;
  return HIDE_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

function NavIcon({ kind, className = "h-5 w-5" }: { kind: IconKind; className?: string }) {
  const c = { fill: "none" as const, stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (kind) {
    case "grid":
      return (<svg viewBox="0 0 24 24" className={className} {...c}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>);
    case "sparkles":
      return (<svg viewBox="0 0 24 24" className={className} {...c}><path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5z" /><path d="M19 14l1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2z" /></svg>);
    case "library":
      return (<svg viewBox="0 0 24 24" className={className} {...c}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></svg>);
    case "clipboard":
      return (<svg viewBox="0 0 24 24" className={className} {...c}><rect x="8" y="2" width="8" height="4" rx="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><line x1="9" y1="12" x2="15" y2="12" /><line x1="9" y1="16" x2="13" y2="16" /></svg>);
    case "camera":
      return (<svg viewBox="0 0 24 24" className={className} {...c}><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>);
    case "wallet":
      return (<svg viewBox="0 0 24 24" className={className} {...c}><path d="M20 12V8H4a2 2 0 0 1 0-4h14v4" /><rect x="2" y="6" width="20" height="14" rx="2" /><circle cx="16" cy="13" r="1.5" /></svg>);
    case "shield":
      return (<svg viewBox="0 0 24 24" className={className} {...c}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>);
    case "settings":
      return (<svg viewBox="0 0 24 24" className={className} {...c}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>);
    case "logout":
      return (<svg viewBox="0 0 24 24" className={className} {...c}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></svg>);
    case "lifebuoy": // Support — rendered as a question mark.
      return (<svg viewBox="0 0 24 24" className={className} {...c}><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>);
  }
}

function NavLink({ href, kind, label, active, tutorialKey }: { href: string; kind: IconKind; label: string; active: boolean; tutorialKey?: string }) {
  return (
    <Link
      href={href}
      data-tutorial={tutorialKey}
      className={
        "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition " +
        (active
          ? "bg-[var(--anchor-green)] text-white shadow-[0_2px_8px_rgba(0,0,0,0.15)]"
          : "text-white/75 hover:bg-white/10 hover:text-white")
      }
    >
      <NavIcon kind={kind} />
      <span className="truncate">{label}</span>
    </Link>
  );
}

const initials = (s: string) =>
  s.trim().split(/\s+/).map((w) => w[0]).filter(Boolean).join("").slice(0, 2).toUpperCase() || "?";

export function AppSidebar() {
  const pathname = usePathname() || "";
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [profile, setProfile] = useState<{ full_name: string | null; role: string | null } | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user || !alive) return;
      const { data: prof } = await supabase
        .from("profiles")
        .select("full_name,role")
        .eq("id", u.user.id)
        .maybeSingle();
      if (!alive) return;
      setProfile(prof as { full_name: string | null; role: string | null } | null);
    })();
    return () => {
      alive = false;
    };
  }, [supabase]);

  const actualRole = profile?.role || "";
  const effectiveRole = useEffectiveRole(actualRole) || "";

  if (shouldHide(pathname)) return null;

  // Role gating uses the effective role so admins can preview each view.
  // Sign-out, profile lookups, etc. still use the real session — only UI is
  // overridden.
  const role = effectiveRole;
  const isExternal = role === "external_rep";
  const isAdmin = role === "admin";
  const isInternal = role === "anchor_rep" || role === "admin";
  const fullName = profile?.full_name || "";

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.replace("/");
    router.refresh();
  }

  const isPath = (p: string, exact = false) => (exact ? pathname === p : pathname === p || pathname.startsWith(p + "/"));

  return (
    <aside className="fixed left-0 top-0 z-40 hidden h-dvh w-64 flex-col bg-[var(--anchor-deep)] px-4 py-6 text-white lg:flex">
      <Link href="/dashboard/settings" className="flex items-center gap-3 px-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--anchor-mint)] text-sm font-bold text-[var(--anchor-deep)]">
          {initials(fullName)}
        </div>
        <div className="min-w-0 leading-tight">
          <div className="truncate text-sm font-bold">{fullName || "User"}</div>
          <div className="text-[11px] text-white/60">
            {isAdmin ? "Admin" : isInternal ? "Anchor Rep" : isExternal ? "External Rep" : ""}
          </div>
        </div>
      </Link>

      <nav data-tutorial="primary-nav" className="mt-8 flex flex-1 flex-col gap-1">
        <NavLink href="/dashboard" kind="grid" label="Dashboard" active={isPath("/dashboard", true)} tutorialKey="nav-dashboard" />
        <NavLink href="/chat" kind="sparkles" label="Copilot" active={isPath("/chat")} />
        <NavLink href="/assets" kind="library" label="Assets" active={isPath("/assets")} />
        {/* Submission forms are for internal & external sales. Admins don't see
            these in admin view — they must "View app as" a sales role. */}
        {(role === "external_rep" || role === "anchor_rep") && (
          <>
            <NavLink href="/dashboard/opportunities/new" kind="clipboard" label="Rooftop Equipment Consult" active={isExternal && isPath("/dashboard/opportunities")} />
            <NavLink href="/dashboard/notable-projects/new" kind="camera" label="Notable Project" active={isPath("/dashboard/notable-projects")} />
            <NavLink href="/dashboard/commission/new" kind="wallet" label="Commission Claim Form" active={isPath("/dashboard/commission")} />
          </>
        )}
        {isInternal && (
          <NavLink
            href="/dashboard/opportunities"
            kind="clipboard"
            label="Active Consults"
            active={isPath("/dashboard/opportunities")}
          />
        )}
        {isAdmin && (
          <>
            <NavLink href="/admin" kind="shield" label="Admin" active={isPath("/admin", true)} />
            <NavLink href="/admin/rooftop-reports" kind="clipboard" label="Reports" active={isPath("/admin/rooftop-reports")} />
          </>
        )}
        {/* Admins hit the queue; everyone else hits their personal thread list. */}
        <NavLink
          href={isAdmin ? "/admin/support" : "/dashboard/support"}
          kind="lifebuoy"
          label="Support"
          active={isAdmin ? isPath("/admin/support") : isPath("/dashboard/support")}
          tutorialKey="nav-support"
        />
      </nav>

      <div data-tutorial="settings-signout" className="space-y-1">
        <NavLink href="/dashboard/settings" kind="settings" label="Settings" active={isPath("/dashboard/settings")} />
        <button
          type="button"
          onClick={handleSignOut}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-white/75 transition hover:bg-white/10 hover:text-white"
        >
          <NavIcon kind="logout" />
          <span>Sign out</span>
        </button>
      </div>
    </aside>
  );
}
