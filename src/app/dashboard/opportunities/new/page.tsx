"use client";

import LeadForm from "@/app/components/leads/LeadForm";
import { Card } from "@/app/components/ui/Card";
import { ToolLoader } from "@/app/components/visuals/FeatureGraphic";
import { AppNavbar } from "@/app/components/ui/AppNavbar";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { useFormAccess } from "@/lib/role/useFormAccess";

export const dynamic = "force-dynamic";

export default function NewLeadPage() {
  // REC / project identifier is open to internal and external sales. Admins
  // must "View app as" a sales role to open it (admin view -> the queue).
  const { ready } = useFormAccess("sales", "/dashboard/opportunities");

  const { t } = useTranslation();
  return (
    <main className="ds-page">
      <AppNavbar
        title={t("projectIdentifier")}
        subtitle={t("externalContractors")}
        menuItems={[{ label: t("dashboard"), href: "/dashboard" }]}
      />

      <div className="mx-auto max-w-5xl px-5 py-6">
        <Card data-tutorial="consult-intro" className="mb-4 border-t-4 border-t-[var(--anchor-green)] p-6">
          <div className="ds-caption">{t("leadIntake")}</div>
          <h1 className="mt-2 text-2xl">{t("projectIdentifier")}</h1>
          <p className="mt-1 text-sm text-[var(--anchor-gray)]">
            Share project opportunities, contacts to follow up with, notes and photos and an Anchor Products representative will handle the rest. Next steps, sit back while a team of rooftop equipment experts increase your commissions, customer satisfaction and ensures your customers are secure during the storms ahead.
          </p>
        </Card>
        {!ready ? (
          <ToolLoader feature="consults" label={t("loading")} />
        ) : (
          <LeadForm />
        )}
      </div>
    </main>
  );
}
