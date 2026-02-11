// src/app/admin/knowledge/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import AdminKnowledgeTabs from "@/app/components/admin/AdminKnowledgeTabs";
import Button from "@/app/components/ui/Button";
import { Alert } from "@/app/components/ui/Alert";
import { Navbar, NavbarInner } from "@/app/components/ui/Navbar";

type Role = "admin" | "anchor_rep" | "external_rep";
type UserType = "internal" | "external";

type ProfileRow = {
  id: string;
  role: Role | null;
  user_type: UserType | null;
  email: string | null;
};

export default function AdminKnowledgePage() {
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);

  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const { data: u, error: uErr } = await supabase.auth.getUser();
        if (!alive) return;

        if (uErr) throw new Error(uErr.message);
        if (!u.user) {
          router.replace("/");
          return;
        }

        const { data: p, error: pErr } = await supabase
          .from("profiles")
          .select("id,role,user_type,email")
          .eq("id", u.user.id)
          .maybeSingle<ProfileRow>();

        if (pErr) throw new Error(pErr.message);

        const role = p?.role ?? null;

        // gate: only internal/admin can access
        if (role !== "admin" && role !== "anchor_rep") {
          router.replace("/chat");
          return;
        }

        setProfile(p ?? null);
      } catch (e: any) {
        setError(e?.message || "Failed to load profile");
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [router, supabase]);

  if (loading) {
    return (
      <main className="min-h-screen anchor-app-bg p-6 text-white">
        <Alert className="mx-auto max-w-6xl border-white/20 bg-white/10 text-white" tone="neutral">
          Loading admin knowledge…
        </Alert>
      </main>
    );
  }

  if (error) {
    return (
      <main className="min-h-screen anchor-app-bg text-white p-6">
        <Alert className="mx-auto max-w-6xl border-white/20 bg-white/10 text-white" tone="error">
          {error}
        </Alert>
      </main>
    );
  }

  if (!profile) return null;

  return (
    <main className="min-h-screen anchor-app-bg text-white">
      <Navbar className="anchor-topbar">
        <NavbarInner>
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-wide">Knowledge Admin</div>
            <div className="text-[12px] text-white/60">
              Review feedback + corrections • Promote fixes into knowledge docs
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="rounded-[12px] border border-white/20 bg-white/10 px-2 py-1 text-[11px] text-white/80">
              {profile.role === "admin" ? "Admin" : "Anchor Rep"}
            </div>

            <Button
              onClick={() => router.push("/chat")}
              className="h-9 px-3"
              variant="ghost"
            >
              Back to chat
            </Button>
          </div>
        </NavbarInner>
      </Navbar>

      <div className="mx-auto max-w-6xl px-4 py-4">
        <AdminKnowledgeTabs role={profile.role as Role} />
      </div>
    </main>
  );
}
