"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { AppNavbar } from "@/app/components/ui/AppNavbar";
import { Card } from "@/app/components/ui/Card";
import { useTranslation } from "@/lib/i18n/useTranslation";

export const dynamic = "force-dynamic";

type Faq = { q: string; a: string };

const FAQS: Faq[] = [
  {
    q: "How do I submit a rooftop equipment consult?",
    a: "From the dashboard, open “Rooftop Equipment Consult,” fill in the project, site address, and roof details, optionally add a solution type or contractors, and submit. It’s routed automatically to the assigned Anchor rep for that state.",
  },
  {
    q: "How do I order marketing materials?",
    a: "Open “Marketing Orders,” pick one or more categories (Samples, Brochures, Swag, Other), describe the items, set a quantity and needed-by date, and add the ship-to address. Your order is emailed to the right marketing contact for each category.",
  },
  {
    q: "How do I file a commission claim?",
    a: "External reps can open “Commission Claim” from the dashboard. You can also tick “Also file my Anchor commission claim” at the bottom of a rooftop consult to reuse that project’s details.",
  },
  {
    q: "Where do my submissions go?",
    a: "Each form is routed to the right Anchor contact automatically — consults to your regional rep, and commission, notable project, marketing, and support submissions to the recipients an admin configures. You don’t need to CC anyone.",
  },
  {
    q: "How do I get help or ask a question?",
    a: "Tap the Help button (bottom-right) and choose “Ask a question.” That opens a support request that goes straight to the Anchor team, who can reply in-app.",
  },
  {
    q: "What are the page walkthroughs?",
    a: "Tap the Help button and choose “Page walkthrough” to get a quick guided tour of whatever page you’re on. It’s available on most pages.",
  },
];

export default function FaqPage() {
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const { t } = useTranslation();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!alive) return;
      if (!data.user) {
        router.replace("/");
        return;
      }
      setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, [router, supabase]);

  return (
    <main className="ds-page">
      <AppNavbar
        title="FAQ"
        subtitle="Common questions"
        menuItems={[{ label: t("dashboard"), href: "/dashboard" }]}
      />

      <div className="mx-auto max-w-3xl px-5 py-6">
        <Card className="mb-4 border-t-4 border-t-[var(--anchor-green)] p-6">
          <div className="ds-caption">Help</div>
          <h1 className="mt-2 text-2xl">Frequently asked questions</h1>
          <p className="mt-1 text-sm text-[var(--anchor-gray)]">
            Quick answers to the most common questions. Still stuck? Tap the Help button and choose
            “Ask a question.”
          </p>
        </Card>

        {!ready ? (
          <Card className="p-5 text-sm text-black/60">{t("loading")}</Card>
        ) : (
          <Card className="divide-y divide-[var(--border-default)] p-0">
            {FAQS.map((item) => (
              <details key={item.q} className="group px-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-4 text-sm font-semibold text-[var(--anchor-deep)]">
                  {item.q}
                  <span className="shrink-0 text-[var(--anchor-gray)] transition group-open:rotate-180">▾</span>
                </summary>
                <p className="pb-4 text-sm leading-relaxed text-[var(--anchor-gray)]">{item.a}</p>
              </details>
            ))}
          </Card>
        )}
      </div>
    </main>
  );
}
