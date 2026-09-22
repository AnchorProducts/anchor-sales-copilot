"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import MarketingStore from "@/app/components/marketing/MarketingStore";
import MarketingOrderHistory from "@/app/components/marketing/MarketingOrderHistory";
import { Segmented, Surface } from "@/app/components/ui/kit";
import { Alert } from "@/app/components/ui/Alert";
import { AppNavbar } from "@/app/components/ui/AppNavbar";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { useFormAccess } from "@/lib/role/useFormAccess";

export const dynamic = "force-dynamic";

type Tab = "new" | "orders";

// useSearchParams needs a Suspense boundary to build.
export default function MarketingOrdersPage() {
  return (
    <Suspense fallback={null}>
      <MarketingOrders />
    </Suspense>
  );
}

function MarketingOrders() {
  // Internal or external sales may order; admins must "View app as" a sales
  // role to preview (admin-view is blocked).
  const { ready, effectiveRole } = useFormAccess("sales");
  // OEM orders and tradeshow loans are internal sales jobs; outside reps shop
  // customer orders only.
  const internal = effectiveRole === "anchor_rep";
  // Deep link: ?tab=orders opens the history.
  const params = useSearchParams();
  const [tab, setTab] = useState<Tab>(params.get("tab") === "orders" ? "orders" : "new");
  const [refreshKey, setRefreshKey] = useState(0);
  const [flash, setFlash] = useState<string | null>(null);
  const { t } = useTranslation();

  function submitted(message: string) {
    setRefreshKey((k) => k + 1);
    setFlash(message);
    setTab("orders");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  return (
    <main className="ds-page">
      <AppNavbar
        title="Marketing Orders"
        subtitle="Pizza boxes, swag, printables & tradeshow gear"
        menuItems={[{ label: t("dashboard"), href: "/dashboard" }]}
      />

      {/* Wider than the app default: the store runs a catalog beside a cart.
          .mo-apple scopes the Apple-style type and fields to this page. */}
      <div className="mo-apple mx-auto max-w-6xl px-5 py-6">
        <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <h1 className="text-[34px] font-bold leading-tight tracking-[-0.035em] text-black">Marketing Orders</h1>
            <p data-tutorial="marketing-orders-intro" className="mt-1 max-w-xl text-[15px] text-[var(--anchor-gray)]">
              Add what you need to your cart, then check out and tell us where it ships.
            </p>
          </div>
          <Segmented
            ariaLabel="Marketing orders view"
            value={tab}
            onChange={(key) => {
              setTab(key);
              if (key === "new") setFlash(null);
            }}
            options={[
              { value: "new" as Tab, label: "Shop" },
              { value: "orders" as Tab, label: "My Orders" },
            ]}
          />
        </header>

        {!ready ? (
          <Surface className="p-6 text-[14px] text-[var(--anchor-gray)]">{t("loading")}</Surface>
        ) : (
          <>
            {/* Both panels stay mounted, so peeking at your orders mid-shop
                doesn't empty the cart. */}
            <div hidden={tab !== "orders"}>
              {flash && (
                <div className="mb-4">
                  <Alert tone="success">{flash}</Alert>
                </div>
              )}
              <MarketingOrderHistory refreshKey={refreshKey} showType={internal} />
            </div>
            <div hidden={tab !== "new"}>
              <MarketingStore canOrderOem={internal} canBorrow={internal} onSubmitted={submitted} />
            </div>
          </>
        )}
      </div>
    </main>
  );
}
