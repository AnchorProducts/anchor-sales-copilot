"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { AppNavbar } from "@/app/components/ui/AppNavbar";
import { Card } from "@/app/components/ui/Card";
import { useTranslation } from "@/lib/i18n/useTranslation";

export const dynamic = "force-dynamic";

type IconName =
  | "users" | "chart" | "phone" | "clipboard" | "wallet"
  | "shield" | "camera" | "book" | "image" | "mail" | "briefcase" | "grid";

type AdminCard = {
  title: string;
  description: string;
  badge: "Config" | "Analytics" | "Content";
  href?: string;
  comingSoon?: boolean;
  icon: IconName;
  featured?: boolean;
};

const CARDS: AdminCard[] = [
  {
    title: "OEM Analytics",
    description: "Manufacturer rep & consultant engagement: the OEM matrix, adoption and usage by OEM, with a matrix PDF export.",
    badge: "Analytics",
    href: "/admin/analytics",
    icon: "chart",
    featured: true,
  },
  {
    title: "User Analytics",
    description: "Everyone who isn't an OEM rep or consultant — internal Anchor staff and other signed-up users, with per-user activity PDFs.",
    badge: "Analytics",
    href: "/admin/user-analytics",
    icon: "users",
  },
  {
    title: "Users",
    description: "Edit names, emails, phone numbers, and roles for every user.",
    badge: "Config",
    href: "/admin/users",
    icon: "users",
  },
  {
    title: "Sales Reps",
    description: "Configure inside/outside sales reps, regions, Teams links, and contact info.",
    badge: "Config",
    href: "/admin/sales-reps",
    icon: "phone",
  },
  {
    title: "Notifications",
    description: "Choose who gets commission claim emails and who receives the Friday analytics report.",
    badge: "Config",
    href: "/admin/notifications",
    icon: "mail",
  },
  {
    title: "Projects",
    description: "All submitted opportunities across users and regions.",
    badge: "Analytics",
    href: "/dashboard/opportunities",
    icon: "clipboard",
  },
  {
    title: "Commission Claims",
    description: "Every commission claim submitted by external reps, with rep info and order details.",
    badge: "Analytics",
    href: "/admin/commission-claims",
    icon: "wallet",
  },
  {
    title: "Rooftop Reports",
    description: "All OSHA-guided rooftop equipment audit submissions, with PDFs and flag counts.",
    badge: "Analytics",
    href: "/admin/rooftop-reports",
    icon: "shield",
  },
  {
    title: "Notable Projects",
    description: "Submitted notable installations with photos and brief writeups from external reps.",
    badge: "Analytics",
    href: "/admin/notable-projects",
    icon: "camera",
  },
  {
    title: "Knowledge",
    description: "Curate Copilot knowledge sources, corrections, and indexed content.",
    badge: "Content",
    href: "/admin/knowledge",
    icon: "book",
  },
  {
    title: "Asset Reviews",
    description: "Approve or reject photos submitted by internal reps for solution tackle boxes.",
    badge: "Content",
    href: "/admin/asset-reviews",
    icon: "image",
  },
];

const BADGE_STYLE: Record<AdminCard["badge"], string> = {
  Analytics: "bg-[var(--anchor-mint)]/60 text-[var(--anchor-deep)]",
  Config: "bg-[#fde68a] text-[#7c4a00]",
  Content: "bg-[#dbeafe] text-[#1e3a8a]",
};

function TileIcon({ name, className }: { name: IconName; className?: string }) {
  const props = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.75,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className,
    "aria-hidden": true,
  };
  switch (name) {
    case "users":
      return (
        <svg {...props}>
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
      );
    case "chart":
      return (
        <svg {...props}>
          <line x1="18" y1="20" x2="18" y2="10" />
          <line x1="12" y1="20" x2="12" y2="4" />
          <line x1="6" y1="20" x2="6" y2="14" />
          <line x1="3" y1="20" x2="21" y2="20" />
        </svg>
      );
    case "phone":
      return (
        <svg {...props}>
          <path d="M22 16.92V21a1 1 0 0 1-1.11 1A19.86 19.86 0 0 1 2 4.11 1 1 0 0 1 3 3h4.09a1 1 0 0 1 1 .75l1 4a1 1 0 0 1-.27 1L7.21 10.21a16 16 0 0 0 6.58 6.58l1.46-1.61a1 1 0 0 1 1-.27l4 1a1 1 0 0 1 .75 1z" />
        </svg>
      );
    case "clipboard":
      return (
        <svg {...props}>
          <rect x="8" y="2" width="8" height="4" rx="1" />
          <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
          <line x1="9" y1="12" x2="15" y2="12" />
          <line x1="9" y1="16" x2="13" y2="16" />
        </svg>
      );
    case "wallet":
      return (
        <svg {...props}>
          <path d="M20 12V8H4a2 2 0 0 1 0-4h14v4" />
          <rect x="2" y="6" width="20" height="14" rx="2" />
          <circle cx="16" cy="13" r="1.5" />
        </svg>
      );
    case "shield":
      return (
        <svg {...props}>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
      );
    case "camera":
      return (
        <svg {...props}>
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
          <circle cx="12" cy="13" r="4" />
        </svg>
      );
    case "book":
      return (
        <svg {...props}>
          <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
          <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
        </svg>
      );
    case "image":
      return (
        <svg {...props}>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="9" cy="9" r="2" />
          <path d="M21 15l-5-5L5 21" />
        </svg>
      );
    case "mail":
      return (
        <svg {...props}>
          <path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
          <polyline points="22 6 12 13 2 6" />
        </svg>
      );
    case "briefcase":
      return (
        <svg {...props}>
          <rect x="2" y="7" width="20" height="14" rx="2" />
          <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
        </svg>
      );
    case "grid":
      return (
        <svg {...props}>
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      );
  }
}

export default function AdminHubPage() {
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const { t } = useTranslation();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!alive) return;
      if (!data.user) { router.replace("/"); return; }

      const { data: prof } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.user.id)
        .maybeSingle();

      const role = String((prof as { role?: string } | null)?.role || "");
      if (role !== "admin") {
        setError("Admin access only.");
        setReady(true);
        return;
      }
      setReady(true);
    })();
    return () => { alive = false; };
  }, [router, supabase]);

  return (
    <main className="ds-page">
      <AppNavbar
        title="Admin Console"
        subtitle="Internal management"
        menuItems={[{ label: t("dashboard"), href: "/dashboard" }]}
      />

      <div className="ds-container py-6 pb-[calc(2rem+env(safe-area-inset-bottom))] sm:py-10">
        {!ready ? (
          <Card className="p-5 text-sm text-black/60">{t("loading")}</Card>
        ) : error ? (
          <Card className="border-[var(--anchor-deep)]/25 bg-[var(--anchor-mint)] p-5 text-sm text-[var(--anchor-deep)]">
            {error}
          </Card>
        ) : (
          <div className="grid grid-cols-2 gap-3 [grid-auto-flow:dense] sm:gap-4 md:gap-5 lg:grid-cols-4">
            {CARDS.map((card, i) => (
              <BentoTile key={card.title} card={card} index={i} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function BentoTile({ card, index }: { card: AdminCard; index: number }) {
  const isLink = !card.comingSoon && !!card.href;
  // Featured tile always spans 2 cols. Regular tiles get a varied pattern at
  // both mobile (2-col grid) and lg (4-col grid) so the gallery has rhythm at
  // every viewport size.
  let span = "";
  if (card.featured) {
    span = "col-span-2 lg:col-span-2";
  } else {
    // Mobile: every 4th tile spans 2 cols (full width), so the rhythm reads as
    // [1,1,1,2,1,1,1,2,…]. lg+: independent pattern across 4 cols.
    const mobileSpan = index % 4 === 3 ? "col-span-2" : "col-span-1";
    const lgPattern = ["lg:col-span-2", "lg:col-span-1", "lg:col-span-1", "lg:col-span-2", "lg:col-span-1"];
    span = `${mobileSpan} ${lgPattern[index % lgPattern.length]}`;
  }
  const inner = card.featured ? <FeaturedTileInner card={card} /> : <RegularTileInner card={card} />;

  const wrap = `group ${span} ${isLink ? "transition-transform duration-200 hover:-translate-y-0.5" : "cursor-default opacity-80"}`;

  if (isLink) {
    return (
      <Link href={card.href!} className={wrap}>
        {inner}
      </Link>
    );
  }
  return <div className={wrap}>{inner}</div>;
}

function FeaturedTileInner({ card }: { card: AdminCard }) {
  return (
    <div className="relative flex h-full flex-col overflow-hidden rounded-2xl bg-gradient-to-br from-[var(--anchor-deep)] to-[#1d6b4a] p-5 text-white shadow-md transition-all duration-200 group-hover:brightness-110 group-hover:shadow-xl sm:p-6 lg:p-8">
      {/* Subtle decorative icon */}
      <TileIcon
        name={card.icon}
        className="pointer-events-none absolute -right-6 -top-6 h-40 w-40 text-white/10"
      />

      <div className="relative flex items-center justify-between">
        <span className="inline-flex items-center justify-center rounded-xl bg-white/15 p-3">
          <TileIcon name={card.icon} className="h-7 w-7 text-white" />
        </span>
        <span className={`ds-badge !rounded-full bg-white/15 text-white`}>
          {card.badge}
        </span>
      </div>

      <div className="relative mt-5 flex-1">
        <h3 className="text-2xl font-bold tracking-tight sm:text-3xl">{card.title}</h3>
        <p className="mt-2 max-w-md text-sm text-white/85 sm:text-base">
          {card.description}
        </p>
      </div>

      <div className="relative mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-white">
        {card.comingSoon ? "Coming soon" : "Open"}
        <span className="inline-block transition group-hover:translate-x-1">→</span>
      </div>
    </div>
  );
}

function RegularTileInner({ card }: { card: AdminCard }) {
  return (
    <Card className="flex h-full flex-col p-4 transition-all duration-200 group-hover:border-[var(--anchor-green)] group-hover:bg-[var(--anchor-mint)]/30 group-hover:shadow-md sm:p-5 lg:p-6">
      <div className="flex items-start justify-between gap-3">
        <span className="inline-flex items-center justify-center rounded-xl bg-[var(--anchor-mint)]/40 p-2.5 text-[var(--anchor-deep)]">
          <TileIcon name={card.icon} className="h-5 w-5" />
        </span>
        <span className={`ds-badge !rounded-full ${BADGE_STYLE[card.badge]}`}>
          {card.badge}
        </span>
      </div>

      <div className="mt-4 flex-1">
        <h3 className="text-base font-bold text-[var(--anchor-deep)] sm:text-lg">{card.title}</h3>
        <p className="mt-1 text-sm text-[var(--anchor-gray)]">{card.description}</p>
      </div>

      <div
        className={`mt-4 inline-flex items-center gap-1.5 text-sm font-semibold ${
          card.comingSoon ? "text-[var(--anchor-gray)]" : "text-[var(--anchor-green)]"
        }`}
      >
        {card.comingSoon ? "Coming soon" : "Open"}
        <span className="inline-block transition group-hover:translate-x-1">→</span>
      </div>
    </Card>
  );
}
