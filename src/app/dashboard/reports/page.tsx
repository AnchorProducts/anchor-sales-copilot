"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { AppNavbar } from "@/app/components/ui/AppNavbar";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { Card } from "@/app/components/ui/Card";

export const dynamic = "force-dynamic";

type ExternalUser = {
  id: string;
  email: string;
  full_name: string | null;
  company: string | null;
  phone: string | null;
  created_at: string | null;
};

type AssessmentReport = {
  id: string;
  contractor_name: string;
  company_name: string;
  access_type: string;
  created_at: string;
  file_url: string;
  flags_count: number;
  user_id?: string;
};

type UserEvents = {
  total7: number;
  total30: number;
  lastSeen: string | null;
  byType: Record<string, number>;
  topPages: Array<{ path: string; count: number }>;
};

type UserRow = ExternalUser & {
  conversationCount: number;
  leadCount: number;
  reports: AssessmentReport[];
  events: UserEvents;
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  page_view: "Page views",
  chat_message_sent: "Chat messages",
  lead_submitted: "Leads submitted",
  commission_submitted: "Commission claims",
  notable_project_submitted: "Notable projects",
  doc_opened: "Docs opened",
};

function eventTypeLabel(t: string) {
  return EVENT_TYPE_LABELS[t] ?? t.replace(/_/g, " ");
}

function fmt(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fmtDateTime(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function ReportsPage() {
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const { data: userData } = await supabase.auth.getUser();
        if (!alive) return;
        if (!userData.user) { router.replace("/"); return; }

        const res = await fetch("/api/admin/user-activity", {
          credentials: "include",
          cache: "no-store",
        });
        if (!alive) return;

        if (res.status === 401) { router.replace("/"); return; }
        if (res.status === 403) { router.replace("/dashboard"); return; }

        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body?.error || "Failed to load reports.");

        if (!alive) return;
        setUsers((body?.users ?? []) as UserRow[]);
      } catch (e: unknown) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "Failed to load reports.");
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();

    return () => { alive = false; };
  }, [supabase, router]);

  const totalReports = users.reduce((s, u) => s + u.reports.length, 0);
  const totalConvs   = users.reduce((s, u) => s + u.conversationCount, 0);
  const totalLeads   = users.reduce((s, u) => s + u.leadCount, 0);

  const { t } = useTranslation();
  return (
    <main className="ds-page">
      <AppNavbar
        title={t("anchorSalesCoPilot")}
        subtitle={t("externalUserReports")}
        menuItems={[{ label: t("dashboard"), href: "/dashboard" }]}
      />

      <div className="ds-container py-10 pb-[calc(2rem+env(safe-area-inset-bottom))]">
        {loading && (
          <div className="text-sm text-[var(--anchor-gray)]">{t("loading")}</div>
        )}

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {!loading && !error && (
          <>
            {/* Summary stats */}
            <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
              {[
                { label: t("externalUsers"), value: users.length },
                { label: t("copilotSessions"), value: totalConvs },
                { label: t("projectLeads"), value: totalLeads },
                { label: t("dtAssessments"), value: totalReports },
              ].map((s) => (
                <Card key={s.label} className="p-5 text-center">
                  <div className="text-3xl font-bold text-[var(--anchor-deep)]">{s.value}</div>
                  <div className="mt-1 text-xs font-medium text-[var(--anchor-gray)]">{s.label}</div>
                </Card>
              ))}
            </div>

            {/* Per-user table */}
            <Card className="overflow-hidden p-0">
              <div className="border-b border-[var(--border)] px-6 py-4">
                <h2 className="text-base font-semibold">{t("externalUsers")}</h2>
              </div>

              {users.length === 0 && (
                <div className="px-6 py-10 text-center text-sm text-[var(--anchor-gray)]">
                  {t("noExternalUsers")}
                </div>
              )}

              <div className="divide-y divide-[var(--border)]">
                {users.map((u) => (
                  <div key={u.id}>
                    {/* User row */}
                    <button
                      type="button"
                      onClick={() => setExpanded(expanded === u.id ? null : u.id)}
                      className="flex w-full items-center justify-between gap-4 px-6 py-4 text-left transition-colors hover:bg-[var(--surface-soft)]"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold text-[var(--anchor-deep)]">
                          {u.full_name || u.email}
                        </div>
                        <div className="truncate text-xs text-[var(--anchor-gray)]">
                          {u.company ? `${u.company} · ` : ""}{u.email}
                        </div>
                      </div>
                      <div className="hidden shrink-0 items-center gap-6 text-center sm:flex">
                        <div>
                          <div className="text-sm font-semibold text-[var(--anchor-deep)]">{u.events.total7}</div>
                          <div className="text-[11px] text-[var(--anchor-gray)]">7-day events</div>
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-[var(--anchor-deep)]">{u.conversationCount}</div>
                          <div className="text-[11px] text-[var(--anchor-gray)]">{t("sessions")}</div>
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-[var(--anchor-deep)]">{u.leadCount}</div>
                          <div className="text-[11px] text-[var(--anchor-gray)]">{t("leads")}</div>
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-[var(--anchor-deep)]">{u.reports.length}</div>
                          <div className="text-[11px] text-[var(--anchor-gray)]">{t("reportsTab")}</div>
                        </div>
                        <div className="text-xs text-[var(--anchor-gray)]">
                          {u.events.lastSeen ? `Last seen ${fmt(u.events.lastSeen)}` : `${t("joined")} ${fmt(u.created_at)}`}
                        </div>
                      </div>
                      <span className="ml-2 shrink-0 text-[var(--anchor-gray)]">
                        {expanded === u.id ? "▲" : "▼"}
                      </span>
                    </button>

                    {/* Expanded: events + assessment reports */}
                    {expanded === u.id && (
                      <div className="border-t border-[var(--border)] bg-[var(--surface-soft)] px-6 py-4">
                        <div className="ds-caption mb-3 flex items-center gap-3">
                          <span>Activity (last 30 days)</span>
                          <span className="font-normal normal-case">
                            · {u.events.total30} events · {u.events.total7} in past 7d
                          </span>
                          {u.events.lastSeen && (
                            <span className="font-normal normal-case">
                              · last seen {fmtDateTime(u.events.lastSeen)}
                            </span>
                          )}
                        </div>

                        {u.events.total30 === 0 ? (
                          <p className="mb-4 text-sm text-[var(--anchor-gray)]">No activity recorded.</p>
                        ) : (
                          <div className="mb-5 grid gap-4 sm:grid-cols-2">
                            <div className="rounded-xl border border-[var(--border)] bg-white p-4">
                              <div className="ds-caption mb-2">Event breakdown</div>
                              <ul className="space-y-1 text-sm">
                                {Object.entries(u.events.byType)
                                  .sort((a, b) => b[1] - a[1])
                                  .map(([type, count]) => (
                                    <li key={type} className="flex justify-between gap-3">
                                      <span className="text-[var(--anchor-deep)]">{eventTypeLabel(type)}</span>
                                      <span className="font-semibold text-[var(--anchor-deep)]">{count}</span>
                                    </li>
                                  ))}
                              </ul>
                            </div>
                            <div className="rounded-xl border border-[var(--border)] bg-white p-4">
                              <div className="ds-caption mb-2">Top pages</div>
                              {u.events.topPages.length === 0 ? (
                                <div className="text-sm text-[var(--anchor-gray)]">—</div>
                              ) : (
                                <ul className="space-y-1 text-sm">
                                  {u.events.topPages.map((p) => (
                                    <li key={p.path} className="flex justify-between gap-3">
                                      <span className="truncate text-[var(--anchor-deep)]" title={p.path}>{p.path}</span>
                                      <span className="font-semibold text-[var(--anchor-deep)]">{p.count}</span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                            </div>
                          </div>
                        )}

                        <div className="ds-caption mb-3 flex items-center gap-3">
                          <span>{t("rooftopAssessmentReports")}</span>
                          {u.phone && <span className="font-normal normal-case">· {u.phone}</span>}
                        </div>

                        {u.reports.length === 0 ? (
                          <p className="text-sm text-[var(--anchor-gray)]">{t("noAssessmentReports")}</p>
                        ) : (
                          <div className="flex flex-col gap-3">
                            {u.reports.map((r) => (
                              <div
                                key={r.id}
                                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-white px-4 py-3"
                              >
                                <div className="min-w-0">
                                  <div className="text-sm font-semibold text-[var(--anchor-deep)]">
                                    {r.contractor_name || "—"} · {r.company_name || "—"}
                                  </div>
                                  <div className="mt-0.5 flex flex-wrap gap-2 text-xs text-[var(--anchor-gray)]">
                                    <span className="capitalize">{r.access_type || t("unknownAccess")}</span>
                                    <span>·</span>
                                    <span>{fmtDateTime(r.created_at)}</span>
                                    {r.flags_count > 0 && (
                                      <>
                                        <span>·</span>
                                        <span className="font-semibold text-amber-600">
                                          {r.flags_count} flag{r.flags_count !== 1 ? "s" : ""}
                                        </span>
                                      </>
                                    )}
                                  </div>
                                </div>
                                {r.file_url && (
                                  <a
                                    href={r.file_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="shrink-0 rounded-lg border border-[var(--anchor-green)] px-3 py-1.5 text-xs font-semibold text-[var(--anchor-green)] transition-colors hover:bg-[var(--anchor-green)] hover:text-white"
                                  >
                                    {t("viewPdf")}
                                  </a>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Card>
          </>
        )}
      </div>
    </main>
  );
}
