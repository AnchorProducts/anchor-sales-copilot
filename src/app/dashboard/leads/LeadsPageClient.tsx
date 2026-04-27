"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import LeadsTable from "@/app/components/leads/LeadsTable";
import { Card } from "@/app/components/ui/Card";
import { AppNavbar } from "@/app/components/ui/AppNavbar";
import { useTranslation } from "@/lib/i18n/useTranslation";

function isInternalRole(role: string) {
  return role === "admin" || role === "anchor_rep";
}

export default function LeadsPageClient() {
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        .select("role")
        .eq("id", data.user.id)
        .maybeSingle();

      const role = String((prof as any)?.role || "");
      if (!isInternalRole(role)) {
        setError("internalAccessOnly"); // resolved via t() in render
        setReady(true);
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
        title={t("leads")}
        subtitle={t("internalManagement")}
        menuItems={[{ label: t("dashboard"), href: "/dashboard" }]}
      />

      <div className="ds-container py-6">
        <Card className="mb-4 border-t-4 border-t-[var(--anchor-green)] p-6">
          <div className="ds-caption">{t("operations")}</div>
          <h1 className="mt-2 text-2xl">{t("leadQueue")}</h1>
          <p className="mt-1 text-sm text-[var(--anchor-gray)]">{t("leadQueueDesc")}</p>
        </Card>
        {!ready ? (
          <Card className="p-5 text-sm text-black/60">{t("loading")}</Card>
        ) : error ? (
          <Card className="border-[var(--anchor-deep)]/25 bg-[var(--anchor-mint)] p-5 text-sm text-[var(--anchor-deep)]">
            {t("internalAccessOnly")}
          </Card>
        ) : (
          <LeadsTable />
        )}
      </div>
    </main>
  );
}
