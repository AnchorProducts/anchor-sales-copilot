"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { AppNavbar } from "@/app/components/ui/AppNavbar";
import { Card } from "@/app/components/ui/Card";
import { useTranslation } from "@/lib/i18n/useTranslation";
import LeadDetail from "@/app/components/leads/LeadDetail";

export const dynamic = "force-dynamic";

function isInternalRole(role: string) {
  return role === "admin" || role === "anchor_rep";
}

export default function LeadDetailPage() {
  const params = useParams();
  const id = String(params?.id || "");
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

      if (!data.user) {
        router.replace("/");
        return;
      }

      const { data: prof } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.user.id)
        .maybeSingle();

      if (!alive) return;

      const role = String((prof as { role?: string } | null)?.role || "");
      if (!isInternalRole(role)) {
        setError("Internal access only.");
        setReady(true);
        return;
      }

      setReady(true);
    })();

    return () => {
      alive = false;
    };
  }, [router, supabase]);

  return (
    <main className="ds-page">
      <AppNavbar
        title="Opportunity detail"
        subtitle="Internal management"
        menuItems={[
          { label: "Consult Queue", href: "/dashboard/opportunities" },
          { label: t("dashboard"), href: "/dashboard" },
        ]}
      />

      <div className="ds-container py-6 pb-[calc(3rem+env(safe-area-inset-bottom))] sm:py-10">
        {!ready ? (
          <Card className="p-5 text-sm text-[var(--anchor-gray)]">{t("loading")}</Card>
        ) : error ? (
          <Card className="border-red-200 bg-red-50 p-5 text-sm text-red-700">{error}</Card>
        ) : (
          <LeadDetail id={id} />
        )}
      </div>
    </main>
  );
}
