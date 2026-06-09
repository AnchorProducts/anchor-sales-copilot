"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { AppNavbar } from "@/app/components/ui/AppNavbar";
import { Card } from "@/app/components/ui/Card";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { marketingCategoriesLabel } from "@/lib/marketingOrders";

export const dynamic = "force-dynamic";

type MarketingOrder = {
  id: string;
  categories: string[] | null;
  items: string;
  quantity: string | null;
  needed_by: string | null;
  ship_to: string | null;
  notes: string | null;
  status: string | null;
  submitter_name: string | null;
  submitter_company: string | null;
  submitter_email: string | null;
  submitter_phone: string | null;
  created_at: string | null;
};

function formatDateTime(s: string | null) {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString("en-US", {
      month: "short",
      day: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return s;
  }
}

function formatDate(s: string | null) {
  if (!s) return "—";
  try {
    // needed_by is a plain calendar date (YYYY-MM-DD); render without TZ shift.
    return new Date(`${s}T00:00:00`).toLocaleDateString("en-US", {
      month: "short",
      day: "2-digit",
      year: "numeric",
    });
  } catch {
    return s;
  }
}

export default function AdminMarketingOrdersPage() {
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const { t } = useTranslation();

  const [ready, setReady] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [items, setItems] = useState<MarketingOrder[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);

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

      const role = String((prof as { role?: string } | null)?.role || "");
      if (role !== "admin" && role !== "anchor_rep") {
        setAccessError("Admin access only.");
        setReady(true);
        return;
      }

      const res = await fetch("/api/marketing-orders", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!alive) return;
      if (!res.ok) {
        setLoadErr(json?.error || "Failed to load marketing orders.");
      } else {
        setItems(json?.items || []);
      }
      setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, [router, supabase]);

  return (
    <main className="ds-page">
      <AppNavbar
        title="Marketing Orders"
        subtitle="Submitted order history"
        menuItems={[
          { label: t("dashboard"), href: "/dashboard" },
          { label: "Admin Console", href: "/admin" },
        ]}
      />

      <div className="ds-container py-6 pb-[calc(3rem+env(safe-area-inset-bottom))] sm:py-10">
        {!ready ? (
          <Card className="p-5 text-sm text-black/60">{t("loading")}</Card>
        ) : accessError ? (
          <Card className="border-[var(--anchor-deep)]/25 bg-[var(--anchor-mint)] p-5 text-sm text-[var(--anchor-deep)]">
            {accessError}
          </Card>
        ) : (
          <>
            <header className="mb-6 sm:mb-8">
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Marketing Orders</h1>
              <p className="mt-1 text-sm text-[var(--anchor-gray)]">
                Every samples, brochure, swag, and collateral order submitted by sales reps.
              </p>
            </header>

            {loadErr && (
              <Card className="mb-4 border-red-200 bg-red-50 p-4 text-sm text-red-700">{loadErr}</Card>
            )}

            {items.length === 0 && !loadErr ? (
              <Card className="p-6 text-center text-sm text-[var(--anchor-gray)]">
                No marketing orders yet.
              </Card>
            ) : (
              <div className="space-y-3">
                {items.map((o) => (
                  <Card key={o.id} className="p-5">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="rounded-full bg-[var(--anchor-mint)]/60 px-2.5 py-0.5 text-xs font-semibold text-[var(--anchor-deep)]">
                          {marketingCategoriesLabel(o.categories)}
                        </span>
                        <span className="rounded-full border border-[var(--border-default)] px-2.5 py-0.5 text-xs font-medium capitalize text-[var(--anchor-gray)]">
                          {o.status || "new"}
                        </span>
                      </div>
                      <span className="text-xs text-[var(--anchor-gray)]">{formatDateTime(o.created_at)}</span>
                    </div>

                    <div className="mt-3 text-sm text-black">{o.items}</div>

                    <dl className="mt-3 grid gap-x-6 gap-y-1 text-xs text-[var(--anchor-gray)] sm:grid-cols-2">
                      <div>
                        <dt className="inline font-semibold text-[var(--anchor-deep)]">Quantity: </dt>
                        <dd className="inline">{o.quantity || "—"}</dd>
                      </div>
                      <div>
                        <dt className="inline font-semibold text-[var(--anchor-deep)]">Needed by: </dt>
                        <dd className="inline">{formatDate(o.needed_by)}</dd>
                      </div>
                      <div className="sm:col-span-2">
                        <dt className="inline font-semibold text-[var(--anchor-deep)]">Ship to: </dt>
                        <dd className="inline whitespace-pre-line">{o.ship_to || "—"}</dd>
                      </div>
                      {o.notes && (
                        <div className="sm:col-span-2">
                          <dt className="inline font-semibold text-[var(--anchor-deep)]">Notes: </dt>
                          <dd className="inline whitespace-pre-line">{o.notes}</dd>
                        </div>
                      )}
                    </dl>

                    <div className="mt-3 border-t border-[var(--border-default)] pt-3 text-xs text-[var(--anchor-gray)]">
                      <span className="font-semibold text-[var(--anchor-deep)]">
                        {o.submitter_name || "—"}
                      </span>
                      {o.submitter_company ? ` · ${o.submitter_company}` : ""}
                      {o.submitter_email ? ` · ${o.submitter_email}` : ""}
                      {o.submitter_phone ? ` · ${o.submitter_phone}` : ""}
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
