// src/app/dashboard/page.tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { useEffectiveRole } from "@/lib/role/viewAs";

type SearchProductRow = {
  id: string;
  name: string;
  sku: string | null;
  series: string | null;
  section: "solution" | "anchor" | "internal_assets";
  internal_kind: "tacklebox" | "docs_list" | "contacts_list" | null;
};

function searchProductHref(p: SearchProductRow) {
  if (p.section === "internal_assets") {
    if (p.internal_kind === "contacts_list") {
      return `/internal-assets/contacts/${encodeURIComponent(p.id)}`;
    }
    return `/internal-assets/docs/${encodeURIComponent(p.id)}`;
  }
  return `/assets/${encodeURIComponent(p.id)}`;
}

const SECTION_LABEL: Record<SearchProductRow["section"], string> = {
  solution: "Solution",
  anchor: "Anchor",
  internal_assets: "Internal",
};

type SalesRepLite = {
  outside_sales_name: string | null;
  outside_sales_email: string | null;
  teams_link: string | null;
};

export const dynamic = "force-dynamic";

/* ─── Inline SVG icon set ───────────────────────────────────────────────── */
type IconName =
  | "search" | "more" | "right" | "grid" | "trendUp" | "trendDown"
  | "sparkles" | "library" | "phone" | "clipboard" | "wallet" | "shield"
  | "settings" | "rocket" | "camera" | "logout";

function Icon({ name, className = "h-5 w-5", strokeWidth = 2 }: { name: IconName; className?: string; strokeWidth?: number }) {
  const c = { fill: "none", stroke: "currentColor", strokeWidth, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (name) {
    case "search":   return (<svg viewBox="0 0 24 24" className={className} {...c}><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/></svg>);
    case "more":     return (<svg viewBox="0 0 24 24" className={className} {...c}><circle cx="12" cy="5"  r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>);
    case "right":    return (<svg viewBox="0 0 24 24" className={className} {...c}><polyline points="9 18 15 12 9 6"/></svg>);
    case "grid":     return (<svg viewBox="0 0 24 24" className={className} {...c}><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>);
    case "trendUp":  return (<svg viewBox="0 0 24 24" className={className} {...c}><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>);
    case "trendDown":return (<svg viewBox="0 0 24 24" className={className} {...c}><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>);
    case "sparkles": return (<svg viewBox="0 0 24 24" className={className} {...c}><path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5z"/><path d="M19 14l1 2 2 1-2 1-1 2-1-2-2-1 2-1 1-2z"/></svg>);
    case "library":  return (<svg viewBox="0 0 24 24" className={className} {...c}><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>);
    case "phone":    return (<svg viewBox="0 0 24 24" className={className} {...c}><path d="M22 16.92V21a1 1 0 0 1-1.11 1A19.86 19.86 0 0 1 2 4.11 1 1 0 0 1 3 3h4.09a1 1 0 0 1 1 .75l1 4a1 1 0 0 1-.27 1L7.21 10.21a16 16 0 0 0 6.58 6.58l1.46-1.61a1 1 0 0 1 1-.27l4 1a1 1 0 0 1 .75 1z"/></svg>);
    case "clipboard":return (<svg viewBox="0 0 24 24" className={className} {...c}><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="13" y2="16"/></svg>);
    case "wallet":   return (<svg viewBox="0 0 24 24" className={className} {...c}><path d="M20 12V8H4a2 2 0 0 1 0-4h14v4"/><rect x="2" y="6" width="20" height="14" rx="2"/><circle cx="16" cy="13" r="1.5"/></svg>);
    case "shield":   return (<svg viewBox="0 0 24 24" className={className} {...c}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>);
    case "settings": return (<svg viewBox="0 0 24 24" className={className} {...c}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>);
    case "rocket":   return (<svg viewBox="0 0 24 24" className={className} {...c}><path d="M5 13l4 4-4 4-2-2 2-6z"/><path d="M14 6l4 4-9 9-4-4 9-9z"/><path d="M19 2l3 3-3 3-3-3 3-3z"/></svg>);
    case "camera":   return (<svg viewBox="0 0 24 24" className={className} {...c}><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>);
    case "logout":   return (<svg viewBox="0 0 24 24" className={className} {...c}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>);
  }
}

/* ─── Hero feature catalog ──────────────────────────────────────────────── */
type HeroFeatureKey = "chat" | "assets" | "consults" | "commission" | "notable";

type HeroSpec = { title: string; linkLabel: string; href: string };

function heroSpecFor(feature: HeroFeatureKey, role: string | null): HeroSpec {
  switch (feature) {
    case "chat":
      return { title: "Open Copilot for advice on your next project", linkLabel: "Open Copilot", href: "/chat" };
    case "assets":
      return { title: "Browse the Resource Library for fresh assets", linkLabel: "Open Library", href: "/assets" };
    case "consults":
      return role === "external_rep"
        ? { title: "Send a Rooftop Equipment Consult to your inside team", linkLabel: "Start a Consult", href: "/dashboard/opportunities/new" }
        : { title: "Triage Rooftop Equipment Consults from your region", linkLabel: "Open Consults", href: "/dashboard/opportunities" };
    case "commission":
      return { title: "File a Commission Claim before your order ships", linkLabel: "Open Claim Form", href: "/dashboard/commission/new" };
    case "notable":
      return { title: "Log a Notable Project win", linkLabel: "Submit Project", href: "/dashboard/notable-projects/new" };
  }
}

/* ─── Per-feature animated visual ───────────────────────────────────────── */
function HeroFeatureVisual({ feature, size = 96 }: { feature: HeroFeatureKey; size?: number }) {
  const wrap: React.CSSProperties = { width: size, height: size };
  const mint = "var(--anchor-mint)";

  switch (feature) {
    case "chat":
      return (
        <svg viewBox="0 0 100 100" style={wrap} aria-hidden>
          <g fill={mint}>
            <g className="hero-sparkle" style={{ animationDelay: "0s" }} transform="translate(48 22)">
              <path d="M0 -14 L3 -3 L14 0 L3 3 L0 14 L-3 3 L-14 0 L-3 -3 Z" />
            </g>
            <g className="hero-sparkle" style={{ animationDelay: "0.9s" }} transform="translate(20 58)">
              <path d="M0 -8 L2 -2 L8 0 L2 2 L0 8 L-2 2 L-8 0 L-2 -2 Z" />
            </g>
            <g className="hero-sparkle" style={{ animationDelay: "1.6s" }} transform="translate(76 70)">
              <path d="M0 -10 L2.5 -2.5 L10 0 L2.5 2.5 L0 10 L-2.5 2.5 L-10 0 L-2.5 -2.5 Z" />
            </g>
            <g className="hero-sparkle" style={{ animationDelay: "2.2s" }} transform="translate(70 36)">
              <path d="M0 -6 L1.5 -1.5 L6 0 L1.5 1.5 L0 6 L-1.5 1.5 L-6 0 L-1.5 -1.5 Z" />
            </g>
          </g>
        </svg>
      );

    case "assets":
      return (
        <svg viewBox="0 0 100 100" style={wrap} aria-hidden>
          <g fill="none" stroke={mint} strokeWidth="2.2" strokeLinejoin="round" strokeLinecap="round">
            {/* book covers */}
            <path d="M50 24 L22 30 L22 76 L50 80" fill="rgba(156,226,187,0.18)" />
            <path d="M50 24 L78 30 L78 76 L50 80" fill="rgba(156,226,187,0.18)" />
            {/* spine */}
            <line x1="50" y1="24" x2="50" y2="80" />
            {/* static left page lines */}
            <line x1="30" y1="40" x2="46" y2="38" />
            <line x1="30" y1="48" x2="46" y2="46" />
            <line x1="30" y1="56" x2="46" y2="54" />
          </g>
          {/* turning right page */}
          <path
            d="M50 24 L78 30 L78 76 L50 80 Z"
            fill={mint}
            opacity="0.85"
            className="hero-page-flip"
            style={{ transformOrigin: "50px 52px" }}
          />
        </svg>
      );

    case "consults":
      return (
        <svg viewBox="0 0 100 100" style={wrap} aria-hidden>
          <g fill="none" stroke={mint} strokeWidth="2.4" strokeLinejoin="round" strokeLinecap="round">
            {/* clipboard body */}
            <rect x="26" y="26" width="48" height="56" rx="6" fill="rgba(156,226,187,0.18)" />
            {/* clip */}
            <rect x="40" y="20" width="20" height="10" rx="2" fill="rgba(156,226,187,0.35)" />
            {/* a couple of static lines */}
            <line x1="36" y1="50" x2="64" y2="50" opacity="0.55" />
            <line x1="36" y1="60" x2="58" y2="60" opacity="0.4" />
          </g>
          {/* drawing checkmark */}
          <path
            d="M36 70 L46 78 L66 58"
            fill="none"
            stroke={mint}
            strokeWidth="3.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="hero-check"
          />
        </svg>
      );

    case "commission":
      return (
        <svg viewBox="0 0 100 100" style={wrap} aria-hidden>
          {/* rising bill (behind wallet) */}
          <g className="hero-bill">
            <rect x="34" y="34" width="32" height="20" rx="3" fill={mint} opacity="0.9" />
            <text x="50" y="49" textAnchor="middle" fontSize="11" fontWeight="700" fill="var(--anchor-deep)">$</text>
          </g>
          {/* wallet body */}
          <g fill="rgba(156,226,187,0.22)" stroke={mint} strokeWidth="2.4" strokeLinejoin="round">
            <rect x="22" y="44" width="56" height="38" rx="6" />
            {/* card slot */}
            <rect x="60" y="58" width="14" height="10" rx="2" fill={mint} />
          </g>
        </svg>
      );

    case "notable":
      return (
        <svg viewBox="0 0 100 100" style={wrap} aria-hidden>
          {/* flash burst */}
          <circle cx="50" cy="50" r="22" fill={mint} opacity="0.5" className="hero-flash" />
          {/* camera body */}
          <g fill="rgba(156,226,187,0.22)" stroke={mint} strokeWidth="2.4" strokeLinejoin="round">
            <path d="M22 38 H38 L42 32 H58 L62 38 H78 A4 4 0 0 1 82 42 V70 A4 4 0 0 1 78 74 H22 A4 4 0 0 1 18 70 V42 A4 4 0 0 1 22 38 Z" />
            <circle cx="50" cy="56" r="10" fill="rgba(156,226,187,0.35)" />
            <circle cx="50" cy="56" r="5" fill={mint} />
          </g>
        </svg>
      );
  }
}

/* ─── Initials helper ───────────────────────────────────────────────────── */
const initials = (s: string) =>
  s.trim().split(/\s+/).map((w) => w[0]).filter(Boolean).join("").slice(0, 2).toUpperCase() || "?";

export default function DashboardPage() {
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const { t } = useTranslation();

  const [booting, setBooting] = useState(true);
  const [role, setRole] = useState<string | null>(null);
  const [roleReady, setRoleReady] = useState(false);
  const [serviceState, setServiceState] = useState<string>("");
  const [salesRep, setSalesRep] = useState<SalesRepLite | null>(null);
  const [fullName, setFullName] = useState<string>("");
  const [searchQ, setSearchQ] = useState("");

  const [suggestData, setSuggestData] = useState<SearchProductRow[] | null>(null);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const suggestLoadingRef = useRef(false);
  const searchBoxRef = useRef<HTMLDivElement | null>(null);
  const searchBoxRefDesktop = useRef<HTMLDivElement | null>(null);

  const [topFeature, setTopFeature] = useState<HeroFeatureKey | null>(null);

  // --- BOOT: ensure authed + ensure server cookies exist
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setBooting(true);
        const { data: sdata } = await supabase.auth.getSession();
        if (!alive) return;
        const s = sdata.session;
        if (!s) {
          router.replace("/");
          return;
        }
        const syncRes = await fetch("/api/auth/sync", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            access_token: s.access_token,
            refresh_token: s.refresh_token,
          }),
          cache: "no-store",
        });
        if (!syncRes.ok) {
          const j = await syncRes.json().catch(() => null);
          console.warn("auth sync failed", syncRes.status, j);
        }
      } finally {
        if (!alive) return;
        setBooting(false);
      }
    })();
    return () => { alive = false; };
  }, [router, supabase]);

  // --- Role + name check
  useEffect(() => {
    let alive = true;
    (async () => {
      if (booting) return;
      const { data: userData } = await supabase.auth.getUser();
      if (!alive) return;
      const user = userData.user;
      if (!user) return;

      let { data: prof } = await supabase
        .from("profiles")
        .select("role,user_type,email,service_state,full_name")
        .eq("id", user.id)
        .maybeSingle();

      if (!alive) return;

      if (!prof) {
        const email = (user.email || "").trim().toLowerCase();
        const isInternalEmail = email.endsWith("@anchorp.com");
        const roleToSet = isInternalEmail ? "anchor_rep" : "external_rep";
        const user_type = isInternalEmail ? "internal" : "external";
        const meta = user.user_metadata || {};
        const { data: created } = await supabase
          .from("profiles")
          .upsert(
            {
              id: user.id,
              email,
              role: roleToSet,
              user_type,
              full_name: meta.full_name || null,
              company: meta.company || null,
              phone: meta.phone || null,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "id" }
          )
          .select("role,user_type,email,service_state,full_name")
          .single();
        prof = created ?? null;
      }

      if (!alive) return;
      const p = prof as Record<string, unknown> | null;
      setRole(String((p?.role as string) || ""));
      setServiceState(String((p?.service_state as string) || ""));
      setFullName(String((p?.full_name as string) || (user.user_metadata?.full_name as string) || (user.email as string) || ""));
      setRoleReady(true);
    })();
    return () => { alive = false; };
  }, [booting, supabase]);

  // Fetch the assigned sales rep when the user's service state is known.
  useEffect(() => {
    if (!serviceState) { setSalesRep(null); return; }
    let alive = true;
    (async () => {
      try {
        const res = await fetch(`/api/sales-reps/by-state?state=${encodeURIComponent(serviceState)}`, { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (!alive) return;
        setSalesRep(json?.rep || null);
      } catch {
        if (alive) setSalesRep(null);
      }
    })();
    return () => { alive = false; };
  }, [serviceState]);

  // Fetch the user's most-used feature (last 7 days) once they're authed.
  useEffect(() => {
    if (booting || !roleReady) return;
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/user-events/most-used", { cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json().catch(() => null);
        if (!alive) return;
        const f = json?.feature;
        if (f === "chat" || f === "assets" || f === "consults" || f === "commission" || f === "notable") {
          setTopFeature(f);
        }
      } catch {
        // analytics is best-effort; never block the hero
      }
    })();
    return () => { alive = false; };
  }, [booting, roleReady]);

  // For UI gating use the effective role so admins can preview each view.
  // `role` (actual) still drives data fetches/sign-out elsewhere.
  const effectiveRole = useEffectiveRole(role);
  const isExternal = effectiveRole === "external_rep";
  const isAdmin = effectiveRole === "admin";
  const isInternal = effectiveRole === "admin" || effectiveRole === "anchor_rep";

  const firstName = (fullName || "").trim().split(/\s+/)[0] || "";
  const greetingName = firstName || "there";

  const todayLabel = new Date().toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });

  // Allowed hero features per role. Admin keeps its bespoke pulse copy
  // unless their top feature is one of these workspace tools.
  const allowedFeatures: HeroFeatureKey[] = isExternal
    ? ["chat", "assets", "consults", "commission", "notable"]
    : effectiveRole === "anchor_rep"
    ? ["chat", "assets", "consults"]
    : isAdmin
    ? ["chat", "assets"]
    : [];

  const resolvedFeature: HeroFeatureKey | null =
    topFeature && allowedFeatures.includes(topFeature) ? topFeature : null;

  const heroSpec = resolvedFeature ? heroSpecFor(resolvedFeature, effectiveRole) : null;

  const heroTitle = heroSpec
    ? heroSpec.title
    : isAdmin
    ? "Admin pulse — view activity & assessments"
    : isInternal
    ? "Internal tools ready — copilot & assets"
    : "Open Copilot for advice on your next project";
  const heroLink = heroSpec ? heroSpec.href : isAdmin ? "/admin" : "/chat";
  const heroLinkLabel = heroSpec ? heroSpec.linkLabel : isAdmin ? "See Admin" : "Open Copilot";

  // What animated visual to show. Falls back to sparkles (Copilot) so the
  // card never renders without art.
  const visualFeature: HeroFeatureKey = resolvedFeature ?? "chat";
  // Re-keyed so the title fades in when the feature resolves.
  const heroAnimKey = resolvedFeature ?? "default";

  const subtitle = isAdmin
    ? "Configure reps, review activity, and audit reports."
    : isInternal
    ? "Jump into Copilot, manage assets, or check rooftop reports."
    : "Jump into Copilot, manage assets, or talk to your rep.";

  // Stat cards: contextual to role, always 2 up
  const stat1 = isAdmin
    ? { label: "Service Reps", value: "All", trend: "Manage", href: "/admin/sales-reps", icon: "shield" as IconName }
    : isInternal
    ? { label: "Asset Library", value: "Browse", trend: "Library", href: "/assets", icon: "library" as IconName }
    : { label: "Service State", value: serviceState || "—", trend: serviceState ? "Active" : "Set up", href: "/dashboard/settings", icon: "shield" as IconName, text: serviceState || undefined };

  const stat2 = isAdmin
    ? { label: "Reports", value: "View", trend: "Audit", href: "/admin/rooftop-reports", icon: "clipboard" as IconName }
    : isInternal
    ? { label: "Copilot", value: "Ask", trend: "AI", href: "/chat", icon: "sparkles" as IconName }
    : { label: "Your Rep", value: salesRep?.outside_sales_name?.split(" ")[0] || "—", trend: salesRep?.teams_link ? "Ready" : "Setup", href: salesRep?.teams_link || "/dashboard/settings", external: !!salesRep?.teams_link, icon: "phone" as IconName };

  const stat3 = isExternal
    ? { label: t("notableProject"), value: "Submit", trend: "", href: "/dashboard/notable-projects/new", icon: "camera" as IconName }
    : null;

  const stats = stat3 ? [stat1, stat2, stat3] : [stat1, stat2];

  // Quick actions list (role-gated)
  type Action = { key: string; href: string; label: string; desc: string; icon: IconName; badge: string; external?: boolean };
  const actions: Action[] = [];

  if (roleReady && isExternal) {
    // External rep gets the four equal Quick Actions in this exact order:
    //   Resource Library → Copilot → REC → Commission Claim Form
    actions.push({ key: "assets",     href: "/assets",                       label: t("assetManagement"),     desc: t("assetManagementDesc"),     icon: "library",  badge: "Library"    });
    actions.push({ key: "chat",       href: "/chat",                         label: t("openCopilot"),         desc: "Get solution recommendations and next steps.", icon: "sparkles", badge: "AI" });
    actions.push({ key: "project",    href: "/dashboard/opportunities/new",  label: t("projectIdentifier"),   desc: t("projectIdentifierDesc"),   icon: "clipboard", badge: "Projects"   });
    actions.push({ key: "commission", href: "/dashboard/commission/new",     label: t("commissionClaim"),     desc: t("commissionClaimDesc"),     icon: "wallet",    badge: "Commission" });
  } else {
    if (heroLink !== "/chat") {
      actions.push({ key: "chat", href: "/chat", label: t("openCopilot"), desc: "Get solution recommendations and next steps.", icon: "sparkles", badge: "AI" });
    }
    actions.push({ key: "assets", href: "/assets", label: t("assetManagement"),   desc: t("assetManagementDesc"),                       icon: "library",  badge: "Library" });

    if (roleReady && isInternal) {
      actions.push({ key: "consults", href: "/dashboard/opportunities", label: "Active Consults", desc: "Triage rooftop equipment consults submitted by external reps in your region.", icon: "clipboard", badge: "Triage" });
    }

    if (roleReady && isAdmin) {
      actions.push({ key: "admin",    href: "/admin",                  label: "Admin Console",      desc: "Configure sales reps, view user activity, projects, claims, and assessments.", icon: "shield",  badge: "Admin"   });
      actions.push({ key: "reports",  href: "/admin/rooftop-reports",  label: "Assessment Reports", desc: "Review submitted rooftop equipment audits.", icon: "clipboard", badge: "Reports" });
    }
  }

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQ.trim()) return;
    setSuggestOpen(false);
    router.push(`/assets?q=${encodeURIComponent(searchQ.trim())}`);
  };

  async function ensureSuggestData() {
    if (suggestData !== null || suggestLoadingRef.current) return;
    suggestLoadingRef.current = true;
    try {
      const query = supabase
        .from("products")
        .select("id,name,sku,series,section,internal_kind")
        .eq("active", true)
        .order("name", { ascending: true });
      if (!isInternal) query.neq("section", "internal_assets");
      const { data, error } = await query;
      if (error) {
        console.warn("dashboard search suggest fetch failed", error.message);
        setSuggestData([]);
        return;
      }
      setSuggestData((data as SearchProductRow[]) || []);
    } finally {
      suggestLoadingRef.current = false;
    }
  }

  const suggestions = useMemo(() => {
    if (!suggestData) return [];
    const s = searchQ.trim().toLowerCase();
    if (!s) return [];
    return suggestData
      .filter((p) => {
        const hay = [p.name, p.sku ?? "", p.series ?? "", p.section ?? ""].join(" ").toLowerCase();
        return hay.includes(s);
      })
      .slice(0, 6);
  }, [searchQ, suggestData]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const t = e.target as Node;
      const inMobile = searchBoxRef.current?.contains(t) ?? false;
      const inDesktop = searchBoxRefDesktop.current?.contains(t) ?? false;
      if (!inMobile && !inDesktop) {
        setSuggestOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  // ── Talk-to-Sales accent (used in desktop layout) ──────────────────────
  const teamsLink = salesRep?.teams_link || "";
  const repFullName = salesRep?.outside_sales_name || "";
  const repReady = !!serviceState && !!salesRep && !!teamsLink;
  const repSub = !serviceState
    ? t("talkToSalesNoState")
    : !salesRep
      ? t("talkToSalesNoRep")
      : !teamsLink
        ? t("talkToSalesNoLink")
        : `${t("talkToSalesWith")} ${repFullName}`;

  return (
    <>
    <main className="ds-page">
      <div className="mx-auto w-full max-w-2xl px-4 py-5 sm:px-6 sm:py-8 lg:hidden">
        {/* ── Greeting ───────────────────────────────────────────────────── */}
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-[26px] font-bold leading-[1.1] tracking-tight text-[var(--anchor-deep)] sm:text-[30px]">
              Hello<br />{greetingName}!
            </h1>
            <p className="mt-2 text-sm text-[var(--anchor-gray)]">
              {subtitle}
            </p>
          </div>
          <div className="mt-1 flex shrink-0 items-center gap-2">
            <div
              aria-label="User avatar"
              className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--anchor-mint)] text-sm font-bold text-[var(--anchor-deep)]"
            >
              {initials(fullName || "")}
            </div>
          </div>
        </div>

        {/* ── Search ─────────────────────────────────────────────────────── */}
        <div ref={searchBoxRef} className="relative mt-5">
          <form onSubmit={handleSearch} className="flex h-12 items-center gap-3 rounded-full bg-white px-5 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
            <input
              value={searchQ}
              onChange={(e) => {
                setSearchQ(e.target.value);
                setSuggestOpen(true);
                void ensureSuggestData();
              }}
              onFocus={() => {
                if (searchQ.trim()) setSuggestOpen(true);
                void ensureSuggestData();
              }}
              placeholder="Search assets, copilot, projects…"
              className="flex-1 border-none bg-transparent text-sm text-[var(--anchor-deep)] outline-none placeholder:text-[var(--anchor-gray)]"
            />
            <button type="submit" aria-label="Search" className="flex h-8 w-8 items-center justify-center text-[var(--anchor-gray)] transition hover:text-[var(--anchor-deep)]">
              <Icon name="search" className="h-[18px] w-[18px]" />
            </button>
          </form>

          {suggestOpen && searchQ.trim().length > 0 && suggestions.length > 0 && (
            <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-20 overflow-hidden rounded-2xl bg-white shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
              <ul className="max-h-80 overflow-auto py-1">
                {suggestions.map((p) => (
                  <li key={p.id}>
                    <Link
                      href={searchProductHref(p)}
                      onClick={() => setSuggestOpen(false)}
                      className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm transition hover:bg-[var(--surface-soft)]"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium text-[var(--anchor-deep)]">{p.name}</div>
                        {(p.sku || p.series) && (
                          <div className="truncate text-xs text-[var(--anchor-gray)]">
                            {[p.sku, p.series].filter(Boolean).join(" · ")}
                          </div>
                        )}
                      </div>
                      <span className="ds-badge shrink-0">{SECTION_LABEL[p.section]}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* ── Mobile / tablet layout: hero, then Quick Actions, then circles ── */}
        <div className="mt-4 space-y-4">

        {/* ── Hero card ──────────────────────────────────────────────────── */}
        <div className="relative overflow-hidden rounded-3xl bg-[var(--anchor-deep)] p-5 text-white shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
          <div className="pointer-events-none absolute -right-10 -top-10 h-44 w-44 rounded-full bg-[var(--anchor-green)] opacity-20" />
          <div className="pointer-events-none absolute right-3 top-6 z-0 opacity-95">
            <HeroFeatureVisual feature={visualFeature} size={92} />
          </div>
          <button aria-label="More" className="absolute right-4 top-4 z-10 text-white/70 transition hover:text-white">
            <Icon name="more" className="h-[18px] w-[18px]" />
          </button>

          <div className="relative">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--anchor-mint)]" />
              <span className="text-[11px] font-semibold tracking-wide">Update</span>
            </div>
            <div className="mt-2 text-[11px] text-white/70">{todayLabel}</div>
            <div
              key={`m-${heroAnimKey}`}
              className="hero-title-anim mt-2 max-w-[70%] text-[19px] font-bold leading-snug tracking-tight sm:text-[20px]"
            >
              {heroTitle}
            </div>
            <Link href={heroLink} className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-white/80 transition hover:text-white">
              {heroLinkLabel}
              <Icon name="right" className="h-3 w-3" />
            </Link>
          </div>
        </div>

        {/* ── Quick actions list ─────────────────────────────────────────── */}
        <div className="overflow-hidden rounded-3xl bg-white p-5 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
          <div className="flex items-center justify-between pb-1">
            <h2 className="text-[16px] font-bold tracking-tight text-[var(--anchor-deep)]">Quick Actions</h2>
          </div>

          <div className="mt-1 divide-y divide-[var(--surface-soft)]">
            {actions.map((a) => {
              const Row = (
                <div className="flex items-center gap-3 py-3.5">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[var(--anchor-mint)] text-[var(--anchor-deep)]">
                    <Icon name={a.icon} className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-[var(--anchor-deep)]">{a.label}</div>
                    <div className="truncate text-xs text-[var(--anchor-gray)]">{a.desc}</div>
                  </div>
                  <Icon name="right" className="h-4 w-4 shrink-0 text-[var(--anchor-gray)]" strokeWidth={2.4} />
                </div>
              );
              return a.external ? (
                <a key={a.key} href={a.href} target="_blank" rel="noopener noreferrer" className="-mx-5 block px-5 transition hover:bg-[var(--surface-soft)]/50">
                  {Row}
                </a>
              ) : (
                <Link key={a.key} href={a.href} className="-mx-5 block px-5 transition hover:bg-[var(--surface-soft)]/50">
                  {Row}
                </Link>
              );
            })}
          </div>
        </div>

        {/* ── Stat icon buttons (below Quick Actions) ────────────────────── */}
        <div className={`grid ${stats.length === 3 ? "grid-cols-3 gap-3" : "grid-cols-2 gap-4"}`}>
          {stats.map((s, i) => {
            const isExt = "external" in s && (s as { external?: boolean }).external;
            const Wrap = isExt
              ? ({ children }: { children: React.ReactNode }) => (
                  <a href={s.href} target="_blank" rel="noopener noreferrer" aria-label={s.label} className="group flex flex-col items-center gap-2">
                    {children}
                  </a>
                )
              : ({ children }: { children: React.ReactNode }) => (
                  <Link href={s.href} aria-label={s.label} className="group flex flex-col items-center gap-2">{children}</Link>
                );
            const sText = "text" in s ? (s as { text?: string }).text : undefined;
            return (
              <Wrap key={i}>
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--anchor-mint)] text-[var(--anchor-deep)] shadow-[0_2px_8px_rgba(0,0,0,0.04)] transition group-hover:bg-[var(--anchor-green)] group-hover:text-white group-hover:shadow-[0_4px_14px_rgba(0,0,0,0.08)]">
                  {sText ? (
                    <span className="text-[20px] font-bold tracking-tight">{sText}</span>
                  ) : (
                    <Icon name={s.icon} className="h-7 w-7" />
                  )}
                </div>
                <div className="text-center text-[11px] font-medium text-[var(--anchor-deep)] sm:text-xs">{s.label}</div>
              </Wrap>
            );
          })}
        </div>

        </div>

        {/* Loading hint */}
        {booting && (
          <p className="mt-6 text-center text-xs text-[var(--anchor-gray)]">Loading your workspace…</p>
        )}
      </div>

      {/* ───────────────────────────────────────────────────────────────────
          Desktop layout (≥ lg) — sidebar is rendered globally in root layout
         ─────────────────────────────────────────────────────────────────── */}
      <div className="hidden lg:block">
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Topbar */}
          <header className="flex items-center justify-between gap-6 px-8 py-6">
            <h1 className="text-[28px] font-bold tracking-tight text-[var(--anchor-deep)]">{t("dashboard")}</h1>

            <div ref={searchBoxRefDesktop} className="relative max-w-md flex-1">
              <form onSubmit={handleSearch} className="flex h-12 items-center gap-3 rounded-full bg-white px-5 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
                <input
                  value={searchQ}
                  onChange={(e) => {
                    setSearchQ(e.target.value);
                    setSuggestOpen(true);
                    void ensureSuggestData();
                  }}
                  onFocus={() => {
                    if (searchQ.trim()) setSuggestOpen(true);
                    void ensureSuggestData();
                  }}
                  placeholder="Search assets, copilot, projects…"
                  className="flex-1 border-none bg-transparent text-sm text-[var(--anchor-deep)] outline-none placeholder:text-[var(--anchor-gray)]"
                />
                <button type="submit" aria-label="Search" className="flex h-8 w-8 items-center justify-center text-[var(--anchor-gray)] transition hover:text-[var(--anchor-deep)]">
                  <Icon name="search" className="h-[18px] w-[18px]" />
                </button>
              </form>

              {suggestOpen && searchQ.trim().length > 0 && suggestions.length > 0 && (
                <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-20 overflow-hidden rounded-2xl bg-white shadow-[0_8px_24px_rgba(0,0,0,0.08)]">
                  <ul className="max-h-80 overflow-auto py-1">
                    {suggestions.map((p) => (
                      <li key={p.id}>
                        <Link
                          href={searchProductHref(p)}
                          onClick={() => setSuggestOpen(false)}
                          className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm transition hover:bg-[var(--surface-soft)]"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="truncate font-medium text-[var(--anchor-deep)]">{p.name}</div>
                            {(p.sku || p.series) && (
                              <div className="truncate text-xs text-[var(--anchor-gray)]">
                                {[p.sku, p.series].filter(Boolean).join(" · ")}
                              </div>
                            )}
                          </div>
                          <span className="ds-badge shrink-0">{SECTION_LABEL[p.section]}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

          </header>

          {/* Content */}
          <div className="flex-1 px-8 pb-12">
            {/* Hero */}
            <div className="relative overflow-hidden rounded-3xl bg-[var(--anchor-deep)] p-7 text-white shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
              <div className="pointer-events-none absolute -right-12 -top-12 h-52 w-52 rounded-full bg-[var(--anchor-green)] opacity-25" />
              <div className="pointer-events-none absolute right-8 top-8 z-0 opacity-95">
                <HeroFeatureVisual feature={visualFeature} size={132} />
              </div>
              <div className="relative">
                <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-[var(--anchor-mint)]" />
                  <span className="text-[11px] font-semibold tracking-wide">Update</span>
                </div>
                <div className="mt-3 text-[12px] text-white/70">{todayLabel}</div>
                <div
                  key={`d-${heroAnimKey}`}
                  className="hero-title-anim mt-3 max-w-[70%] text-[26px] font-bold leading-tight tracking-tight"
                >
                  {heroTitle}
                </div>
                <Link href={heroLink} className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-white/85 transition hover:text-white">
                  {heroLinkLabel}
                  <Icon name="right" className="h-4 w-4" />
                </Link>
              </div>
            </div>

            {/* Quick Actions grid */}
            <div className="mt-5 rounded-3xl bg-white p-6 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
              <h2 className="text-[18px] font-bold tracking-tight text-[var(--anchor-deep)]">Quick Actions</h2>
              <div className="mt-4 grid grid-cols-2 gap-4 xl:grid-cols-4">
                {actions.map((a) => {
                  const Inner = (
                    <div className="flex h-full items-start gap-4 rounded-2xl border border-[var(--surface-soft)] p-4 transition hover:border-[var(--anchor-mint)] hover:bg-[var(--surface-soft)]/40">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--anchor-mint)] text-[var(--anchor-deep)]">
                        <Icon name={a.icon} className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-semibold text-[var(--anchor-deep)]">{a.label}</div>
                        <div className="mt-1 text-xs text-[var(--anchor-gray)]">{a.desc}</div>
                      </div>
                      <Icon name="right" className="mt-1 h-4 w-4 shrink-0 text-[var(--anchor-gray)]" strokeWidth={2.4} />
                    </div>
                  );
                  return a.external ? (
                    <a key={a.key} href={a.href} target="_blank" rel="noopener noreferrer" className="block">{Inner}</a>
                  ) : (
                    <Link key={a.key} href={a.href} className="block">{Inner}</Link>
                  );
                })}
              </div>
            </div>

            {/* Stat icon buttons (below Quick Actions) */}
            <div className="mt-6 flex flex-wrap items-start gap-8">
              {stats.map((s, i) => {
                const isExt = "external" in s && (s as { external?: boolean }).external;
                const Wrap = isExt
                  ? ({ children }: { children: React.ReactNode }) => (
                      <a href={s.href} target="_blank" rel="noopener noreferrer" aria-label={s.label} className="group flex flex-col items-center gap-2">{children}</a>
                    )
                  : ({ children }: { children: React.ReactNode }) => (
                      <Link href={s.href} aria-label={s.label} className="group flex flex-col items-center gap-2">{children}</Link>
                    );
                const sText = "text" in s ? (s as { text?: string }).text : undefined;
                return (
                  <Wrap key={i}>
                    <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[var(--anchor-mint)] text-[var(--anchor-deep)] shadow-[0_2px_8px_rgba(0,0,0,0.04)] transition group-hover:bg-[var(--anchor-green)] group-hover:text-white group-hover:shadow-[0_4px_14px_rgba(0,0,0,0.1)]">
                      {sText ? (
                        <span className="text-2xl font-bold tracking-tight">{sText}</span>
                      ) : (
                        <Icon name={s.icon} className="h-8 w-8" />
                      )}
                    </div>
                    <div className="text-sm font-medium text-[var(--anchor-deep)]">{s.label}</div>
                  </Wrap>
                );
              })}
            </div>

            {booting && (
              <p className="mt-6 text-center text-xs text-[var(--anchor-gray)]">Loading your workspace…</p>
            )}
          </div>
        </div>
      </div>

    </main>
    </>
  );
}

