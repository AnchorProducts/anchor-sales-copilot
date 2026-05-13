"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import LeadForm from "@/app/components/leads/LeadForm";
import { Card } from "@/app/components/ui/Card";
import { AppNavbar } from "@/app/components/ui/AppNavbar";
import { useTranslation } from "@/lib/i18n/useTranslation";

export const dynamic = "force-dynamic";

export default function NewLeadPage() {
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

      // Consult form is for external reps only. Internal users go to the
      // triage page (they review submissions; they don't submit them).
      const { data: prof } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.user.id)
        .maybeSingle();
      if (!alive) return;

      const role = String((prof as { role?: string } | null)?.role || "");
      if (role === "admin" || role === "anchor_rep") {
        router.replace("/dashboard/opportunities");
        return;
      }

      setReady(true);
    })();

    return () => {
      alive = false;
    };
  }, [router, supabase]);

  const { t } = useTranslation();
  return (
    <main className="ds-page">
      <AppNavbar
        title={t("projectIdentifier")}
        subtitle={t("externalContractors")}
        menuItems={[{ label: t("dashboard"), href: "/dashboard" }]}
      />

      <div className="mx-auto max-w-5xl px-5 py-6">
        <Card className="mb-4 border-t-4 border-t-[var(--anchor-green)] p-6">
          <div className="ds-caption">{t("leadIntake")}</div>
          <h1 className="mt-2 text-2xl">{t("projectIdentifier")}</h1>
          <p className="mt-1 text-sm text-[var(--anchor-gray)]">{t("shareProjectReqs")}</p>
        </Card>
        {!ready ? (
          <Card className="p-5 text-sm text-black/60">{t("loading")}</Card>
        ) : (
          <LeadForm />
        )}
      </div>
    </main>
  );
}
