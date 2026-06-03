"use client";

import NotableProjectForm from "@/app/components/notable-projects/NotableProjectForm";
import { Card } from "@/app/components/ui/Card";
import { ToolLoader } from "@/app/components/visuals/FeatureGraphic";
import { AppNavbar } from "@/app/components/ui/AppNavbar";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { useFormAccess } from "@/lib/role/useFormAccess";

export const dynamic = "force-dynamic";

export default function NewNotableProjectPage() {
  // Internal or external sales may submit; admins must "View app as" a sales
  // role to preview (admin-view is blocked).
  const { ready } = useFormAccess("sales");

  const { t } = useTranslation();
  return (
    <main className="ds-page">
      <AppNavbar
        title={t("notableProject")}
        subtitle={t("externalContractors")}
        menuItems={[{ label: t("dashboard"), href: "/dashboard" }]}
      />

      <div className="mx-auto max-w-5xl px-5 py-6">
        <Card data-tutorial="notable-intro" className="mb-4 border-t-4 border-t-[var(--anchor-green)] p-6">
          <div className="ds-caption">{t("notableProject")}</div>
          <h1 className="mt-2 text-2xl">{t("notableProjectTitle")}</h1>
          <p className="mt-1 text-sm text-[var(--anchor-gray)]">{t("notableProjectFormDesc")}</p>
        </Card>
        {!ready ? (
          <ToolLoader feature="notable" label={t("loading")} />
        ) : (
          <NotableProjectForm />
        )}
      </div>
    </main>
  );
}
