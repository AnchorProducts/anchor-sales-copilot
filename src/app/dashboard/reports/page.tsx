"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { Navbar, NavbarInner } from "@/app/components/ui/Navbar";
import Button from "@/app/components/ui/Button";
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

type ConversationCount = { user_id: string; count: number };
type LeadCount = { user_id: string; count: number };

type UserRow = ExternalUser & {
  conversationCount: number;
  leadCount: number;
  reports: AssessmentReport[];
};

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
        // Auth + admin gate
        const { data: userData } = await supabase.auth.getUser();
        if (!alive) return;
        const user = userData.user;
        if (!user) { router.replace("/"); return; }

        const { data: prof } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .maybeSingle();

        if (!alive) return;
        if (prof?.role !== "admin") { router.replace("/dashboard"); return; }

        // Fetch all external users
        const { data: extUsers, error: usersErr } = await supabase
          .from("profiles")
          .select("id,email,full_name,company,phone,created_at")
          .eq("user_type", "external")
          .order("created_at", { ascending: false });

        if (usersErr) throw usersErr;
        if (!alive) return;

        const userIds = (extUsers ?? []).map((u: any) => u.id);

        // Conversation counts
        let convCounts: ConversationCount[] = [];
        if (userIds.length > 0) {
          const { data: convData } = await supabase
            .from("conversations")
            .select("user_id")
            .in("user_id", userIds)
            .is("deleted_at", null);
          if (!alive) return;
          const counts: Record<string, number> = {};
          for (const row of convData ?? []) {
            counts[row.user_id] = (counts[row.user_id] ?? 0) + 1;
          }
          convCounts = Object.entries(counts).map(([user_id, count]) => ({ user_id, count }));
        }

        // Lead counts (by user_id column if it exists, else 0)
        let leadCounts: LeadCount[] = [];
        if (userIds.length > 0) {
          const { data: leadData } = await supabase
            .from("leads")
            .select("user_id")
            .in("user_id", userIds);
          if (!alive) return;
          if (leadData) {
            const counts: Record<string, number> = {};
            for (const row of leadData) {
              if (row.user_id) counts[row.user_id] = (counts[row.user_id] ?? 0) + 1;
            }
            leadCounts = Object.entries(counts).map(([user_id, count]) => ({ user_id, count }));
          }
        }

        // Assessment reports
        let reports: AssessmentReport[] = [];
        if (userIds.length > 0) {
          const { data: reportData } = await supabase
            .from("assessment_reports")
            .select("id,contractor_name,company_name,access_type,created_at,file_url,flags_count,user_id")
            .order("created_at", { ascending: false });
          if (!alive) return;
          reports = reportData ?? [];
        }

        // Merge
        const convMap = Object.fromEntries(convCounts.map((c) => [c.user_id, c.count]));
        const leadMap = Object.fromEntries(leadCounts.map((c) => [c.user_id, c.count]));

        const rows: UserRow[] = (extUsers ?? []).map((u: any) => ({
          ...u,
          conversationCount: convMap[u.id] ?? 0,
          leadCount: leadMap[u.id] ?? 0,
          // Match reports by user_id if present, else by company name as fallback
          reports: reports.filter(
            (r) => r.user_id === u.id || (!r.user_id && r.company_name === u.company)
          ),
        }));

        if (!alive) return;
        setUsers(rows);
      } catch (e: any) {
        if (!alive) return;
        setError(e?.message || "Failed to load reports.");
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

  return (
    <main className="ds-page">
      <Navbar>
        <NavbarInner className="flex-col items-start gap-4 py-4">
          <div className="flex w-full items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <img src="/anchorp.svg" alt="Anchor" className="ds-logo shrink-0" />
              <div className="min-w-0 leading-tight">
                <div className="truncate text-sm font-semibold tracking-wide text-white">
                  Anchor Sales Co-Pilot
                </div>
                <div className="truncate text-[12px] text-white/80">External User Reports</div>
              </div>
            </div>
            <Link href="/dashboard">
              <Button variant="ghost" className="h-9 px-3">← Dashboard</Button>
            </Link>
          </div>
        </NavbarInner>
      </Navbar>

      <div className="ds-container py-10 pb-[calc(2rem+env(safe-area-inset-bottom))]">
        {loading && (
          <div className="text-sm text-[var(--anchor-gray)]">Loading…</div>
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
                { label: "External Users", value: users.length },
                { label: "Copilot Sessions", value: totalConvs },
                { label: "Project Leads", value: totalLeads },
                { label: "DT Assessments", value: totalReports },
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
                <h2 className="text-base font-semibold">External Users</h2>
              </div>

              {users.length === 0 && (
                <div className="px-6 py-10 text-center text-sm text-[var(--anchor-gray)]">
                  No external users yet.
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
                          <div className="text-sm font-semibold text-[var(--anchor-deep)]">{u.conversationCount}</div>
                          <div className="text-[11px] text-[var(--anchor-gray)]">Sessions</div>
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-[var(--anchor-deep)]">{u.leadCount}</div>
                          <div className="text-[11px] text-[var(--anchor-gray)]">Leads</div>
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-[var(--anchor-deep)]">{u.reports.length}</div>
                          <div className="text-[11px] text-[var(--anchor-gray)]">Reports</div>
                        </div>
                        <div className="text-xs text-[var(--anchor-gray)]">
                          Joined {fmt(u.created_at)}
                        </div>
                      </div>
                      <span className="ml-2 shrink-0 text-[var(--anchor-gray)]">
                        {expanded === u.id ? "▲" : "▼"}
                      </span>
                    </button>

                    {/* Expanded: assessment reports */}
                    {expanded === u.id && (
                      <div className="border-t border-[var(--border)] bg-[var(--surface-soft)] px-6 py-4">
                        <div className="mb-3 flex items-center gap-3 text-xs font-semibold uppercase tracking-wider text-[var(--anchor-gray)]">
                          <span>Rooftop Assessment Reports</span>
                          {u.phone && <span className="font-normal normal-case">· {u.phone}</span>}
                        </div>

                        {u.reports.length === 0 ? (
                          <p className="text-sm text-[var(--anchor-gray)]">No assessment reports yet.</p>
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
                                    <span className="capitalize">{r.access_type || "Unknown access"}</span>
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
                                    View PDF
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
