"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import LeadDetail from "@/app/components/leads/LeadDetail";

export const dynamic = "force-dynamic";

function isInternalRole(role: string) {
  return role === "admin" || role === "anchor_rep";
}

export default function LeadDetailPage() {
  const params = useParams();
  const id = String(params?.id || "");
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
    <main className="min-h-dvh bg-[#F6F7F8] text-black">
      <header className="sticky top-0 z-30 bg-[#047835] pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-5 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/dashboard/leads"
              className="h-9 w-9 rounded-md bg-white/10 border border-white/20 flex items-center justify-center shrink-0"
            >
              <img src="/anchorp.svg" alt="Anchor" className="h-6 w-auto" />
            </Link>

            <div className="leading-tight min-w-0">
              <div className="text-sm font-semibold tracking-wide truncate text-white">Lead detail</div>
              <div className="text-[12px] text-white/80 truncate">Internal management</div>
            </div>
          </div>

          <Link
            href="/dashboard/leads"
            className="h-9 inline-flex items-center rounded-md border border-white/20 bg-white/10 px-3 text-[12px] font-semibold text-white hover:bg-white/15 transition"
          >
            Leads
          </Link>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-5 py-6">
        {!ready ? (
          <div className="rounded-3xl border border-black/10 bg-white p-5 text-sm text-black/60 shadow-sm">Loading…</div>
        ) : error ? (
          <div className="rounded-3xl border border-red-200 bg-red-50 p-5 text-sm text-red-700 shadow-sm">
            {error}
          </div>
        ) : (
          <LeadDetail id={id} />
        )}
      </div>
    </main>
  );
}
