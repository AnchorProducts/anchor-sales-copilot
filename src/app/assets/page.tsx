// src/app/assets/page.tsx
"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import AssetsBrowser from "../components/assets/AssetsBrowser";
import { Card } from "@/app/components/ui/Card";
import { Navbar, NavbarInner } from "@/app/components/ui/Navbar";

export const dynamic = "force-dynamic";

export default function AssetsPage() {
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
      {/* Top bar */}
      <Navbar>
        <NavbarInner className="max-w-5xl">
          <div className="flex items-center gap-3 min-w-0">
            <img src="/anchorp.svg" alt="Anchor Products" className="ds-logo shrink-0" />

            <div className="leading-tight min-w-0">
              <div className="text-sm font-semibold tracking-wide truncate text-white">
                Asset Management
              </div>
              <div className="text-[12px] text-white/80 truncate">
                Tackle boxes • Asset Library
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Link
              href="/dashboard"
              className="inline-flex"
              title="Back to Dashboard"
            >
              <span className="ds-btn ds-btn-ghost h-9 px-3">Dashboard</span>
            </Link>
          </div>
        </NavbarInner>
      </Navbar>

      {/* Page body */}
      <div className="mx-auto max-w-5xl px-5 py-6">
        <Card className="mb-4 border-t-4 border-t-[var(--anchor-green)] p-6">
          <div className="ds-caption">Library</div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">Asset Library</h1>
          <p className="mt-1 text-sm text-[var(--anchor-gray)]">
            Browse Solutions + Anchors + Tacklebox Items
          </p>
        </Card>

        {!ready ? (
          <Card className="p-5 text-sm text-black/60">
            Loading…
          </Card>
        ) : (
          <AssetsBrowser />
        )}
      </div>
    </main>
  );
}
