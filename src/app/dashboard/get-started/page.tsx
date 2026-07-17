"use client";

import Link from "next/link";
import { Card } from "@/app/components/ui/Card";
import { ToolLoader } from "@/app/components/visuals/FeatureGraphic";
import { AppNavbar } from "@/app/components/ui/AppNavbar";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { useFormAccess } from "@/lib/role/useFormAccess";

export const dynamic = "force-dynamic";

// Single entry point that fronts the two rep-facing intake flows so reps don't
// have to guess which form they want. Pick your situation and we route you to
// the right one:
//   New to Anchor        -> Rooftop Equipment Consult (/dashboard/opportunities/new)
//   Existing customer    -> Project Intake / quote     (/dashboard/project-intake/new)
// Both destination forms still deep-link directly and are unchanged.
export default function GetStartedPage() {
  // Same audience as the two forms it fronts — internal + external sales.
  // Admins must "View app as" a sales role.
  const { ready } = useFormAccess("sales", "/dashboard");

  const { t } = useTranslation();

  return (
    <main className="ds-page">
      <AppNavbar
        title="Talk to a Rep or Request a Quote"
        subtitle="Get started"
        menuItems={[{ label: t("dashboard"), href: "/dashboard" }]}
      />

      <div className="mx-auto max-w-5xl px-5 py-6">
        <Card className="mb-4 border-t-4 border-t-[var(--anchor-green)] p-6">
          <div className="ds-caption">Get started</div>
          <h1 className="mt-2 text-2xl">Talk to an Anchor rep or request a quote</h1>
          <p className="mt-1 text-sm text-[var(--anchor-gray)]">
            Tell us where you are and we&rsquo;ll take you to the right form. It only takes a
            couple of minutes either way.
          </p>
        </Card>

        {!ready ? (
          <ToolLoader feature="consults" label={t("loading")} />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <ChooserCard
              href="/dashboard/opportunities/new"
              caption="New to Anchor"
              title="I’m new to Anchor"
              body="Think a project calls for U-anchors? Let an Anchor rep do the heavy lifting for you — the specs, quoting, and follow-up are on us. Just share the project, contacts, and any photos, and you still earn your commission."
              cta="Start a consult"
            />
            <ChooserCard
              href="/dashboard/project-intake/new"
              caption="Existing Anchor customer"
              title="I already work with Anchor"
              body="Ready for a quote. Share the project, roof, and equipment specs — optionally flag an FM project — and our team will price it and follow up."
              cta="Request a quote"
            />
          </div>
        )}
      </div>
    </main>
  );
}

function ChooserCard({
  href,
  caption,
  title,
  body,
  cta,
}: {
  href: string;
  caption: string;
  title: string;
  body: string;
  cta: string;
}) {
  return (
    <Link href={href} className="group block h-full focus:outline-none">
      <Card className="flex h-full flex-col p-6 transition group-hover:border-[var(--anchor-green)] group-hover:shadow-md group-focus-visible:border-[var(--anchor-green)]">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--anchor-green)]/10 text-[var(--anchor-green)]">
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="8" y="2" width="8" height="4" rx="1" />
            <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
            <path d="M9 14l2 2 4-4" />
          </svg>
        </span>
        <div className="ds-caption mt-4">{caption}</div>
        <h2 className="mt-1 text-lg font-semibold">{title}</h2>
        <p className="mt-2 flex-1 text-sm text-[var(--anchor-gray)]">{body}</p>
        <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-[var(--anchor-green)]">
          {cta}
          <span className="transition group-hover:translate-x-0.5">→</span>
        </span>
      </Card>
    </Link>
  );
}
