"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { AppNavbar } from "@/app/components/ui/AppNavbar";
import { Card } from "@/app/components/ui/Card";
import { useTranslation } from "@/lib/i18n/useTranslation";

export const dynamic = "force-dynamic";

type Claim = {
  id: string;
  created_at: string;
  created_by: string;
  status: string;
  rep_name: string | null;
  rep_company: string | null;
  rep_phone: string | null;
  rep_email: string | null;
  certified: boolean;
  unaware_other_salesperson: string | null;
  additional_salespeople: string | null;
  estimated_order_date: string | null;
  job_name: string | null;
  company_placing_order: string;
  order_city: string | null;
  order_state: string | null;
  u_anchors_ordered: string | null;
  qty: string | null;
  roof_type: string | null;
  roof_brand: string | null;
  other_items: string | null;
  ship_to_address: string | null;
  ship_city: string | null;
  ship_state: string | null;
  ship_zip: string | null;
  project_description: string | null;
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  });
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric",
    hour: "numeric", minute: "2-digit",
  });
}

export default function AdminCommissionClaimsPage() {
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const { t } = useTranslation();

  const [ready, setReady] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);

  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  // Admin gate.
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!alive) return;
      if (!data.user) { router.replace("/"); return; }
      const { data: prof } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.user.id)
        .maybeSingle();
      if (!alive) return;
      const role = String((prof as { role?: string } | null)?.role || "");
      if (role !== "admin") setAccessError("Admin access only.");
      setReady(true);
    })();
    return () => { alive = false; };
  }, [router, supabase]);

  useEffect(() => {
    if (!ready || accessError) return;
    let alive = true;
    (async () => {
      setLoading(true);
      setLoadErr(null);
      const res = await fetch("/api/admin/commission-claims", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!alive) return;
      if (!res.ok) {
        setLoadErr(json?.error || "Failed to load claims.");
        setLoading(false);
        return;
      }
      setClaims((json?.claims || []) as Claim[]);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [ready, accessError]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return claims;
    return claims.filter((c) => {
      const hay = [
        c.rep_name,
        c.rep_company,
        c.rep_email,
        c.company_placing_order,
        c.job_name,
        c.roof_brand,
        c.order_city,
        c.order_state,
      ]
        .map((v) => (v || "").toLowerCase())
        .join(" ");
      return hay.includes(q);
    });
  }, [claims, search]);

  return (
    <main className="ds-page">
      <AppNavbar
        title="Commission Claims"
        subtitle="Submitted claims from external reps"
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
            <header className="mb-5 sm:mb-6">
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Commission Claims</h1>
              <p className="mt-1 text-sm text-[var(--anchor-gray)]">
                Every claim submitted by external reps. Click any row to see the full form.
              </p>
            </header>

            {loadErr && (
              <Card className="mb-4 border-red-200 bg-red-50 p-4 text-sm text-red-700">{loadErr}</Card>
            )}

            <Card className="overflow-hidden p-0">
              <div className="flex flex-col gap-3 border-b border-[var(--border-default)] px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
                <div>
                  <h2 className="text-base font-semibold">
                    {filtered.length}{search && ` of ${claims.length}`} claim{filtered.length === 1 ? "" : "s"}
                  </h2>
                </div>
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search rep, company, job…"
                  className="ds-input w-full sm:w-auto sm:min-w-[18rem] sm:max-w-sm"
                />
              </div>

              {loading ? (
                <div className="px-6 py-14 text-center text-sm text-[var(--anchor-gray)]">Loading…</div>
              ) : filtered.length === 0 ? (
                <div className="px-6 py-14 text-center text-sm text-[var(--anchor-gray)]">
                  {claims.length === 0
                    ? "No commission claims have been submitted yet."
                    : "No claims match your search."}
                </div>
              ) : (
                <ul className="divide-y divide-[var(--border-default)]">
                  {filtered.map((c) => {
                    const open = expanded === c.id;
                    return (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => setExpanded(open ? null : c.id)}
                          aria-expanded={open}
                          className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--surface-soft)] sm:px-6 sm:py-4"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                              <span className="truncate text-sm font-semibold text-[var(--anchor-deep)] sm:text-base">
                                {c.company_placing_order}
                              </span>
                              {c.job_name && (
                                <span className="truncate text-xs text-[var(--anchor-gray)]">
                                  · {c.job_name}
                                </span>
                              )}
                              <span className="rounded-full bg-[var(--surface-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--anchor-deep)]">
                                {c.status || "submitted"}
                              </span>
                            </div>
                            <div className="mt-0.5 truncate text-xs text-[var(--anchor-gray)]">
                              Rep: {c.rep_name || c.rep_email || "—"}
                              {c.rep_company && ` · ${c.rep_company}`}
                              {(c.order_city || c.order_state) && ` · ${[c.order_city, c.order_state].filter(Boolean).join(", ")}`}
                            </div>
                          </div>
                          <div className="shrink-0 text-right text-[11px] text-[var(--anchor-gray)]">
                            {fmtDate(c.created_at)}
                          </div>
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={2}
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className={`h-5 w-5 shrink-0 text-[var(--anchor-gray)] transition-transform ${open ? "rotate-180" : ""}`}
                            aria-hidden
                          >
                            <polyline points="6 9 12 15 18 9" />
                          </svg>
                        </button>

                        {open && (
                          <div className="border-t border-[var(--border-default)] bg-[var(--surface-soft)] px-4 py-4 sm:px-6 sm:py-5">
                            <div className="grid gap-4 sm:grid-cols-2">
                              <Section title="Rep">
                                <Field label="Name" value={c.rep_name} />
                                <Field label="Company" value={c.rep_company} />
                                <Field label="Phone" value={c.rep_phone} />
                                <Field label="Email" value={c.rep_email} mono />
                                <Field label="Submitted" value={fmtDateTime(c.created_at)} />
                              </Section>

                              <Section title="Certification">
                                <Field label="Certified" value={c.certified ? "Yes" : "No"} />
                                <Field
                                  label="Sole salesperson"
                                  value={
                                    c.unaware_other_salesperson === "yes"
                                      ? "Yes — sole salesperson"
                                      : c.unaware_other_salesperson === "no"
                                      ? "No — others involved"
                                      : "—"
                                  }
                                />
                                {c.additional_salespeople && (
                                  <Field label="Additional reps" value={c.additional_salespeople} />
                                )}
                              </Section>

                              <Section title="Order">
                                <Field label="Job name" value={c.job_name} />
                                <Field label="Estimated order date" value={fmtDate(c.estimated_order_date)} />
                                <Field
                                  label="Order city/state"
                                  value={[c.order_city, c.order_state].filter(Boolean).join(", ") || null}
                                />
                                <Field label="U-Anchors ordered" value={c.u_anchors_ordered} />
                                <Field label="Quantity" value={c.qty} />
                                <Field label="Roof type" value={c.roof_type} />
                                <Field label="Roof brand" value={c.roof_brand} />
                                <Field label="Other items" value={c.other_items} />
                              </Section>

                              <Section title="Ship to">
                                <Field label="Address" value={c.ship_to_address} />
                                <Field
                                  label="City/State/Zip"
                                  value={
                                    [c.ship_city, c.ship_state, c.ship_zip].filter(Boolean).join(", ") || null
                                  }
                                />
                              </Section>

                              {c.project_description && (
                                <div className="sm:col-span-2">
                                  <Section title="Project description">
                                    <p className="text-sm text-[var(--text-primary)]">{c.project_description}</p>
                                  </Section>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </>
        )}
      </div>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--border-default)] bg-white p-4">
      <div className="ds-caption mb-2">{title}</div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function Field({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1 text-sm">
      <span className="shrink-0 text-[11px] uppercase tracking-wide text-[var(--anchor-gray)]">
        {label}
      </span>
      <span
        className={`min-w-0 truncate text-right ${mono ? "font-mono text-xs" : ""}`}
        title={value || undefined}
      >
        {value || <span className="text-[var(--anchor-gray)]">—</span>}
      </span>
    </div>
  );
}
