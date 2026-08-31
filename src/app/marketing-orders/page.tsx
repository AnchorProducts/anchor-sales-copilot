"use client";

import { useState } from "react";
import MarketingOrderForm from "@/app/components/marketing/MarketingOrderForm";
import MarketingOrderHistory from "@/app/components/marketing/MarketingOrderHistory";
import { Card } from "@/app/components/ui/Card";
import { AppNavbar } from "@/app/components/ui/AppNavbar";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { useFormAccess } from "@/lib/role/useFormAccess";

export const dynamic = "force-dynamic";

export default function MarketingOrdersPage() {
  // Internal or external sales may submit; admins must "View app as" a sales
  // role to preview (admin-view is blocked).
  const { ready } = useFormAccess("sales");
  const [refreshKey, setRefreshKey] = useState(0);

  const { t } = useTranslation();
  return (
    <main className="ds-page">
      <AppNavbar
        title="Marketing Orders"
        subtitle="Order samples, printables & swag"
        menuItems={[{ label: t("dashboard"), href: "/dashboard" }]}
      />

      {/* Wider than the app default: the form runs a catalog grid beside a
          summary rail, and 5xl squeezes both. */}
      <div className="mx-auto max-w-6xl px-5 py-6">
        {/* The navbar above already says what page this is, so this line adds
            only the thing it doesn't — where an order ends up. */}
        <p data-tutorial="marketing-orders-intro" className="mb-4 text-sm text-[var(--anchor-gray)]">
          Request samples, printables, swag and other marketing materials. Each order is routed to the
          right marketing contact automatically.
        </p>
        {!ready ? (
          <Card className="p-5 text-sm text-black/60">{t("loading")}</Card>
        ) : (
          <>
            <MarketingOrderForm onSubmitted={() => setRefreshKey((k) => k + 1)} />
            <MarketingOrderHistory refreshKey={refreshKey} />
          </>
        )}
      </div>
    </main>
  );
}
