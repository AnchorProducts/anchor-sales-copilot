// src/app/dashboard/page.tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { Card } from "@/app/components/ui/Card";
import { AppNavbar } from "@/app/components/ui/AppNavbar";
import { useTranslation } from "@/lib/i18n/useTranslation";

type SalesRepLite = {
  outside_sales_name: string | null;
  outside_sales_email: string | null;
  phone: string | null;
  teams_link: string | null;
};

export const dynamic = "force-dynamic";


export default function DashboardPage() {
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);

  const [booting, setBooting] = useState(true);
  const [role, setRole] = useState<string | null>(null);
  const [roleReady, setRoleReady] = useState(false);
  const [serviceState, setServiceState] = useState<string>("");
  const [salesRep, setSalesRep] = useState<SalesRepLite | null>(null);



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

        // Force cookie sync for server routes (doc-open / recent-docs)
        const syncRes = await fetch("/api/auth/sync", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            access_token: s.access_token,
            refresh_token: s.refresh_token,
          }),
          cache: "no-store",
        });

        // Not fatal, but useful when debugging
        if (!syncRes.ok) {
          const j = await syncRes.json().catch(() => null);
          console.warn("auth sync failed", syncRes.status, j);
        }
      } finally {
        if (!alive) return;
        setBooting(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [router, supabase]);


  // --- Role check (external vs internal)
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
        .select("role,user_type,email,service_state")
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
          .select("role,user_type,email,service_state")
          .single();

        prof = created ?? null;
      }

      if (!alive) return;
      setRole(String((prof as any)?.role || ""));
      setServiceState(String((prof as any)?.service_state || ""));
      setRoleReady(true);
    })();

    return () => {
      alive = false;
    };
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

  const isInternal = role === "admin" || role === "anchor_rep";
  const { t } = useTranslation();

  return (
    <main className="ds-page">
      <AppNavbar
        title="Anchor Sales Co-Pilot"
        subtitle="Dashboard"
        menuItems={[]}
        hero={
          <div className="flex flex-col gap-1 text-left">
            <h1 className="text-2xl text-white! sm:text-3xl">{t("welcomeBack")}</h1>
            <p className="max-w-2xl text-sm text-white/80">{t("dashboardSubtitle")}</p>
          </div>
        }
      />

      <div className="ds-container py-6 pb-[calc(2rem+env(safe-area-inset-bottom))] sm:py-10">
        {/* Quick actions */}
        <div className="mb-4 flex flex-wrap items-center gap-2 sm:mb-8">
          <span className="ds-badge">
            {isInternal ? "Internal tools" : "External tools"}
          </span>
          
        </div>

        {/* Primary cards */}
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          <Link href="/chat" className="group transition-transform duration-200 hover:-translate-y-0.5">
            <Card className="h-full border-t-4 border-t-[var(--anchor-green)] p-5 transition-shadow duration-200 hover:shadow-lg sm:p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold">Chat Copilot</div>
                  <div className="mt-1 text-sm text-[var(--anchor-gray)]">Get solution recommendations and practical next steps.</div>
                </div>
                <span className="ds-badge">AI</span>
              </div>
              <div className="mt-5">
                <div className="text-sm font-semibold text-[var(--anchor-green)]">
                  {t("openCopilot")} <span className="inline-block transition group-hover:translate-x-1">→</span>
                </div>
              </div>
            </Card>
          </Link>

          <Link href="/assets" className="group transition-transform duration-200 hover:-translate-y-0.5">
            <Card className="h-full border-t-4 border-t-[var(--anchor-green)] p-5 transition-shadow duration-200 hover:shadow-lg sm:p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold">{t("assetManagement")}</div>
                  <div className="mt-1 text-sm text-[var(--anchor-gray)]">{t("assetManagementDesc")}</div>
                </div>
                <span className="ds-badge">Library</span>
              </div>
              <div className="mt-5">
                <div className="text-sm font-semibold text-[var(--anchor-green)]">
                  {t("viewAssets")} <span className="inline-block transition group-hover:translate-x-1">→</span>
                </div>
              </div>
            </Card>
          </Link>

          <Link href="/rooftop" className="group transition-transform duration-200 hover:-translate-y-0.5">
            <Card className="h-full border-t-4 border-t-[var(--anchor-green)] p-5 transition-shadow duration-200 hover:shadow-lg sm:p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold">{t("rooftopAudit")}</div>
                  <div className="mt-1 text-sm text-[var(--anchor-gray)]">{t("rooftopAuditDesc")}</div>
                </div>
                <span className="ds-badge">Safety</span>
              </div>
              <div className="mt-5">
                <div className="text-sm font-semibold text-[var(--anchor-green)]">
                  {t("startAssessment")} <span className="inline-block transition group-hover:translate-x-1">→</span>
                </div>
              </div>
            </Card>
          </Link>

          {roleReady && role === "external_rep" && (() => {
            const repName = salesRep?.outside_sales_name || "";
            const teamsLink = salesRep?.teams_link || "";
            const ready = !!serviceState && !!salesRep && !!teamsLink;
            const assignment = salesRep;

            const subtitle = !serviceState
              ? t("talkToSalesNoState")
              : !assignment
                ? t("talkToSalesNoRep")
                : !teamsLink
                  ? t("talkToSalesNoLink")
                  : `${t("talkToSalesWith")} ${repName}`;

            const Card_ = (
              <Card className="h-full border-t-4 border-t-[var(--anchor-green)] p-5 transition-shadow duration-200 hover:shadow-lg sm:p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold">{t("talkToSales")}</div>
                    <div className="mt-1 text-sm text-[var(--anchor-gray)]">{subtitle}</div>
                  </div>
                  <span className="ds-badge">Sales</span>
                </div>
                <div className="mt-5">
                  <div className={`text-sm font-semibold ${ready ? "text-[var(--anchor-green)]" : "text-[var(--anchor-gray)]"}`}>
                    {ready ? t("startTeamsCall") : t("setupRequired")} <span className="inline-block transition group-hover:translate-x-1">→</span>
                  </div>
                </div>
              </Card>
            );

            return ready ? (
              <a
                href={teamsLink}
                target="_blank"
                rel="noopener noreferrer"
                className="group transition-transform duration-200 hover:-translate-y-0.5"
              >
                {Card_}
              </a>
            ) : (
              <Link href="/dashboard/settings" className="group transition-transform duration-200 hover:-translate-y-0.5">
                {Card_}
              </Link>
            );
          })()}

          {roleReady && role === "external_rep" && (
            <Link href="/dashboard/opportunities/new" className="group transition-transform duration-200 hover:-translate-y-0.5">
              <Card className="h-full border-t-4 border-t-[var(--anchor-green)] p-5 transition-shadow duration-200 hover:shadow-lg sm:p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold">{t("projectIdentifier")}</div>
                    <div className="mt-1 text-sm text-[var(--anchor-gray)]">{t("projectIdentifierDesc")}</div>
                  </div>
                  <span className="ds-badge">Projects</span>
                </div>
                <div className="mt-5">
                  <div className="text-sm font-semibold text-[var(--anchor-green)]">
                    {t("submitProject")} <span className="inline-block transition group-hover:translate-x-1">→</span>
                  </div>
                </div>
              </Card>
            </Link>
          )}

          {roleReady && role === "external_rep" && (
            <Link href="/dashboard/commission/new" className="group transition-transform duration-200 hover:-translate-y-0.5">
              <Card className="h-full border-t-4 border-t-[var(--anchor-green)] p-5 transition-shadow duration-200 hover:shadow-lg sm:p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold">{t("commissionClaim")}</div>
                    <div className="mt-1 text-sm text-[var(--anchor-gray)]">{t("commissionClaimDesc")}</div>
                  </div>
                  <span className="ds-badge">Commission</span>
                </div>
                <div className="mt-5">
                  <div className="text-sm font-semibold text-[var(--anchor-green)]">
                    {t("submitClaim")} <span className="inline-block transition group-hover:translate-x-1">→</span>
                  </div>
                </div>
              </Card>
            </Link>
          )}

          {roleReady && role === "admin" && (
            <Link href="/admin" className="group transition-transform duration-200 hover:-translate-y-0.5">
              <Card className="h-full border-t-4 border-t-[var(--anchor-green)] p-5 transition-shadow duration-200 hover:shadow-lg sm:p-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold">Admin Console</div>
                    <div className="mt-1 text-sm text-[var(--anchor-gray)]">Configure sales reps, view user activity, projects, claims, and assessments.</div>
                  </div>
                  <span className="ds-badge">Admin</span>
                </div>
                <div className="mt-5">
                  <div className="text-sm font-semibold text-[var(--anchor-green)]">
                    Open Admin <span className="inline-block transition group-hover:translate-x-1">→</span>
                  </div>
                </div>
              </Card>
            </Link>
          )}

        </div>

      </div>
    </main>
  );
}
