"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import LeadForm from "@/app/components/leads/LeadForm";
import { Card } from "@/app/components/ui/Card";
import { Navbar, NavbarInner } from "@/app/components/ui/Navbar";

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
      <Navbar>
        <NavbarInner className="max-w-5xl">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/dashboard"
              className="inline-flex shrink-0 items-center"
            >
              <img src="/anchorp.svg" alt="Anchor" className="ds-logo" />
            </Link>

            <div className="leading-tight min-w-0">
              <div className="text-sm font-semibold tracking-wide truncate text-white">Submit a Job Lead</div>
              <div className="text-[12px] text-white/80 truncate">External contractors</div>
            </div>
          </div>

          <Link
            href="/dashboard"
            className="ds-btn ds-btn-ghost h-9 px-3"
          >
            Dashboard
          </Link>
        </NavbarInner>
      </Navbar>

      <div className="mx-auto max-w-5xl px-5 py-6">
        <Card className="mb-4 border-t-4 border-t-[var(--anchor-green)] p-6">
          <div className="ds-caption">Lead Intake</div>
          <h1 className="mt-2 text-2xl">Submit a Job Lead</h1>
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
