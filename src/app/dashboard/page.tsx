// src/app/dashboard/page.tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

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
    <main className="min-h-[100svh] min-h-dvh bg-[#FFFFFF] text-[#000000]">
      {/* Sticky header */}
      <header className="sticky top-0 z-30 bg-[#047835] pt-[env(safe-area-inset-top)]">
  <div className="mx-auto max-w-6xl px-5 py-4">
    <div className="flex items-center justify-between gap-3 min-w-0">
      {/* Left lockup */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="h-11 w-11 rounded-xl bg-white/10 ring-1 ring-white/15 flex items-center justify-center shrink-0">
          <img src="/anchorp.svg" alt="Anchor" className="h-10 w-auto" />
        </div>

        <div className="leading-tight min-w-0">
          <div className="text-sm font-semibold tracking-wide text-white truncate">
            Anchor Sales Co-Pilot
          </div>
          <div className="text-[12px] text-white/80 truncate">Dashboard</div>
        </div>
      </div>

      {/* Button (truncate if needed) */}
      <button
        type="button"
        onClick={signOut}
        className="h-9 min-w-0 max-w-[110px] shrink inline-flex items-center justify-center rounded-md border border-white/20 bg-white/10 px-3 text-[12px] font-semibold text-white hover:bg-white/15 transition overflow-hidden whitespace-nowrap text-ellipsis"
        title="Sign out"
      >
        Sign out
      </button>
    </div>
  </div>

  {/* Hero text */}
  <div className="mx-auto max-w-6xl px-5 pb-6">
    <div className="mt-2 flex flex-col gap-2">
      <h1 className="text-3xl font-semibold tracking-tight text-white">Welcome back</h1>
      <p className="max-w-2xl text-sm text-white/80">
        Jump into Copilot or manage product tackle boxes. Everything stays organized, modern,
        and fast.
      </p>
    </div>
  </div>
</header>


      {/* Body */}
      <div className="mx-auto max-w-6xl px-5 py-8 pb-[calc(2rem+env(safe-area-inset-bottom))]">
        {/* Quick actions */}
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded-full bg-[#9CE2BB] px-3 py-1 text-[12px] font-semibold text-[#11500F]">
            {isInternal ? "Internal tools" : "External tools"}
          </span>
        </div>

        {/* Primary cards */}
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          <Link
            href="/chat"
            className="group rounded-3xl border border-black/10 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold">Chat Copilot</div>
                <div className="mt-1 text-sm text-[#76777B]">
                  Get solution recommendations and practical next steps.
                </div>
              </div>
              <span className="inline-flex items-center rounded-full bg-black/5 px-3 py-1 text-[12px] font-semibold text-black/70">
                AI
              </span>
            </div>

            <div className="mt-5 flex items-center justify-between">
              <div className="text-sm font-semibold text-[#047835]">
                Open Copilot{" "}
                <span className="transition group-hover:translate-x-1 inline-block">→</span>
              </div>
            </div>
          </Link>

          <Link
            href="/assets"
            className="group rounded-3xl border border-black/10 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold">Asset Management</div>
                <div className="mt-1 text-sm text-[#76777B]">
                  Manuals, CAD, images, sales sheets, and more.
                </div>
              </div>
              <span className="inline-flex items-center rounded-full bg-[#9CE2BB] px-3 py-1 text-[12px] font-semibold text-[#11500F]">
                Library
              </span>
            </div>

            <div className="mt-5 flex items-center justify-between">
              <div className="text-sm font-semibold text-[#047835]">
                View Assets{" "}
                <span className="transition group-hover:translate-x-1 inline-block">→</span>
              </div>
            </div>
          </Link>

          {roleReady && role === "external_rep" && (
            <Link
              href="/dashboard/leads/new"
              className="group rounded-3xl border border-black/10 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-lg font-semibold">Submit a Job Lead</div>
                  <div className="mt-1 text-sm text-[#76777B]">
                    Send photos and details directly to inside sales.
                  </div>
                </div>
                <span className="inline-flex items-center rounded-full bg-black/5 px-3 py-1 text-[12px] font-semibold text-black/70">
                  Leads
                </span>
              </div>

              <div className="mt-5 flex items-center justify-between">
                <div className="text-sm font-semibold text-[#047835]">
                  Submit Lead{" "}
                  <span className="transition group-hover:translate-x-1 inline-block">→</span>
                </div>
              </div>
            </Link>
          )}
        </div>

      </div>
    </main>
  );
}
