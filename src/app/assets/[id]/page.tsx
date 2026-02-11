// src/app/assets/[id]/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import ProductTackleBox from "../../components/assets/ProductTackleBox";

export const dynamic = "force-dynamic";

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

export default function ProductAssetsPage() {
  const router = useRouter();
  const params = useParams(); // ✅ Next 16-safe
  const supabase = useMemo(() => supabaseBrowser(), []);

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
    <main className="min-h-dvh bg-[#F6F7F8] text-black">
      <header className="sticky top-0 z-30 bg-[#047835] pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-5 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <img src="/anchorp.svg" alt="Anchor Products" className="ds-logo shrink-0" />

            <div className="leading-tight min-w-0">
              <div className="text-sm font-semibold tracking-wide truncate text-white">
                Product Tackle Box
              </div>
              <div className="text-[12px] text-white/80 truncate">
                Sales sheets • installs • pictures • pricebook • test reports
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Link
              href="/assets"
              className="h-9 inline-flex items-center rounded-md border border-white/20 bg-white/10 px-3 text-[12px] font-semibold text-white hover:bg-white/15 transition"
            >
              Assets
            </Link>
            <Link
              href="/dashboard"
              className="h-9 inline-flex items-center rounded-md border border-white/20 bg-white/10 px-3 text-[12px] font-semibold text-white hover:bg-white/15 transition"
            >
              Dashboard
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-5 py-6">
        {/* If productId is invalid, this will render briefly before redirect.
            That's fine for MVP. */}
        <ProductTackleBox productId={productId} />
      </div>
    </main>
  );
}
