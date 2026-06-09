"use client";

import MarketingOrderForm from "@/app/components/marketing/MarketingOrderForm";
import { Card } from "@/app/components/ui/Card";
import { AppNavbar } from "@/app/components/ui/AppNavbar";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { useFormAccess } from "@/lib/role/useFormAccess";

export const dynamic = "force-dynamic";

export default function MarketingOrdersPage() {
  // Internal or external sales may submit; admins must "View app as" a sales
  // role to preview (admin-view is blocked).
  const { ready } = useFormAccess("sales");

  const { t } = useTranslation();
  return (
    <main className="ds-page">
      <AppNavbar
        title="Marketing Orders"
        subtitle="Order samples, brochures & swag"
        menuItems={[{ label: t("dashboard"), href: "/dashboard" }]}
      />

      <div className="mx-auto max-w-5xl px-5 py-6">
        <Card data-tutorial="marketing-orders-intro" className="mb-4 border-t-4 border-t-[var(--anchor-green)] p-6">
          <div className="ds-caption">Marketing Orders</div>
          <h1 className="mt-2 text-2xl">Order marketing collateral</h1>
          <p className="mt-1 text-sm text-[var(--anchor-gray)]">
            Request samples, brochures, swag, and other marketing materials. Each order is routed to
            the right marketing contact automatically.
          </p>
        </Card>
        {!ready ? (
          <Card className="p-5 text-sm text-black/60">{t("loading")}</Card>
        ) : (
          <MarketingOrderForm />
        )}
      </div>
    </main>
  );
}
