"use client";

import ShowcaseSubmitForm from "@/app/components/showcase/ShowcaseSubmitForm";
import { Card } from "@/app/components/ui/Card";
import { ToolLoader } from "@/app/components/visuals/FeatureGraphic";
import { AppNavbar } from "@/app/components/ui/AppNavbar";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { useFormAccess } from "@/lib/role/useFormAccess";
import { useToolAccess } from "@/lib/role/useToolAccess";

export const dynamic = "force-dynamic";

export default function ShowcaseSubmitPage() {
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
        subtitle="File a mobile showcase stop"
        menuItems={[{ label: t("dashboard"), href: "/dashboard" }]}
      />

      <div className="mx-auto max-w-3xl px-5 py-6">
        <Card className="mb-4 border-t-4 border-t-[var(--anchor-green)] p-6">
          <div className="ds-caption">Mobile showcase</div>
          <h1 className="mt-2 text-2xl">File a stop</h1>
          <p className="mt-1 text-sm text-[var(--anchor-gray)]">
            Log where the showcase went, what happened there, and a photograph.
          </p>
          <p className="mt-3 text-sm text-[var(--anchor-gray)]">
            Every stop is filed pending. Marketing publishes or declines it on anchorp.com, and
            the public schedule only ever shows published stops — so nothing you file here goes
            live on its own. If a stop is declined you&rsquo;ll see the reason below.
          </p>
        </Card>

        {!ready || !grantsReady ? (
          <ToolLoader feature="notable" label={t("loading")} />
        ) : allowed ? (
          <ShowcaseSubmitForm />
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
