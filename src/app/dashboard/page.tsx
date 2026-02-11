// src/app/dashboard/page.tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import Button from "@/app/components/ui/Button";
import { Card } from "@/app/components/ui/Card";
import { Navbar, NavbarInner } from "@/app/components/ui/Navbar";

export const dynamic = "force-dynamic";


export default function DashboardPage() {
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);

  const [booting, setBooting] = useState(true);
  const [role, setRole] = useState<string | null>(null);
  const [roleReady, setRoleReady] = useState(false);


  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/");
    router.refresh();
  }

  // --- BOOT: ensure authed + ensure server cookies exist
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setBooting(true);

        const { data: sdata } = await supabase.auth.getSession();
        if (!alive) return;

        const s = sdata.session;
        if (!s) {
          router.replace("/");
          return;
        }

        // Force cookie sync for server routes (doc-open / recent-docs)
        const syncRes = await fetch("/api/auth/sync", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            access_token: s.access_token,
            refresh_token: s.refresh_token,
          }),
          cache: "no-store",
        });

        // Not fatal, but useful when debugging
        if (!syncRes.ok) {
          const j = await syncRes.json().catch(() => null);
          console.warn("auth sync failed", syncRes.status, j);
        }
      } finally {
        if (!alive) return;
        setBooting(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [router, supabase]);


  // --- Role check (external vs internal)
  useEffect(() => {
    let alive = true;

    (async () => {
      if (booting) return;

      const { data: userData } = await supabase.auth.getUser();
      if (!alive) return;

      const user = userData.user;
      if (!user) return;

      let { data: prof } = await supabase
        .from("profiles")
        .select("role,user_type,email")
        .eq("id", user.id)
        .maybeSingle();

      if (!alive) return;

      if (!prof) {
        const email = (user.email || "").trim().toLowerCase();
        const isInternalEmail = email.endsWith("@anchorp.com");
        const roleToSet = isInternalEmail ? "anchor_rep" : "external_rep";
        const user_type = isInternalEmail ? "internal" : "external";

        const { data: created } = await supabase
          .from("profiles")
          .upsert(
            {
              id: user.id,
              email,
              role: roleToSet,
              user_type,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "id" }
          )
          .select("role,user_type,email")
          .single();

        prof = created ?? null;
      }

      if (!alive) return;
      setRole(String((prof as any)?.role || ""));
      setRoleReady(true);
    })();

    return () => {
      alive = false;
    };
  }, [booting, supabase]);

  const isInternal = role === "admin" || role === "anchor_rep";

  return (
    <main className="ds-page">
      <Navbar>
        <NavbarInner className="flex-col items-start gap-4 py-4">
          <div className="flex w-full min-w-0 items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <img src="/anchorp.svg" alt="Anchor" className="ds-logo shrink-0" />

              <div className="min-w-0 leading-tight">
                <div className="truncate text-sm font-semibold tracking-wide text-white">
                  Anchor Sales Co-Pilot
                </div>
                <div className="truncate text-[12px] text-white/80">Dashboard</div>
              </div>
            </div>

            <Button
              onClick={signOut}
              className="h-9 min-w-0 max-w-[110px] overflow-hidden whitespace-nowrap text-ellipsis px-3"
              title="Sign out"
              variant="ghost"
            >
              Sign out
            </Button>
          </div>

          <div className="mt-8 flex w-full flex-col gap-2 text-left">
            <h1 className="text-3xl text-white!">Welcome back</h1>
            <p className="max-w-2xl text-sm text-white/80">
              Jump into Copilot or manage product tackle boxes. Everything stays organized,
              modern, and fast.
            </p>
          </div>
        </NavbarInner>
      </Navbar>

      <div className="ds-container py-10 pb-[calc(2rem+env(safe-area-inset-bottom))]">
        {/* Quick actions */}
        <div className="mb-8 flex flex-wrap items-center gap-2">
          <span className="ds-badge">
            {isInternal ? "Internal tools" : "External tools"}
          </span>
          
        </div>

        {/* Primary cards */}
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          <Link
            href="/chat"
            className="group transition-transform duration-200 hover:-translate-y-0.5"
          >
            <Card className="h-full border-t-4 border-t-[var(--anchor-green)] p-6 transition-shadow duration-200 hover:shadow-lg">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold">Chat Copilot</div>
                  <div className="mt-1 text-sm text-[var(--anchor-gray)]">
                    Get solution recommendations and practical next steps.
                  </div>
                </div>
                <span className="inline-flex items-center rounded-full border border-black/10 bg-[var(--surface-soft)] px-3 py-1 text-[12px] font-semibold text-[var(--anchor-deep)]">
                  AI
                </span>
              </div>
              <div className="mt-5 flex items-center justify-between">
                <div className="text-sm font-semibold text-[var(--anchor-green)]">
                  Open Copilot <span className="inline-block transition group-hover:translate-x-1">→</span>
                </div>
              </div>
            </Card>
          </Link>

          <Link
            href="/assets"
            className="group transition-transform duration-200 hover:-translate-y-0.5"
          >
            <Card className="h-full border-t-4 border-t-[var(--anchor-green)] p-6 transition-shadow duration-200 hover:shadow-lg">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold">Asset Management</div>
                  <div className="mt-1 text-sm text-[var(--anchor-gray)]">
                    Manuals, CAD, images, sales sheets, and more.
                  </div>
                </div>
                <span className="ds-badge">Library</span>
              </div>
              <div className="mt-5 flex items-center justify-between">
                <div className="text-sm font-semibold text-[var(--anchor-green)]">
                  View Assets <span className="inline-block transition group-hover:translate-x-1">→</span>
                </div>
              </div>
            </Card>
          </Link>

          {roleReady && role === "external_rep" && (
            <Link
              href="/dashboard/leads/new"
              className="group transition-transform duration-200 hover:-translate-y-0.5"
            >
              <Card className="h-full border-t-4 border-t-[var(--anchor-green)] p-6 transition-shadow duration-200 hover:shadow-lg">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold">Submit a Job Lead</div>
                    <div className="mt-1 text-sm text-[var(--anchor-gray)]">
                      Send photos and details directly to inside sales.
                    </div>
                  </div>
                  <span className="inline-flex items-center rounded-full border border-black/10 bg-[var(--surface-soft)] px-3 py-1 text-[12px] font-semibold text-[var(--anchor-deep)]">
                    Leads
                  </span>
                </div>
                <div className="mt-5 flex items-center justify-between">
                  <div className="text-sm font-semibold text-[var(--anchor-green)]">
                    Submit Lead <span className="inline-block transition group-hover:translate-x-1">→</span>
                  </div>
                </div>
              </Card>
            </Link>
          )}
        </div>

      </div>
    </main>
  );
}
