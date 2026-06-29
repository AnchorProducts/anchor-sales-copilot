"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { AppNavbar } from "@/app/components/ui/AppNavbar";
import { Card } from "@/app/components/ui/Card";
import { Input } from "@/app/components/ui/Field";
import { Alert } from "@/app/components/ui/Alert";
import { useTranslation } from "@/lib/i18n/useTranslation";

export const dynamic = "force-dynamic";

type Report = {
  id: string;
  contractor_name: string | null;
  company_name: string | null;
  access_type: string | null;
  created_at: string | null;
  file_url: string | null;
  flags_count: number | null;
  user_id: string | null;
  submitter_email: string | null;
  submitter_name: string | null;
  submitter_company: string | null;
};

function formatDate(s: string | null) {
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

export default function AdminRooftopReportsPage() {
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const { t } = useTranslation();

  const [ready, setReady] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [query, setQuery] = useState("");

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

      const role = String((prof as any)?.role || "");
      if (role !== "admin") {
        setAccessError("Admin access only.");
        setReady(true);
        return;
      }

      const res = await fetch("/api/admin/rooftop-reports", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!alive) return;
      if (!res.ok) {
        setLoadErr(json?.error || "Failed to load reports.");
      } else {
        setReports(json?.reports || []);
      }
      setReady(true);
    })();
    return () => { alive = false; };
  }, [router, supabase]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return reports;
    return reports.filter((r) => {
      const haystack = [
        r.contractor_name,
        r.company_name,
        r.submitter_name,
        r.submitter_email,
        r.submitter_company,
        r.access_type,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [reports, query]);

  return (
    <main className="ds-page">
      <AppNavbar
        title="Rooftop Reports"
        subtitle="Admin · OSHA assessment submissions"
        menuItems={[{ label: "Admin", href: "/admin" }]}
      />

      <div className="ds-container py-6 pb-[calc(2rem+env(safe-area-inset-bottom))] sm:py-10">
        <div className="mx-auto max-w-5xl space-y-5">
          {!ready ? (
            <Card className="p-5 text-sm text-black/60">{t("loading")}</Card>
          ) : accessError ? (
            <Card className="border-[var(--anchor-deep)]/25 bg-[var(--anchor-mint)] p-5 text-sm text-[var(--anchor-deep)]">
              {accessError}
            </Card>
          ) : (
            <>
              <Card className="border-t-4 border-t-[var(--anchor-green)] p-5">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-black">All Rooftop Assessments</div>
                    <div className="mt-1 text-[12px] text-[var(--anchor-gray)]">
                      {reports.length} total · {filtered.length} shown
                    </div>
                  </div>
                  <div className="w-full sm:w-72">
                    <Input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search contractor, company, submitter…"
                      className="h-10 px-3 text-sm"
                    />
                  </div>
                </div>

                {loadErr && <Alert tone="error" className="mt-3">{loadErr}</Alert>}

                {filtered.length === 0 && !loadErr ? (
                  <div className="mt-4 rounded-lg border border-black/10 bg-[var(--surface-soft)] p-4 text-sm text-[var(--anchor-gray)]">
                    {reports.length === 0 ? "No reports yet." : "No reports match your search."}
                  </div>
                ) : (
                  <div className="mt-4 grid gap-3">
                    {filtered.map((r) => (
                      <div
                        key={r.id}
                        className="rounded-xl border border-black/10 bg-white p-4 text-sm"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="break-words font-semibold">
                              {r.contractor_name || "Unknown contractor"}
                              {r.company_name ? ` · ${r.company_name}` : ""}
                            </div>
                            <div className="mt-0.5 text-[12px] text-[var(--anchor-gray)]">
                              {formatDate(r.created_at)}
                              {r.access_type ? ` · ${r.access_type}` : ""}
                            </div>
                            <div className="mt-1 break-words text-[12px] text-[var(--anchor-gray)]">
                              Submitted by:{" "}
                              {r.submitter_name || r.submitter_email || "Unknown"}
                              {r.submitter_company ? ` (${r.submitter_company})` : ""}
                            </div>
                            <div className="mt-1 text-[12px]">
                              {(r.flags_count ?? 0) > 0 ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 font-semibold text-[#B45309]">
                                  {r.flags_count} flag{r.flags_count === 1 ? "" : "s"}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-full bg-[var(--surface-soft)] px-2 py-0.5 text-[var(--anchor-gray)]">
                                  No flags
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="shrink-0">
                            {r.file_url ? (
                              <a
                                href={r.file_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex h-9 w-full items-center justify-center rounded-md border border-black/10 bg-white px-3 text-[12px] font-semibold text-[var(--anchor-green)] hover:bg-[var(--surface-soft)] sm:w-auto"
                              >
                                View PDF
                              </a>
                            ) : (
                              <span className="text-[11px] text-[var(--anchor-gray)]">No file</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
