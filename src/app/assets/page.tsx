// src/app/assets/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import AssetsBrowser from "../components/assets/AssetsBrowser";
import { Card } from "@/app/components/ui/Card";
import { AppNavbar } from "@/app/components/ui/AppNavbar";
import { useTranslation } from "@/lib/i18n/useTranslation";

export const dynamic = "force-dynamic";

export default function AssetsPage() {
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
        title={t("assetManagement")}
        subtitle={t("tackleBoxSubtitle")}
        menuItems={[{ label: t("dashboard"), href: "/dashboard" }]}
      />

      <div className="mx-auto max-w-5xl px-5 py-6">
        <Card className="mb-4 border-t-4 border-t-[var(--anchor-green)] p-6">
          <div className="ds-caption">{t("assetLibrary")}</div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">{t("assetLibrary")}</h1>
          <p className="mt-1 text-sm text-[var(--anchor-gray)]">{t("browseSolutionsAnchors")}</p>
        </Card>

        {!ready ? (
          <Card className="p-5 text-sm text-black/60">{t("loading")}</Card>
        ) : (
          <AssetsBrowser />
        )}
      </div>
    </main>
  );
}
