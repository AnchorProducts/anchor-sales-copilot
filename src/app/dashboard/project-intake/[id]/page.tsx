"use client";

import { use, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { AppNavbar } from "@/app/components/ui/AppNavbar";
import { Card } from "@/app/components/ui/Card";
import { ToolLoader } from "@/app/components/visuals/FeatureGraphic";
import IntakeDetailView from "@/app/components/fm-intake/IntakeDetailView";
import { useTranslation } from "@/lib/i18n/useTranslation";

export const dynamic = "force-dynamic";

// Internal-rep read-only view of one Project Intake submission — the intake
// counterpart to /dashboard/opportunities/[id]. Territory is enforced by the
// /api/fm-intake/[id] gate (an anchor_rep only sees their states' intakes).
function isInternalRole(role: string) {
  return role === "admin" || role === "anchor_rep";
}

export default function ProjectIntakeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const { t } = useTranslation();

  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<any | null>(null);

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
      if (!alive) return;
      const role = String((prof as { role?: string } | null)?.role || "");
      if (!isInternalRole(role)) {
        setError("Internal access only.");
        setReady(true);
        return;
      }
      const res = await fetch(`/api/fm-intake/${encodeURIComponent(id)}`, { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!alive) return;
      if (!res.ok) {
        setError(json?.error === "Forbidden" ? "This intake isn't in your territory." : json?.error || "Failed to load submission.");
      } else {
        setDetail(json.submission);
      }
      setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, [id, router, supabase]);

  return (
    <main className="ds-page">
      <AppNavbar
        title="Project Intake"
        subtitle="Quote request"
        menuItems={[{ label: "Active Consults", href: "/dashboard/opportunities" }]}
      />

      <div className="ds-container py-6 pb-[calc(3rem+env(safe-area-inset-bottom))] sm:py-10">
        <button
          type="button"
          onClick={() => router.push("/dashboard/opportunities")}
          className="mb-3 text-sm font-semibold text-[var(--anchor-green)] hover:underline"
        >
          ← Back to Active Consults
        </button>

        {!ready ? (
          <ToolLoader feature="consults" label={t("loading")} />
        ) : error ? (
          <Card className="border-[var(--anchor-deep)]/25 bg-[var(--anchor-mint)] p-5 text-sm text-[var(--anchor-deep)]">
            {error}
          </Card>
        ) : detail ? (
          <IntakeDetailView detail={detail} />
        ) : null}
      </div>
    </main>
  );
}
