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

        const meta = user.user_metadata || {};
        const { data: created } = await supabase
          .from("profiles")
          .upsert(
            {
              id: user.id,
              email,
              role: roleToSet,
              user_type,
              full_name: meta.full_name || null,
              company: meta.company || null,
              phone: meta.phone || null,
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

          <div className="mt-4 flex w-full flex-col gap-1 text-left sm:mt-8 sm:gap-2">
            <h1 className="text-2xl text-white! sm:text-3xl">Welcome back</h1>
            <p className="max-w-2xl text-sm text-white/80">
              Jump into Copilot, manage assets, or run a rooftop safety check.
            </p>
          </div>
        </NavbarInner>
      </Navbar>

      <div className="ds-container py-6 pb-[calc(2rem+env(safe-area-inset-bottom))] sm:py-10">
        {/* Quick actions */}
        <div className="mb-4 flex flex-wrap items-center gap-2 sm:mb-8">
          <span className="ds-badge">
            {isInternal ? "Internal tools" : "External tools"}
          </span>
          
        </div>

        {/* Primary cards */}
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          <Link href="/chat" className="group transition-transform duration-200 hover:-translate-y-0.5">
            <Card className="h-full border-t-4 border-t-[var(--anchor-green)] p-6 transition-shadow duration-200 hover:shadow-lg">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold">Chat Copilot</div>
                  <div className="mt-1 text-sm text-[var(--anchor-gray)]">
                    Get solution recommendations and practical next steps.
                  </div>
                </div>
                <span className="ds-badge">AI</span>
              </div>
              <div className="mt-5">
                <div className="text-sm font-semibold text-[var(--anchor-green)]">
                  Open Copilot <span className="inline-block transition group-hover:translate-x-1">→</span>
                </div>
              </div>
            </Card>
          </Link>

          <Link href="/assets" className="group transition-transform duration-200 hover:-translate-y-0.5">
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
              <div className="mt-5">
                <div className="text-sm font-semibold text-[var(--anchor-green)]">
                  View Assets <span className="inline-block transition group-hover:translate-x-1">→</span>
                </div>
              </div>
            </Card>
          </Link>

          <Link href="/rooftop" className="group transition-transform duration-200 hover:-translate-y-0.5">
            <Card className="h-full border-t-4 border-t-[var(--anchor-green)] p-6 transition-shadow duration-200 hover:shadow-lg">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold">Rooftop Decision Tree</div>
                  <div className="mt-1 text-sm text-[var(--anchor-gray)]">
                    OSHA-guided rooftop access & egress safety verification.
                  </div>
                </div>
                <span className="ds-badge">Safety</span>
              </div>
              <div className="mt-5">
                <div className="text-sm font-semibold text-[var(--anchor-green)]">
                  Start Assessment <span className="inline-block transition group-hover:translate-x-1">→</span>
                </div>
              </div>
            </Card>
          </Link>

          {roleReady && role === "external_rep" && (
            <Link href="/dashboard/leads/new" className="group transition-transform duration-200 hover:-translate-y-0.5">
              <Card className="h-full border-t-4 border-t-[var(--anchor-green)] p-6 transition-shadow duration-200 hover:shadow-lg">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold">Project Identifier</div>
                    <div className="mt-1 text-sm text-[var(--anchor-gray)]">
                      Send photos and project details directly to inside sales.
                    </div>
                  </div>
                  <span className="ds-badge">Projects</span>
                </div>
                <div className="mt-5">
                  <div className="text-sm font-semibold text-[var(--anchor-green)]">
                    Submit Project <span className="inline-block transition group-hover:translate-x-1">→</span>
                  </div>
                </div>
              </Card>
            </Link>
          )}

          {roleReady && role === "admin" && (
            <Link href="/dashboard/reports" className="group transition-transform duration-200 hover:-translate-y-0.5">
              <Card className="h-full border-t-4 border-t-[var(--anchor-green)] p-6 transition-shadow duration-200 hover:shadow-lg">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-lg font-semibold">User Reports</div>
                    <div className="mt-1 text-sm text-[var(--anchor-gray)]">
                      External user activity, projects, and rooftop assessments.
                    </div>
                  </div>
                  <span className="ds-badge">Admin</span>
                </div>
                <div className="mt-5">
                  <div className="text-sm font-semibold text-[var(--anchor-green)]">
                    View Reports <span className="inline-block transition group-hover:translate-x-1">→</span>
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
