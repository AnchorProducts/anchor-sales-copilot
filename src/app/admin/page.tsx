"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { AppNavbar } from "@/app/components/ui/AppNavbar";
import { Card } from "@/app/components/ui/Card";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { ToolLoader } from "@/app/components/visuals/FeatureGraphic";
import { CARDS, BADGE_STYLE, TileIcon, type AdminCard } from "./cards";

export const dynamic = "force-dynamic";

export default function AdminHubPage() {
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const { t } = useTranslation();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Keys an admin has switched off in /admin/tools. A tool with no row is
  // active, so we only track the deactivated set and hide those tiles.
  const [hiddenKeys, setHiddenKeys] = useState<Set<string>>(new Set());

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

      const { data: tools } = await supabase
        .from("admin_tools")
        .select("key,active")
        .eq("active", false);
      if (!alive) return;
      setHiddenKeys(new Set((tools || []).map((r: { key: string }) => r.key)));
      setReady(true);
    })();
    return () => { alive = false; };
  }, [router, supabase]);

  const visibleCards = useMemo(
    () => CARDS.filter((c) => !hiddenKeys.has(c.key)),
    [hiddenKeys]
  );

  return (
    <main className="ds-page">
      <AppNavbar
        title="Admin Console"
        subtitle="Internal management"
        menuItems={[{ label: t("dashboard"), href: "/dashboard" }]}
      />

      <div className="ds-container py-6 pb-[calc(2rem+env(safe-area-inset-bottom))] sm:py-10">
        {!ready ? (
          <ToolLoader feature="admin" label={t("loading")} />
        ) : error ? (
          <Card className="border-[var(--anchor-deep)]/25 bg-[var(--anchor-mint)] p-5 text-sm text-[var(--anchor-deep)]">
            {error}
          </Card>
        ) : (
          <>
            <div className="mb-4 flex items-center justify-end sm:mb-5">
              <Link
                href="/admin/tools"
                className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--anchor-deep)]/20 bg-white px-3 py-1.5 text-sm font-semibold text-[var(--anchor-deep)] transition hover:bg-[var(--anchor-mint)]/40"
              >
                <TileIcon name="grid" className="h-4 w-4" />
                Manage tools
              </Link>
            </div>
            <div data-tutorial="admin-grid" className="grid grid-cols-2 gap-3 [grid-auto-flow:dense] sm:gap-4 md:gap-5 lg:grid-cols-4">
              {visibleCards.map((card, i) => (
                <BentoTile key={card.key} card={card} index={i} />
              ))}
            </div>
          </>
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
  // Stable per-tile hook so the admin walkthrough can spotlight each tool.
  const tutorialId = "admin-tile-" + card.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  if (isLink) {
    return (
      <Link href={card.href!} data-tutorial={tutorialId} className={wrap}>
        {inner}
      </Link>
    );
  }
  return <div data-tutorial={tutorialId} className={wrap}>{inner}</div>;
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
