"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import CommissionForm from "@/app/components/commission/CommissionForm";
import { Card } from "@/app/components/ui/Card";
import { ToolLoader } from "@/app/components/visuals/FeatureGraphic";
import { AppNavbar } from "@/app/components/ui/AppNavbar";
import { useTranslation } from "@/lib/i18n/useTranslation";

export const dynamic = "force-dynamic";

export default function CommissionClaimPage() {
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!alive) return;
      if (!data.user) {
        router.replace("/");
        return;
      }
      // Gate access: only admins, or external reps an admin has granted the
      // `anchor_commission` flag (toggled from /admin/users), may open the form.
      const { data: prof } = await supabase
        .from("profiles")
        .select("role,anchor_commission")
        .eq("id", data.user.id)
        .maybeSingle();
      if (!alive) return;
      const p = prof as { role?: string; anchor_commission?: boolean } | null;
      const allowed =
        p?.role === "admin" ||
        (p?.role === "external_rep" && p?.anchor_commission === true);
      if (!allowed) {
        router.replace("/dashboard");
        return;
      }
      setReady(true);
    })();
    return () => { alive = false; };
  }, [router, supabase]);

  const { t } = useTranslation();
  return (
    <main className="ds-page">
      <AppNavbar
        title={t("commissionClaim")}
        subtitle={t("independentRepresentative")}
        menuItems={[{ label: t("dashboard"), href: "/dashboard" }]}
      />

      <div className="mx-auto max-w-3xl px-4 py-6 pb-[calc(3rem+env(safe-area-inset-bottom))] sm:px-6 sm:py-10">
        <header data-tutorial="commission-intro" className="mb-5 sm:mb-6">
          <div className="text-[11px] font-semibold uppercase tracking-widest text-[var(--anchor-gray)]">
            {t("independentRepresentative")}
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-[var(--anchor-deep)] sm:text-3xl">
            {t("commissionClaimFormTitle")}
          </h1>
          <p className="mt-1 text-sm text-[var(--anchor-gray)]">{t("completeAndSubmit")}</p>
        </header>
        {!ready ? (
          <ToolLoader feature="commission" label={t("loading")} />
        ) : (
          <CommissionForm />
        )}
      </div>
    </main>
  );
}
