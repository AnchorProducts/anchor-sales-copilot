// src/app/assets/[id]/page.tsx
"use client";

import { useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { AppNavbar } from "@/app/components/ui/AppNavbar";
import { useTranslation } from "@/lib/i18n/useTranslation";
import ProductTackleBox from "../../components/assets/ProductTackleBox";

export const dynamic = "force-dynamic";

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

export default function ProductAssetsPage() {
  const router = useRouter();
  const params = useParams(); // ✅ Next 16-safe
  const supabase = useMemo(() => supabaseBrowser(), []);
  const { t } = useTranslation();

  const productId = String((params as any)?.id || "").trim();

  useEffect(() => {
    let alive = true;

    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!alive) return;

      if (!data.user) {
        router.replace("/");
        return;
      }

      if (!productId || productId === "undefined" || !isUuid(productId)) {
        router.replace("/assets");
        return;
      }
    })();

    return () => {
      alive = false;
    };
  }, [router, supabase, productId]);

  return (
    <main className="ds-page">
      <AppNavbar
        title={t("productTackleBoxTitle")}
        subtitle={t("productTackleBoxSubtitle")}
        menuItems={[{ label: t("assets"), href: "/assets" }]}
      />

      <div className="mx-auto max-w-5xl px-5 py-6">
        {/* If productId is invalid, this will render briefly before redirect.
            That's fine for MVP. */}
        <ProductTackleBox productId={productId} />
      </div>
    </main>
  );
}
