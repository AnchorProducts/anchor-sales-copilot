// src/app/dashboard/page.tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { useEffectiveRole } from "@/lib/role/viewAs";
import { FeatureGraphic, ToolLoader } from "@/app/components/visuals/FeatureGraphic";

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
  name: string | null;
  email: string | null;
  teams_link: string | null;
};

export const dynamic = "force-dynamic";

/* ─── Inline SVG icon set ───────────────────────────────────────────────── */
type IconName =
  | "search" | "more" | "right" | "grid" | "trendUp" | "trendDown"
  | "sparkles" | "library" | "phone" | "clipboard" | "wallet" | "shield"
  | "settings" | "rocket" | "camera" | "logout" | "user";

function Icon({ name, className = "h-5 w-5", strokeWidth = 2 }: { name: IconName; className?: string; strokeWidth?: number }) {
  const c = { fill: "none", stroke: "currentColor", strokeWidth, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (name) {
    case "search":   return (<svg viewBox="0 0 24 24" className={className} {...c}><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.3-4.3"/></svg>);
    case "more":     return (<svg viewBox="0 0 24 24" className={className} {...c}><circle cx="12" cy="5"  r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/></svg>);
    case "right":    return (<svg viewBox="0 0 24 24" className={className} {...c}><polyline points="9 18 15 12 9 6"/></svg>);
    case "grid":     return (<svg viewBox="0 0 24 24" className={className} {...c}><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>);
    case "trendUp":  return (<svg viewBox="0 0 24 24" className={className} {...c}><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>);
    case "trendDown":return (<svg viewBox="0 0 24 24" className={className} {...c}><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>);
    case "sparkles": return (<svg viewBox="0 0 24 24" className={className} {...c}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><circle cx="8" cy="10" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="10" r="1" fill="currentColor" stroke="none"/><circle cx="16" cy="10" r="1" fill="currentColor" stroke="none"/></svg>);
    case "library":  return (<svg viewBox="0 0 24 24" className={className} {...c}><path d="M20 7h-3a2 2 0 0 1-2-2V2"/><path d="M9 18a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h7l4 4v10a2 2 0 0 1-2 2z"/><path d="M3 7.6v12.8A1.6 1.6 0 0 0 4.6 22h9.8"/></svg>);
    case "phone":    return (<svg viewBox="0 0 24 24" className={className} {...c}><path d="M22 16.92V21a1 1 0 0 1-1.11 1A19.86 19.86 0 0 1 2 4.11 1 1 0 0 1 3 3h4.09a1 1 0 0 1 1 .75l1 4a1 1 0 0 1-.27 1L7.21 10.21a16 16 0 0 0 6.58 6.58l1.46-1.61a1 1 0 0 1 1-.27l4 1a1 1 0 0 1 .75 1z"/></svg>);
    case "clipboard":return (<svg viewBox="0 0 24 24" className={className} {...c}><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 14l2 2 4-4"/></svg>);
    case "wallet":   return (<svg viewBox="0 0 24 24" className={className} {...c}><path d="M20 12V8H4a2 2 0 0 1 0-4h14v4"/><rect x="2" y="6" width="20" height="14" rx="2"/><circle cx="16" cy="13" r="1.5"/></svg>);
    case "shield":   return (<svg viewBox="0 0 24 24" className={className} {...c}><path d="M4 4v16h16"/><rect x="7" y="11" width="3" height="6" rx="0.5"/><rect x="12" y="7" width="3" height="10" rx="0.5"/><rect x="17" y="13" width="3" height="4" rx="0.5"/></svg>);
    case "settings": return (<svg viewBox="0 0 24 24" className={className} {...c}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>);
    case "rocket":   return (<svg viewBox="0 0 24 24" className={className} {...c}><path d="M5 13l4 4-4 4-2-2 2-6z"/><path d="M14 6l4 4-9 9-4-4 9-9z"/><path d="M19 2l3 3-3 3-3-3 3-3z"/></svg>);
    case "camera":   return (<svg viewBox="0 0 24 24" className={className} {...c}><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>);
    case "logout":   return (<svg viewBox="0 0 24 24" className={className} {...c}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>);
    case "user":     return (<svg viewBox="0 0 24 24" className={className} {...c}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>);
  }
}

/* ─── Hero feature catalog ──────────────────────────────────────────────── */
// Data-driven features (returned by the most-recent endpoint).
type HeroFeatureKey = "chat" | "assets" | "consults" | "commission" | "notable";
// Visual-only key — includes "admin" for the admin-pulse fallback animation.
type HeroVisualKey = HeroFeatureKey | "admin";

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
function HeroFeatureVisual({ feature, size = 96 }: { feature: HeroVisualKey; size?: number }) {
  const wrap: React.CSSProperties = { width: size, height: size };
  const mint = "var(--anchor-mint)";

  // Resource Library keeps its own dropping-sheets visual (mint pages) inline.
  if (feature === "assets") {
    return (
      <svg viewBox="0 0 100 100" style={wrap} aria-hidden>
        {[
          { x: 26, y: 38, rot: -9, delay: "0s" },
          { x: 43, y: 34, rot: 6, delay: "0.3s" },
          { x: 35, y: 43, rot: -2, delay: "0.6s" },
        ].map((s, i) => (
          <g key={i} transform={`translate(${s.x} ${s.y}) rotate(${s.rot} 15 20)`}>
            <g>
              <animateTransform
                attributeName="transform"
                type="translate"
                values="0 -30;0 0;0 0;0 -30"
                keyTimes="0;0.28;0.82;1"
                dur="1.8s"
                begin={s.delay}
                repeatCount="indefinite"
              />
              <animate
                attributeName="opacity"
                values="0;1;1;0"
                keyTimes="0;0.28;0.82;1"
                dur="1.8s"
                begin={s.delay}
                repeatCount="indefinite"
              />
              <path
                d="M2 1 H21 L30 10 V39 a2 2 0 0 1 -2 2 H2 a2 2 0 0 1 -2 -2 V3 a2 2 0 0 1 2 -2 Z"
                fill={mint}
                stroke="var(--anchor-deep)"
                strokeWidth="1.5"
                strokeLinejoin="round"
              />
              <path d="M21 1 V8 a2 2 0 0 0 2 2 H30" fill="none" stroke="var(--anchor-deep)" strokeWidth="1.5" strokeLinejoin="round" />
              <rect x="7" y="17" width="16" height="3" rx="1.5" fill="var(--anchor-deep)" />
              <rect x="7" y="24" width="15" height="2.4" rx="1.2" fill="var(--anchor-deep)" />
              <rect x="7" y="30" width="10" height="2.4" rx="1.2" fill="var(--anchor-deep)" />
            </g>
          </g>
        ))}
      </svg>
    );
  }

  // Every other tool shares the animated icons in FeatureGraphic — here in the
  // hero's mint-on-green palette. The same component powers each page's loader.
  return (
    <FeatureGraphic
      feature={feature}
      size={size}
      accent={mint}
      soft="rgba(156,226,187,0.22)"
      ink="var(--anchor-deep)"
    />
  );
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
  const [serviceZip, setServiceZip] = useState<string>("");
  const [salesReps, setSalesReps] = useState<SalesRepLite[]>([]);
  const [fullName, setFullName] = useState<string>("");
  const [canSeeCommission, setCanSeeCommission] = useState(false);
  const [searchQ, setSearchQ] = useState("");

  const [suggestData, setSuggestData] = useState<SearchProductRow[] | null>(null);
  const [suggestOpen, setSuggestOpen] = useState(false);
  const suggestLoadingRef = useRef(false);
  const searchBoxRef = useRef<HTMLDivElement | null>(null);
  const searchBoxRefDesktop = useRef<HTMLDivElement | null>(null);

  const [topFeature, setTopFeature] = useState<HeroFeatureKey | null>(null);
  const [featureCounts, setFeatureCounts] = useState<Record<string, number>>({});

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
        .select("role,user_type,email,service_state,service_zip,full_name,anchor_commission")
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
          .select("role,user_type,email,service_state,service_zip,full_name,anchor_commission")
          .single();
        prof = created ?? null;
      }

      if (!alive) return;
      const p = prof as Record<string, unknown> | null;
      setRole(String((p?.role as string) || ""));
      setServiceState(String((p?.service_state as string) || ""));
      setServiceZip(String((p?.service_zip as string) || ""));
      setFullName(String((p?.full_name as string) || (user.user_metadata?.full_name as string) || (user.email as string) || ""));
      setCanSeeCommission((p?.anchor_commission as boolean) === true);
      setRoleReady(true);
    })();
    return () => { alive = false; };
  }, [booting, supabase]);

  // Fetch the assigned sales reps when the user's service state is known.
  // A state can have multiple external reps; we show all of them.
  useEffect(() => {
    if (!serviceState) { setSalesReps([]); return; }
    let alive = true;
    (async () => {
      try {
        const qs = new URLSearchParams({ state: serviceState });
        if (serviceZip) qs.set("zip", serviceZip);
        const res = await fetch(`/api/sales-reps/by-state?${qs.toString()}`, { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (!alive) return;
        setSalesReps(Array.isArray(json?.reps) ? json.reps : []);
      } catch {
        if (alive) setSalesReps([]);
      }
    })();
    return () => { alive = false; };
  }, [serviceState, serviceZip]);

  // Fetch the user's most-recent feature so the hero reflects the last thing
  // they opened. Re-run whenever the dashboard regains focus — on mobile,
  // returning here (in-app nav, PWA, or bfcache restore) often doesn't remount,
  // so a mount-only fetch would leave the hero stale.
  useEffect(() => {
    if (booting || !roleReady) return;
    let alive = true;

    const load = async () => {
      try {
        const res = await fetch("/api/user-events/most-used", { cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json().catch(() => null);
        if (!alive) return;
        const f = json?.feature;
        if (f === "chat" || f === "assets" || f === "consults" || f === "commission" || f === "notable") {
          setTopFeature(f);
        }
        if (json?.counts && typeof json.counts === "object") {
          setFeatureCounts(json.counts as Record<string, number>);
        }
      } catch {
        // analytics is best-effort; never block the hero
      }
    };

    void load();

    const onVisible = () => { if (document.visibilityState === "visible") void load(); };
    const onPageShow = () => { void load(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("focus", onPageShow);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("focus", onPageShow);
    };
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
    ? canSeeCommission
      ? ["chat", "assets", "consults", "commission", "notable"]
      : ["chat", "assets", "consults", "notable"]
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
  const visualFeature: HeroVisualKey =
    resolvedFeature ?? (isAdmin ? "admin" : "chat");
  // Re-keyed so the title fades in when the feature resolves.
  const heroAnimKey = resolvedFeature ?? "default";

  const subtitle = isAdmin
    ? "Configure reps, review activity, and audit reports."
    : isInternal
    ? "Jump into Copilot, manage assets, or check rooftop reports."
    : "Jump into Copilot, manage assets, or talk to your rep.";

  // Stat cards: contextual to role, always 2 up. `tutorialKey` is what the
  // walkthrough overlay uses to highlight each circle one at a time — keep it
  // unique per role/stat.
  const stat1 = isAdmin
    ? { label: "Service Reps", value: "All", trend: "Manage", href: "/admin/sales-reps", icon: "user" as IconName, tutorialKey: "stat-reps" }
    : isInternal
    ? { label: "Asset Library", value: "Browse", trend: "Library", href: "/assets", icon: "library" as IconName, tutorialKey: "stat-assets" }
    : { label: "Service State", value: serviceState || "—", trend: serviceState ? "Active" : "Set up", href: "/dashboard/settings", icon: "shield" as IconName, text: serviceState || "Set", tutorialKey: "stat-service-state" };

  const stat2 = isAdmin
    ? { label: "Reports", value: "View", trend: "Audit", href: "/admin/rooftop-reports", icon: "clipboard" as IconName, tutorialKey: "stat-reports" }
    : isInternal
    ? { label: "Copilot", value: "Ask", trend: "AI", href: "/chat", icon: "sparkles" as IconName, tutorialKey: "stat-copilot" }
    : { label: salesReps.length > 1 ? "Your Reps" : "Your Rep", value: salesReps[0]?.name?.split(" ")[0] || "—", trend: salesReps[0]?.teams_link ? "Ready" : "Setup", href: salesReps[0]?.teams_link || "/dashboard/settings", external: !!salesReps[0]?.teams_link, icon: "phone" as IconName, tutorialKey: "stat-your-rep" };

  const stats = [stat1, stat2];

  // Quick actions list (role-gated)
  type Action = { key: string; href: string; label: string; desc: string; icon: IconName; badge: string; external?: boolean };
  const actions: Action[] = [];

  if (roleReady && isExternal) {
    // External rep gets the four equal Quick Actions in this exact order:
    //   Resource Library → Copilot → REC → Commission Claim Form
    actions.push({ key: "assets",     href: "/assets",                       label: t("assetManagement"),     desc: t("assetManagementDesc"),     icon: "library",  badge: "Library"    });
    actions.push({ key: "chat",       href: "/chat",                         label: t("openCopilot"),         desc: "Get solution recommendations and next steps.", icon: "sparkles", badge: "AI" });
    actions.push({ key: "project",    href: "/dashboard/opportunities/new",  label: t("projectIdentifier"),   desc: t("projectIdentifierDesc"),   icon: "clipboard", badge: "Projects"   });
    // Commission Claim Form is gated per-user by the `anchor_commission` flag,
    // which admins toggle from /admin/users. Hidden unless explicitly granted.
    if (canSeeCommission) {
      actions.push({ key: "commission", href: "/dashboard/commission/new",     label: t("commissionClaim"),     desc: t("commissionClaimDesc"),     icon: "wallet",    badge: "Commission" });
    }
  } else {
    if (heroLink !== "/chat") {
      actions.push({ key: "chat", href: "/chat", label: t("openCopilot"), desc: "Get solution recommendations and next steps.", icon: "sparkles", badge: "AI" });
    }
    actions.push({ key: "assets", href: "/assets", label: t("assetManagement"),   desc: t("assetManagementDesc"),                       icon: "library",  badge: "Library" });

    if (roleReady && isInternal) {
      actions.push({ key: "consults", href: "/dashboard/opportunities", label: "Active Consults", desc: "Triage rooftop equipment consults submitted by external reps in your region.", icon: "clipboard", badge: "Triage" });
    }

    if (roleReady && isAdmin) {
      // Admins get every user-facing option in addition to the admin tools.
      actions.push({ key: "project",    href: "/dashboard/opportunities/new",  label: t("projectIdentifier"), desc: t("projectIdentifierDesc"),                 icon: "clipboard", badge: "Projects"   });
      actions.push({ key: "commission", href: "/dashboard/commission/new",     label: t("commissionClaim"),   desc: t("commissionClaimDesc"),                   icon: "wallet",    badge: "Commission" });
      actions.push({ key: "notable",    href: "/dashboard/notable-projects/new", label: t("notableProject"),  desc: "Submit a notable rooftop project for the showcase.", icon: "camera", badge: "Notable" });
      actions.push({ key: "admin",      href: "/admin",                        label: "Admin Console",        desc: "Configure sales reps, view user activity, projects, claims, and assessments.", icon: "shield", badge: "Admin" });
      actions.push({ key: "reports",    href: "/admin/rooftop-reports",        label: "Assessment Reports",   desc: "Review submitted rooftop equipment audits.", icon: "clipboard", badge: "Reports" });
    }
  }

  // The hero "green block" already features your top tool — drop it from the
  // Quick Actions below so the same tool isn't shown twice. (`project` is the
  // action key for the "consults" feature.)
  if (resolvedFeature) {
    for (let i = actions.length - 1; i >= 0; i--) {
      const featureKey = actions[i].key === "project" ? "consults" : actions[i].key;
      if (featureKey === resolvedFeature) actions.splice(i, 1);
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

  // First load (auth + profile): show a branded loader instead of flashing an
  // empty hub.
  if (!roleReady) {
    return (
      <main className="ds-page">
        <div className="flex min-h-[80vh] items-center justify-center">
          <ToolLoader feature="dashboard" label={t("loading")} />
        </div>
      </main>
    );
  }

  // "Your reps" contacts card — lists every external rep assigned to the
  // user's service state, each with a direct Teams link. Shared by both the
  // mobile and desktop layouts. Hidden until a service state + reps resolve.
  const renderRepsCard = () => {
    if (!serviceState || salesReps.length === 0) return null;
    return (
      <div className="rounded-3xl border border-[var(--border-default)] bg-white p-4 shadow-sm sm:p-5">
        <div className="flex items-center gap-2">
          <div className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--anchor-mint)] text-[var(--anchor-deep)]">
            <Icon name="phone" className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-bold text-[var(--anchor-deep)]">
              {salesReps.length > 1 ? "Your sales reps" : "Your sales rep"} · {serviceState}
            </div>
            <div className="text-[11px] text-[var(--anchor-gray)]">Reach out directly on Teams.</div>
          </div>
        </div>
        <ul className="mt-3 divide-y divide-black/5">
          {salesReps.map((rep, i) => (
            <li key={rep.email || rep.name || i} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-[var(--anchor-deep)]">{rep.name || "—"}</div>
                {rep.email && <div className="truncate text-[11px] text-[var(--anchor-gray)]">{rep.email}</div>}
              </div>
              {rep.teams_link ? (
                <a
                  href={rep.teams_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="shrink-0 rounded-full bg-[var(--anchor-deep)] px-3 py-1.5 text-[12px] font-semibold text-white transition hover:bg-[var(--anchor-green)]"
                >
                  Teams
                </a>
              ) : (
                <span className="shrink-0 text-[11px] text-[var(--anchor-gray)]">No link</span>
              )}
            </li>
          ))}
        </ul>
      </div>
    );
  };

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

        {/* ── Hero button — whole block is the link, no inner CTA ────────── */}
        <Link
          href={heroLink}
          data-track-id="dashboard-hero-tap"
          data-tutorial="dashboard-hero"
          aria-label={heroTitle}
          className="group relative flex min-h-[124px] items-center overflow-hidden rounded-3xl bg-[var(--anchor-deep)] p-5 text-white shadow-[0_2px_8px_rgba(0,0,0,0.06)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0 active:shadow-md"
        >
          <div className="pointer-events-none absolute -right-10 -top-10 h-44 w-44 rounded-full bg-[var(--anchor-green)] opacity-20" />

          <div className="relative flex w-full items-center gap-4">
            <div className="min-w-0 flex-1">
              <div className="text-[11px] text-white/70">{todayLabel}</div>
              <div
                key={`m-${heroAnimKey}`}
                className="hero-title-anim mt-2 text-[19px] font-bold leading-snug tracking-tight sm:text-[20px]"
              >
                {heroTitle}
              </div>
            </div>
            <HeroFeatureVisual feature={visualFeature} size={64} />
          </div>
        </Link>

        {/* ── Quick actions bento — tile width scales with how much you use each app ── */}
        <div data-tutorial="quick-actions">
          <h2 className="px-1 text-[16px] font-bold tracking-tight text-[var(--anchor-deep)]">Quick Actions</h2>
          <div className="mt-3 grid grid-cols-2 gap-3 [grid-auto-flow:dense]">
            {(() => {
              const featureKeyFor = (key: string) => (key === "project" ? "consults" : key);
              const ranked = [...actions]
                .map((x) => ({ key: x.key, count: featureCounts[featureKeyFor(x.key)] ?? 0 }))
                .sort((x, y) => y.count - x.count);
              const hasAnyData = ranked.some((r) => r.count > 0);
              // On mobile (2-col grid) promote one tile to full width ONLY when
              // the tile count is odd, so the rest always pair into clean rows.
              // (An even count with one wide tile leaves a lopsided half-tile.)
              const wideKey =
                actions.length % 2 === 1
                  ? (hasAnyData ? ranked[0]?.key : actions[0]?.key)
                  : null;
              const topKeys = new Set(wideKey ? [wideKey] : []);

              return actions.map((a) => {
                const isTopUsed = topKeys.has(a.key);
                const span = isTopUsed ? "col-span-2" : "col-span-1";
                const tutorialKey = `qa-${a.key}`;
                const Wrap = (props: { children: React.ReactNode; className: string }) =>
                  a.external ? (
                    <a href={a.href} target="_blank" rel="noopener noreferrer" data-tutorial={tutorialKey} className={props.className}>{props.children}</a>
                  ) : (
                    <Link href={a.href} data-tutorial={tutorialKey} className={props.className}>{props.children}</Link>
                  );

                return (
                <Wrap
                  key={a.key}
                  className={`group block rounded-3xl border border-[var(--border-default)] bg-white p-4 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--anchor-green)] hover:bg-[var(--anchor-mint)]/30 hover:shadow-md active:translate-y-0 active:shadow-sm ${span}`}
                >
                  <div className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--anchor-mint)] text-[var(--anchor-deep)] transition group-hover:bg-[var(--anchor-green)] group-hover:text-white">
                    <Icon name={a.icon} className="h-5 w-5" />
                  </div>
                  <div className="mt-3">
                    <div className="text-sm font-bold leading-tight text-[var(--anchor-deep)]">{a.label}</div>
                    <div className="mt-1 text-[11px] leading-snug text-[var(--anchor-gray)]">{a.desc}</div>
                  </div>
                </Wrap>
                );
              });
            })()}
          </div>
        </div>

        {/* ── Stat icon buttons (below Quick Actions) ────────────────────── */}
        <div data-tutorial="stat-buttons" className="grid grid-cols-2 gap-4">
          {stats.map((s, i) => {
            const isExt = "external" in s && (s as { external?: boolean }).external;
            const tKey = (s as { tutorialKey?: string }).tutorialKey;
            const Wrap = isExt
              ? ({ children }: { children: React.ReactNode }) => (
                  <a href={s.href} target="_blank" rel="noopener noreferrer" aria-label={s.label} data-tutorial={tKey} className="group flex flex-col items-center gap-2">
                    {children}
                  </a>
                )
              : ({ children }: { children: React.ReactNode }) => (
                  <Link href={s.href} aria-label={s.label} data-tutorial={tKey} className="group flex flex-col items-center gap-2">{children}</Link>
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

        {/* Your reps — all external reps for the user's state */}
        {renderRepsCard()}

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
            {/* Hero button — whole block is the link */}
            <Link
              href={heroLink}
              data-track-id="dashboard-hero-tap"
              data-tutorial="dashboard-hero"
              aria-label={heroTitle}
              className="group relative flex min-h-[168px] items-center overflow-hidden rounded-3xl bg-[var(--anchor-deep)] p-7 text-white shadow-[0_2px_8px_rgba(0,0,0,0.06)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0 active:shadow-md"
            >
              <div className="pointer-events-none absolute -right-12 -top-12 h-52 w-52 rounded-full bg-[var(--anchor-green)] opacity-25" />

              <div className="relative flex w-full items-center gap-6">
                <div className="min-w-0 flex-1">
                  <div className="text-[12px] text-white/70">{todayLabel}</div>
                  <div
                    key={`d-${heroAnimKey}`}
                    className="hero-title-anim mt-2 text-[26px] font-bold leading-tight tracking-tight"
                  >
                    {heroTitle}
                  </div>
                </div>
                <HeroFeatureVisual feature={visualFeature} size={96} />
              </div>
            </Link>

            {/* Quick Actions bento — tile width scales with how much you use each app */}
            <div className="mt-5" data-tutorial="quick-actions">
              <h2 className="px-1 text-[18px] font-bold tracking-tight text-[var(--anchor-deep)]">Quick Actions</h2>
              {/* Top 2 actions by 30-day usage count get col-span-2; rest 1-wide.
                  Falls back to first action only when no usage data yet. */}
              <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 lg:[grid-auto-flow:dense]">
                {(() => {
                  const featureKeyFor = (key: string) => (key === "project" ? "consults" : key);
                  const ranked = [...actions]
                    .map((x) => ({ key: x.key, count: featureCounts[featureKeyFor(x.key)] ?? 0 }))
                    .sort((x, y) => y.count - x.count);
                  const hasAnyData = ranked.some((r) => r.count > 0);
                  const topKeys = new Set(
                    hasAnyData
                      ? ranked.slice(0, 2).filter((r) => r.count > 0).map((r) => r.key)
                      : actions.slice(0, 1).map((a) => a.key) // fallback: just the first
                  );

                  return actions.map((a) => {
                    const isTopUsed = topKeys.has(a.key);
                    const span = isTopUsed ? "lg:col-span-2" : "lg:col-span-1";
                    const tutorialKey = `qa-${a.key}`;
                  const Wrap = (props: { children: React.ReactNode; className: string }) =>
                    a.external ? (
                      <a href={a.href} target="_blank" rel="noopener noreferrer" data-tutorial={tutorialKey} className={props.className}>{props.children}</a>
                    ) : (
                      <Link href={a.href} data-tutorial={tutorialKey} className={props.className}>{props.children}</Link>
                    );

                  return (
                    <Wrap
                      key={a.key}
                      className={`group block rounded-3xl border border-[var(--border-default)] bg-white p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-[var(--anchor-green)] hover:bg-[var(--anchor-mint)]/30 hover:shadow-md active:translate-y-0 active:shadow-sm ${span}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--anchor-mint)] text-[var(--anchor-deep)] transition group-hover:bg-[var(--anchor-green)] group-hover:text-white">
                          <Icon name={a.icon} className="h-5 w-5" />
                        </div>
                        <span className="rounded-full bg-[var(--surface-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--anchor-deep)]">
                          {a.badge}
                        </span>
                      </div>
                      <div className="mt-4">
                        <div className="text-sm font-bold text-[var(--anchor-deep)] sm:text-base">{a.label}</div>
                        <div className="mt-1 text-xs text-[var(--anchor-gray)]">{a.desc}</div>
                      </div>
                    </Wrap>
                  );
                  });
                })()}
              </div>
            </div>

            {/* Stat icon buttons (below Quick Actions) */}
            <div data-tutorial="stat-buttons" className="mt-6 flex flex-wrap items-start gap-8">
              {stats.map((s, i) => {
                const isExt = "external" in s && (s as { external?: boolean }).external;
                const tKey = (s as { tutorialKey?: string }).tutorialKey;
                const Wrap = isExt
                  ? ({ children }: { children: React.ReactNode }) => (
                      <a href={s.href} target="_blank" rel="noopener noreferrer" aria-label={s.label} data-tutorial={tKey} className="group flex flex-col items-center gap-2">{children}</a>
                    )
                  : ({ children }: { children: React.ReactNode }) => (
                      <Link href={s.href} aria-label={s.label} data-tutorial={tKey} className="group flex flex-col items-center gap-2">{children}</Link>
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

            {/* Your reps — all external reps for the user's state */}
            <div className="mt-6 max-w-md">{renderRepsCard()}</div>

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

