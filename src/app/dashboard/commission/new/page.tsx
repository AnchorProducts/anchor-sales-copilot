"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { useEffectiveRole } from "@/lib/role/viewAs";
import CommissionForm from "@/app/components/commission/CommissionForm";
import { ToolLoader } from "@/app/components/visuals/FeatureGraphic";
import { useTranslation } from "@/lib/i18n/useTranslation";

export const dynamic = "force-dynamic";

export default function CommissionClaimPage() {
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [actualRole, setActualRole] = useState<string | null>(null);
  const [anchorCommission, setAnchorCommission] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!alive) return;
      if (!data.user) {
        router.replace("/");
        return;
      }
      const { data: prof } = await supabase
        .from("profiles")
        .select("role,anchor_commission")
        .eq("id", data.user.id)
        .maybeSingle();
      if (!alive) return;
      const p = prof as { role?: string; anchor_commission?: boolean } | null;
      setActualRole(String(p?.role || ""));
      setAnchorCommission(p?.anchor_commission === true);
      setLoaded(true);
    })();
    return () => { alive = false; };
  }, [router, supabase]);

  // Commission claims are for EXTERNAL reps only. Admins can't open it in admin
  // view — they must "View app as" external (which bypasses the per-user
  // anchor_commission flag for preview). Real external reps still need the flag
  // (toggled from /admin/users). This matches the API gate in
  // /api/admin/sales-reps (canClaim), which only allows external_rep.
  const effectiveRole = useEffectiveRole(actualRole);
  const allowed =
    effectiveRole === "external_rep" &&
    (anchorCommission || actualRole === "admin");

  useEffect(() => {
    if (loaded && !allowed) router.replace("/dashboard");
  }, [loaded, allowed, router]);

  const ready = loaded && allowed;
  const { t } = useTranslation();
  return (
    <main className="ds-page">

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
