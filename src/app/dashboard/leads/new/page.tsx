"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import LeadForm from "@/app/components/leads/LeadForm";
import { Card } from "@/app/components/ui/Card";
import { AppNavbar } from "@/app/components/ui/AppNavbar";

export const dynamic = "force-dynamic";

export default function NewLeadPage() {
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);
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
        title="Project Identifier"
        subtitle="External contractors"
        menuItems={[{ label: "Dashboard", href: "/dashboard" }]}
      />

      <div className="mx-auto max-w-5xl px-5 py-6">
        <Card className="mb-4 border-t-4 border-t-[var(--anchor-green)] p-6">
          <div className="ds-caption">Lead Intake</div>
          <h1 className="mt-2 text-2xl">Project Identifier</h1>
          <p className="mt-1 text-sm text-[var(--anchor-gray)]">
            Share project requirements, media, and scheduling details for inside sales review.
          </p>
        </Card>
        {!ready ? (
          <Card className="p-5 text-sm text-black/60">Loading…</Card>
        ) : (
          <LeadForm />
        )}
      </div>
    </main>
  );
}
