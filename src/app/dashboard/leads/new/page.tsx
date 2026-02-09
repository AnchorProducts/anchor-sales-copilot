"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import LeadForm from "@/app/components/leads/LeadForm";

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
    <main className="min-h-dvh bg-[#F6F7F8] text-black">
      <header className="sticky top-0 z-30 bg-[#047835] pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-5 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/dashboard"
              className="h-9 w-9 rounded-md bg-white/10 border border-white/20 flex items-center justify-center shrink-0"
            >
              <img src="/anchorp.svg" alt="Anchor" className="h-6 w-auto" />
            </Link>

            <div className="leading-tight min-w-0">
              <div className="text-sm font-semibold tracking-wide truncate text-white">Submit a Job Lead</div>
              <div className="text-[12px] text-white/80 truncate">External contractors</div>
            </div>
          </div>

          <Link
            href="/dashboard"
            className="h-9 inline-flex items-center rounded-md border border-white/20 bg-white/10 px-3 text-[12px] font-semibold text-white hover:bg-white/15 transition"
          >
            Dashboard
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-5 py-6">
        {!ready ? (
          <div className="rounded-3xl border border-black/10 bg-white p-5 text-sm text-black/60 shadow-sm">Loading…</div>
        ) : (
          <LeadForm />
        )}
      </div>
    </main>
  );
}
