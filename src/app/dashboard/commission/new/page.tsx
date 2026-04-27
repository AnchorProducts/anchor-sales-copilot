"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import CommissionForm from "@/app/components/commission/CommissionForm";
import { Card } from "@/app/components/ui/Card";
import { AppNavbar } from "@/app/components/ui/AppNavbar";

export const dynamic = "force-dynamic";

export default function CommissionClaimPage() {
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
    return () => { alive = false; };
  }, [router, supabase]);

  return (
    <main className="ds-page">
      <AppNavbar
        title="Commission Claim"
        subtitle="Independent Representative"
        menuItems={[{ label: "Dashboard", href: "/dashboard" }]}
      />

      <div className="mx-auto max-w-5xl px-5 py-6">
        <Card className="mb-4 border-t-4 border-t-[var(--anchor-green)] p-6">
          <div className="ds-caption">Independent Representative</div>
          <h1 className="mt-2 text-2xl">Commission Claim Form</h1>
          <p className="mt-1 text-sm text-[var(--anchor-gray)]">
            Complete and submit prior to order shipment. Late requests will not be considered.
          </p>
        </Card>
        {!ready ? (
          <Card className="p-5 text-sm text-black/60">Loading…</Card>
        ) : (
          <CommissionForm />
        )}
      </div>
    </main>
  );
}
