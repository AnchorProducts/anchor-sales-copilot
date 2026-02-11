"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import LeadsTable from "@/app/components/leads/LeadsTable";
import { Card } from "@/app/components/ui/Card";
import { Navbar, NavbarInner } from "@/app/components/ui/Navbar";

function isInternalRole(role: string) {
  return role === "admin" || role === "anchor_rep";
}

export default function LeadsPageClient() {
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!alive) return;

      if (!data.user) {
        router.replace("/");
        return;
      }

      const { data: prof } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.user.id)
        .maybeSingle();

      const role = String((prof as any)?.role || "");
      if (!isInternalRole(role)) {
        setError("Internal access only.");
        setReady(true);
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
        <NavbarInner>
          <div className="flex min-w-0 items-center gap-3">
            <Link href="/dashboard" className="inline-flex shrink-0 items-center">
              <img src="/anchorp.svg" alt="Anchor" className="ds-logo" />
            </Link>

            <div className="min-w-0 leading-tight">
              <div className="truncate text-sm font-semibold tracking-wide text-white">Leads</div>
              <div className="truncate text-[12px] text-white/80">Internal management</div>
            </div>
          </div>

          <Link href="/dashboard" className="ds-btn ds-btn-ghost h-9 px-3">
            Dashboard
          </Link>
        </NavbarInner>
      </Navbar>

      <div className="ds-container py-6">
        <Card className="mb-4 border-t-4 border-t-[var(--anchor-green)] p-6">
          <div className="ds-caption">Operations</div>
          <h1 className="mt-2 text-2xl">Lead Queue</h1>
          <p className="mt-1 text-sm text-[var(--anchor-gray)]">
            Track assignment, status, and follow-up progress across incoming opportunities.
          </p>
        </Card>
        {!ready ? (
          <Card className="p-5 text-sm text-black/60">Loading…</Card>
        ) : error ? (
          <Card className="border-[var(--anchor-deep)]/25 bg-[var(--anchor-mint)] p-5 text-sm text-[var(--anchor-deep)]">
            {error}
          </Card>
        ) : (
          <LeadsTable />
        )}
      </div>
    </main>
  );
}
