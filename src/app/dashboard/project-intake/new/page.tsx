"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import FMIntakeForm from "@/app/components/fm-intake/FMIntakeForm";
import CommissionForm from "@/app/components/commission/CommissionForm";
import { Card } from "@/app/components/ui/Card";
import { ToolLoader } from "@/app/components/visuals/FeatureGraphic";
import { AppNavbar } from "@/app/components/ui/AppNavbar";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { useFormAccess } from "@/lib/role/useFormAccess";
import { supabaseBrowser } from "@/lib/supabase/browser";

export const dynamic = "force-dynamic";

export default function ProjectIntakePage() {
  // Project Intake / quote request is open to internal and external sales — the
  // same audience as the REC form. Admins must "View app as" a sales role.
  const { ready, effectiveRole, actualRole } = useFormAccess("sales", "/dashboard");

  // Commission claims are gated per-user by the `anchor_commission` flag. Only
  // external reps who carry it (plus admins previewing external) may file one —
  // this mirrors the /dashboard/commission/new page + /api/commission gate, so
  // the optional commission section only shows for those authorized users.
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [anchorCommission, setAnchorCommission] = useState(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!alive || !data.user) return;
      const { data: prof } = await supabase
        .from("profiles")
        .select("anchor_commission")
        .eq("id", data.user.id)
        .maybeSingle();
      if (!alive) return;
      setAnchorCommission((prof as { anchor_commission?: boolean } | null)?.anchor_commission === true);
    })();
    return () => { alive = false; };
  }, [supabase]);

  const canClaimCommission =
    effectiveRole === "external_rep" && (anchorCommission || actualRole === "admin");

  const { t } = useTranslation();
  return (
    <main className="ds-page">
      <AppNavbar
        title="Project Intake"
        subtitle="Request a quote"
        menuItems={[{ label: t("dashboard"), href: "/dashboard" }]}
      />

      <div className="mx-auto max-w-5xl px-5 py-6">
        <Card className="mb-4 border-t-4 border-t-[var(--anchor-green)] p-6">
          <div className="ds-caption">Request a Quote</div>
          <h1 className="mt-2 text-2xl">Project Intake</h1>
          <p className="mt-1 text-sm text-[var(--anchor-gray)]">
            Use this when you&rsquo;re already working with Anchor and need a quote — share the
            project, roof, and equipment specs and our team will price it and follow up with
            recommendations. Optionally flag whether it&rsquo;s an FM project and add
            an FM Index-Record # if it&rsquo;s FM insured.
          </p>
          <p className="mt-3 text-sm text-[var(--anchor-gray)]">
            New to Anchor and just need someone to point you in the right direction (no quote yet)?{" "}
            <Link
              href="/dashboard/opportunities/new"
              className="font-semibold text-[var(--anchor-green)] underline"
            >
              Use the Rooftop Equipment Consult instead →
            </Link>
          </p>
        </Card>
        {!ready ? (
          <ToolLoader feature="consults" label={t("loading")} />
        ) : (
          <>
            <FMIntakeForm />
            {canClaimCommission && <CommissionSection />}
          </>
        )}
      </div>
    </main>
  );
}

// Optional, collapsed-by-default commission claim for authorized reps. Kept
// separate from the quote request above — it posts its own claim to
// /api/commission with its own submit button.
function CommissionSection() {
  const [open, setOpen] = useState(false);
  return (
    <Card className="mt-4 p-4 sm:p-5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-start gap-3 text-left"
      >
        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-[var(--anchor-green)]/10 text-[var(--anchor-green)]">
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M20 12V8H4a2 2 0 0 1 0-4h14v4" />
            <rect x="2" y="6" width="20" height="14" rx="2" />
            <circle cx="16" cy="13" r="1.5" />
          </svg>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-base font-bold text-[var(--anchor-deep)] sm:text-lg">
            File a commission claim (optional)
          </span>
          <span className="mt-0.5 block text-sm text-[var(--anchor-gray)]">
            Placing the order for this project? Add your commission claim here — it&rsquo;s a
            separate submission from the quote request above.
          </span>
        </span>
        <svg
          viewBox="0 0 24 24"
          className={`mt-1 h-5 w-5 shrink-0 text-[var(--anchor-gray)] transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div className="mt-4">
          <CommissionForm />
        </div>
      )}
    </Card>
  );
}
