"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { AppNavbar } from "@/app/components/ui/AppNavbar";
import { Card } from "@/app/components/ui/Card";
import { useTranslation } from "@/lib/i18n/useTranslation";

export const dynamic = "force-dynamic";

type AdminCard = {
  title: string;
  description: string;
  badge: string;
  href?: string;
  comingSoon?: boolean;
};

const CARDS: AdminCard[] = [
  {
    title: "Users",
    description: "Edit names, emails, phone numbers, and roles for every user (external, internal, admin).",
    badge: "Config",
    href: "/admin/users",
  },
  {
    title: "Analytics",
    description: "One-stop dashboard for internal, external, and manufacturer user activity. Download summary or per-user PDFs.",
    badge: "Analytics",
    href: "/admin/analytics",
  },
  {
    title: "Sales Reps",
    description: "Configure inside/outside sales reps, regions, Teams links, and contact info.",
    badge: "Config",
    href: "/admin/sales-reps",
  },
  {
    title: "Projects",
    description: "All submitted opportunities across users and regions.",
    badge: "Analytics",
    href: "/dashboard/opportunities",
  },
  {
    title: "Commission Claims",
    description: "Submitted commission claims and approval status.",
    badge: "Analytics",
    comingSoon: true,
  },
  {
    title: "Rooftop Reports",
    description: "All OSHA-guided rooftop equipment audit submissions, with PDFs and flag counts.",
    badge: "Analytics",
    href: "/admin/rooftop-reports",
  },
  {
    title: "Notable Projects",
    description: "Submitted notable installations with photos and brief writeups from external reps.",
    badge: "Analytics",
    href: "/admin/notable-projects",
  },
  {
    title: "Knowledge",
    description: "Curate Copilot knowledge sources, corrections, and indexed content.",
    badge: "Content",
    href: "/admin/knowledge",
  },
  {
    title: "Asset Reviews",
    description: "Approve or reject photos submitted by internal reps for solution tackle boxes.",
    badge: "Content",
    href: "/admin/asset-reviews",
  },
];

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

      const role = String((prof as any)?.role || "");
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
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {CARDS.map((card) => {
              const inner = (
                <Card className="h-full border-t-4 border-t-[var(--anchor-green)] p-5 transition-shadow duration-200 hover:shadow-lg sm:p-6">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-lg font-semibold">{card.title}</div>
                      <div className="mt-1 text-sm text-[var(--anchor-gray)]">{card.description}</div>
                    </div>
                    <span className="ds-badge">{card.badge}</span>
                  </div>
                  <div className="mt-5">
                    <div className={`text-sm font-semibold ${card.comingSoon ? "text-[var(--anchor-gray)]" : "text-[var(--anchor-green)]"}`}>
                      {card.comingSoon ? "Coming soon" : "Open"}{" "}
                      <span className="inline-block transition group-hover:translate-x-1">→</span>
                    </div>
                  </div>
                </Card>
              );

              if (card.comingSoon || !card.href) {
                return (
                  <div key={card.title} className="group cursor-default opacity-70">
                    {inner}
                  </div>
                );
              }
              return (
                <Link
                  key={card.title}
                  href={card.href}
                  className="group transition-transform duration-200 hover:-translate-y-0.5"
                >
                  {inner}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
