"use client";

import ShowcaseHub from "@/app/components/showcase/ShowcaseHub";
import { Card } from "@/app/components/ui/Card";
import { ToolLoader } from "@/app/components/visuals/FeatureGraphic";
import { AppNavbar } from "@/app/components/ui/AppNavbar";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { useFormAccess } from "@/lib/role/useFormAccess";
import { useToolAccess } from "@/lib/role/useToolAccess";

export const dynamic = "force-dynamic";

export default function ShowcasePage() {
  // Internal sales only — the mobile showcase is driven by operations and the
  // stops are filed by whoever is on the road. Admins must "View app as" an
  // internal rep to preview, the same as every other submission form.
  const { ready } = useFormAccess("sales");
  // The showcase is a named list, not a role. The API routes enforce this too —
  // this only decides what the page renders.
  const { grants, ready: grantsReady } = useToolAccess();
  const { t } = useTranslation();

  const allowed = grants.has("showcase");

  return (
    <main className="ds-page">
      <AppNavbar
        title="Showcase Stop"
        subtitle="Stops and photos from the road"
        menuItems={[{ label: t("dashboard"), href: "/dashboard" }]}
      />

      <div className="mx-auto max-w-3xl px-5 py-6">
        {!ready || !grantsReady ? (
          <ToolLoader feature="notable" label={t("loading")} />
        ) : allowed ? (
          <ShowcaseHub />
        ) : (
          <Card className="border-[var(--anchor-deep)]/25 bg-[var(--anchor-mint)] p-5 text-sm text-[var(--anchor-deep)]">
            You&rsquo;re not assigned to the mobile showcase. An admin can add you in Admin
            Console → Manage Tools.
          </Card>
        )}
      </div>
    </main>
  );
}
