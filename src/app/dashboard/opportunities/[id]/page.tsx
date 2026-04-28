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
              href="/dashboard/opportunities"
              className="inline-flex shrink-0 items-center"
            >
              <img src="/anchorp.svg" alt="Anchor" className="ds-logo" />
            </Link>

            <div className="leading-tight min-w-0">
              <div className="text-sm font-semibold tracking-wide truncate text-white">Opportunity detail</div>
              <div className="text-[12px] text-white/80 truncate">Internal management</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/dashboard/opportunities"
              aria-label="Opportunities"
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/25 bg-white/5 text-sm font-semibold text-white transition hover:bg-white/10 active:bg-white/15"
            >
              ←
            </Link>
            <Link
              href="/dashboard/settings"
              aria-label="Settings"
              className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/25 bg-white/5 text-white transition hover:bg-white/10 active:bg-white/15"
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </Link>
          </div>
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
