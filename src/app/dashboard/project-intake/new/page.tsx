"use client";

import Link from "next/link";
import FMIntakeForm from "@/app/components/fm-intake/FMIntakeForm";
import { Card } from "@/app/components/ui/Card";
import { ToolLoader } from "@/app/components/visuals/FeatureGraphic";
import { AppNavbar } from "@/app/components/ui/AppNavbar";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { useFormAccess } from "@/lib/role/useFormAccess";

export const dynamic = "force-dynamic";

export default function ProjectIntakePage() {
  // Project Intake / quote request is open to internal and external sales — the
  // same audience as the REC form. Admins must "View app as" a sales role.
  const { ready } = useFormAccess("sales", "/dashboard");

  const { t } = useTranslation();
  return (
    <main className="ds-page">
      <AppNavbar
        title="Project Intake"
        subtitle="Request a quote"
        menuItems={[{ label: t("dashboard"), href: "/dashboard" }]}
      />

      <div className="mx-auto max-w-5xl px-5 py-6">
        <Card className="mb-4 border-t-4 border-t-[var(--anchor-green)] p-6">
          <div className="ds-caption">Request a Quote</div>
          <h1 className="mt-2 text-2xl">Project Intake</h1>
          <p className="mt-1 text-sm text-[var(--anchor-gray)]">
            Use this when you&rsquo;re already working with Anchor and need a quote — share the
            project, roof, and equipment specs and our team will price it and follow up with
            recommendations. Optionally flag whether it&rsquo;s an FM (Factory Mutual) project and add
            an FM Index-Record # if it&rsquo;s FM insured.
          </p>
          <p className="mt-3 text-sm text-[var(--anchor-gray)]">
            New to Anchor and just need someone to point you in the right direction (no quote yet)?{" "}
            <Link
              href="/dashboard/opportunities/new"
              className="font-semibold text-[var(--anchor-green)] underline"
            >
              Use the Rooftop Equipment Consult instead →
            </Link>
          </p>
        </Card>
        {!ready ? (
          <ToolLoader feature="consults" label={t("loading")} />
        ) : (
          <FMIntakeForm />
        )}
      </div>
    </main>
  );
}
