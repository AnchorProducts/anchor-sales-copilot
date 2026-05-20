"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { AppNavbar } from "@/app/components/ui/AppNavbar";
import { Card } from "@/app/components/ui/Card";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { prettyPagePath } from "@/lib/analytics/pagePath";
import { generateUserActivityPdf } from "@/lib/analytics/userActivityPdf";
import { OemScorecard } from "@/app/components/admin/OemScorecard";
import { DormantUsersPanel } from "@/app/components/admin/DormantUsersPanel";
import { OemHeadToHead } from "@/app/components/admin/OemHeadToHead";
import { OemDirectory } from "@/app/components/admin/OemDirectory";
import { TopOemsBarChart } from "@/app/components/admin/TopOemsBarChart";
import { OemStatusDonut } from "@/app/components/admin/OemStatusDonut";
import {
  HeadlineDetailModal,
  type DetailUserRow,
} from "@/app/components/admin/HeadlineDetailModal";
import {
  generateAllOemsReportPdf,
  generateSingleOemReportPdf,
  type OemReportPayload,
} from "@/lib/analytics/oemReportPdf";

export const dynamic = "force-dynamic";

// ── Types ──────────────────────────────────────────────────────────────────

type UserDailyPoint = { date: string; count: number };

type UserRow = {
  id: string;
  email: string;
  full_name: string | null;
  company: string | null;
  phone: string | null;
  created_at: string | null;
  role: string | null;
  manufacturer: string | null;
  conversationCount: number;
  leadCount: number;
  reports: Array<{ id: string; flags_count: number | null }>;
  events: {
    total7: number;
    total30: number;
    lastSeen: string | null;
    byType: Record<string, number>;
    topPages: Array<{ path: string; count: number }>;
    topClicks: Array<{ label: string; path: string; count: number }>;
    recent: Array<{ created_at: string; event_type: string; page_path: string | null; label: string | null }>;
  };
  dailyEvents: UserDailyPoint[];
};

// ── Helpers ────────────────────────────────────────────────────────────────

function userIsInternal(u: { role?: string | null }) {
  return u.role === "anchor_rep" || u.role === "admin";
}

function fmtRelative(iso: string | null): string {
  if (!iso) return "Never";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return `${Math.floor(d / 7)}w ago`;
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function AdminAnalyticsPage() {
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const { t } = useTranslation();

  const [ready, setReady] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [oemContactCounts, setOemContactCounts] = useState<Record<string, number>>({});

  const [search, setSearch] = useState("");
  const [listTab, setListTab] = useState<"users" | "oems">("users");
  const [detail, setDetail] = useState<
    | { kind: "contributors" }
    | { kind: "active" }
    | { kind: "dormant" }
    | null
  >(null);

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

  // Fetch unified user-activity payload.
  useEffect(() => {
    if (!ready || accessError) return;
    let alive = true;
    (async () => {
      setLoading(true);
      setLoadErr(null);
      const res = await fetch("/api/admin/user-activity?category=all", {
        credentials: "include",
        cache: "no-store",
      });
      const body = await res.json().catch(() => ({}));
      if (!alive) return;
      if (!res.ok) {
        setLoadErr(body?.error || "Failed to load analytics.");
        setLoading(false);
        return;
      }
      setUsers((body?.users ?? []) as UserRow[]);
      setOemContactCounts((body?.oemContactCounts ?? {}) as Record<string, number>);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [ready, accessError]);

  // Headline metrics. Compare this-week totals to a baseline made from the
  // prior 3 weeks (days 8-30). Gives a single +/-% delta that reads naturally.
  const headline = useMemo(() => {
    const total7 = users.reduce((s, u) => s + u.events.total7, 0);
    const total30 = users.reduce((s, u) => s + u.events.total30, 0);
    const priorWeeklyAvg = (total30 - total7) / 3;
    const deltaPct =
      priorWeeklyAvg > 0
        ? Math.round(((total7 - priorWeeklyAvg) / priorWeeklyAvg) * 100)
        : total7 > 0
        ? 100
        : 0;
    const active7 = users.filter((u) => u.events.total7 > 0).length;
    const totalSignedUp = users.length;
    const activeRate = totalSignedUp > 0 ? Math.round((active7 / totalSignedUp) * 100) : 0;
    // Dormant = signed-up users with no events in 14+ days OR never seen.
    const dormant = users.filter((u) => {
      if (!u.events.lastSeen) return true;
      const days = (Date.now() - new Date(u.events.lastSeen).getTime()) / (1000 * 60 * 60 * 24);
      return days > 14;
    }).length;
    return { total7, priorWeeklyAvg, deltaPct, active7, totalSignedUp, activeRate, dormant };
  }, [users]);

  // Per-detail-mode user lists. Computed lazily via memo so each panel only
  // recomputes when relevant data changes.
  const contributorsUsers = useMemo<DetailUserRow[]>(() => {
    return [...users]
      .filter((u) => u.events.total7 > 0)
      .sort((a, b) => b.events.total7 - a.events.total7)
      .slice(0, 15)
      .map((u) => ({
        id: u.id,
        full_name: u.full_name,
        email: u.email,
        role: u.role,
        manufacturer: u.manufacturer,
        events: { total7: u.events.total7, total30: u.events.total30, lastSeen: u.events.lastSeen },
      }));
  }, [users]);

  const activeUsers = useMemo<DetailUserRow[]>(() => {
    return users
      .filter((u) => u.events.total7 > 0)
      .map((u) => ({
        id: u.id,
        full_name: u.full_name,
        email: u.email,
        role: u.role,
        manufacturer: u.manufacturer,
        events: { total7: u.events.total7, total30: u.events.total30, lastSeen: u.events.lastSeen },
      }));
  }, [users]);

  // Filtered + sorted user list for the bottom section.
  const visibleUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matched = q
      ? users.filter((u) => {
          const hay = `${u.full_name ?? ""} ${u.email} ${u.company ?? ""} ${u.manufacturer ?? ""}`.toLowerCase();
          return hay.includes(q);
        })
      : users;
    return [...matched].sort((a, b) => {
      if (b.events.total7 !== a.events.total7) return b.events.total7 - a.events.total7;
      const aT = a.events.lastSeen ? new Date(a.events.lastSeen).getTime() : 0;
      const bT = b.events.lastSeen ? new Date(b.events.lastSeen).getTime() : 0;
      return bT - aT;
    });
  }, [users, search]);

  function downloadUserPdf(u: UserRow) {
    generateUserActivityPdf({
      full_name: u.full_name,
      email: u.email,
      company: u.company,
      phone: u.phone,
      created_at: u.created_at,
      conversationCount: u.conversationCount,
      leadCount: u.leadCount,
      reportCount: u.reports.length,
      events: u.events,
    });
  }

  function buildOemReportPayload(): OemReportPayload {
    return {
      users: users.map((u) => ({
        id: u.id,
        full_name: u.full_name,
        email: u.email,
        manufacturer: u.manufacturer,
        leadCount: u.leadCount,
        events: {
          total7: u.events.total7,
          total30: u.events.total30,
          lastSeen: u.events.lastSeen,
          byType: u.events.byType,
        },
      })),
      oemContactCounts,
    };
  }

  function downloadAllOemsPdf() {
    generateAllOemsReportPdf(buildOemReportPayload());
  }

  function downloadOemPdf(oem: string) {
    generateSingleOemReportPdf(oem, buildOemReportPayload());
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <main className="ds-page">
      <AppNavbar
        title="Analytics"
        subtitle="Compare users, OEMs, and categories"
        menuItems={[
          { label: t("dashboard"), href: "/dashboard" },
          { label: "Admin Console", href: "/admin" },
          { label: "OEM Directory", href: "/admin/manufacturer-contacts" },
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
            {/* Page heading */}
            <header className="mb-6 sm:mb-8">
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Analytics</h1>
              <p className="mt-1 text-sm text-[var(--anchor-gray)] sm:text-base">
                See who’s using the app, how often, and what they’re actually doing.
              </p>
            </header>

            {loadErr && (
              <Card className="mb-4 border-red-200 bg-red-50 p-4 text-sm text-red-700">{loadErr}</Card>
            )}

            {loading ? (
              <Card className="p-5 text-sm text-[var(--anchor-gray)]">Loading analytics…</Card>
            ) : (
              <div className="space-y-10 sm:space-y-12">

                {/* ─── Headline ───────────────────────────────────────────── */}
                <section className="space-y-3 sm:space-y-4">
                  <HeadlineHero
                    total7={headline.total7}
                    deltaPct={headline.deltaPct}
                    onClick={() => setDetail({ kind: "contributors" })}
                  />
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4">
                    <StatPairCard
                      label="Active users this week"
                      value={headline.active7}
                      hint={`of ${headline.totalSignedUp} signed up`}
                      accent={headline.activeRate >= 30 ? "good" : headline.activeRate >= 10 ? "neutral" : "bad"}
                      footer={`${headline.activeRate}% activation`}
                      onClick={() => setDetail({ kind: "active" })}
                    />
                    <StatPairCard
                      label="Dormant users"
                      value={headline.dormant}
                      hint="no activity in 14+ days"
                      accent={headline.dormant === 0 ? "good" : "bad"}
                      footer={headline.dormant > 0 ? "Needs outreach" : "Nobody dormant"}
                      onClick={() => setDetail({ kind: "dormant" })}
                    />
                  </div>
                </section>

                {/* ─── Performance overview ──────────────────────────────── */}
                <section>
                  <SectionHeader
                    title="Performance overview"
                    description="A quick visual scan of who's leading and how OEMs break down by health."
                  />
                  <div className="grid grid-cols-1 gap-4 lg:grid-cols-5 lg:gap-5">
                    <div className="rounded-3xl border border-[var(--border-default)] bg-white p-5 shadow-sm sm:p-6 lg:col-span-3">
                      <div className="mb-4 flex items-baseline justify-between">
                        <div>
                          <h3 className="text-base font-bold text-[var(--anchor-deep)] sm:text-lg">Top OEMs</h3>
                          <p className="text-xs text-[var(--anchor-gray)]">Ranked by events in the last 30 days</p>
                        </div>
                      </div>
                      <TopOemsBarChart
                        users={users.map((u) => ({
                          manufacturer: u.manufacturer,
                          events: { total30: u.events.total30 },
                        }))}
                      />
                    </div>

                    <div className="rounded-3xl border border-[var(--border-default)] bg-white p-5 shadow-sm sm:p-6 lg:col-span-2">
                      <div className="mb-4">
                        <h3 className="text-base font-bold text-[var(--anchor-deep)] sm:text-lg">OEM health mix</h3>
                        <p className="text-xs text-[var(--anchor-gray)]">Every OEM by status — thriving, moderate, at risk, or no signups yet.</p>
                      </div>
                      <OemStatusDonut
                        users={users.map((u) => ({
                          manufacturer: u.manufacturer,
                          leadCount: u.leadCount,
                          events: { total7: u.events.total7, total30: u.events.total30 },
                        }))}
                        oemContactCounts={oemContactCounts}
                      />
                    </div>
                  </div>
                </section>

                {/* ─── Section 1: Where to focus ─────────────────────────── */}
                <section>
                  <SectionHeader
                    title="Where to focus"
                    description="The OEM scorecard for the “Unirac vs Carlisle” conversation. Click any row to drill into top users at that OEM."
                  />
                  <div className="space-y-4 sm:space-y-5">
                    <Card className="p-4 sm:p-5">
                      <div className="mb-3">
                        <h3 className="text-base font-bold text-[var(--anchor-deep)] sm:text-lg">OEM scorecard</h3>
                        <p className="mt-0.5 text-xs text-[var(--anchor-gray)]">
                          One row per OEM. Sort by any column. Default sort: activation % (highest first).
                        </p>
                      </div>
                      <OemScorecard
                        users={users.map((u) => ({
                          id: u.id,
                          full_name: u.full_name,
                          email: u.email,
                          manufacturer: u.manufacturer,
                          conversationCount: u.conversationCount,
                          leadCount: u.leadCount,
                          reports: u.reports,
                          events: {
                            total7: u.events.total7,
                            total30: u.events.total30,
                            lastSeen: u.events.lastSeen,
                          },
                        }))}
                        oemContactCounts={oemContactCounts}
                        onDownloadUserPdf={(id) => {
                          const u = users.find((x) => x.id === id);
                          if (u) downloadUserPdf(u);
                        }}
                        onDownloadAllOems={downloadAllOemsPdf}
                        onDownloadOemPdf={downloadOemPdf}
                      />
                    </Card>

                  </div>
                </section>

                {/* ─── Section 2: Head-to-head compare ───────────────────── */}
                <section>
                  <SectionHeader
                    title="Compare two OEMs"
                    description="Pick any two manufacturers to see them side-by-side. The summary sentence tells you exactly how they stack up."
                  />
                  <Card className="p-4 sm:p-5">
                    <OemHeadToHead
                      users={users.map((u) => ({
                        id: u.id,
                        full_name: u.full_name,
                        email: u.email,
                        manufacturer: u.manufacturer,
                        leadCount: u.leadCount,
                        events: {
                          total7: u.events.total7,
                          total30: u.events.total30,
                          lastSeen: u.events.lastSeen,
                        },
                      }))}
                      oemContactCounts={oemContactCounts}
                      onDownloadUserPdf={(id) => {
                        const u = users.find((x) => x.id === id);
                        if (u) downloadUserPdf(u);
                      }}
                      onDownloadOemPdf={downloadOemPdf}
                    />
                  </Card>
                </section>

                {/* ─── Section 3: Everyone in the system ─────────────────── */}
                <section>
                  <SectionHeader
                    title="Everyone in the system"
                    description="When OEMs sign up, they will show up here."
                  />
                  {/* Users section with OEM Contacts as a sub-view */}
                <Card className="overflow-hidden p-0">
                  <div className="flex flex-col gap-3 border-b border-[var(--border-default)] px-4 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:px-6">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                      <h2 className="text-base font-semibold">Users</h2>
                      <div className="flex gap-1 rounded-full border border-[var(--border-default)] bg-[var(--surface-soft)] p-0.5">
                        {(
                          [
                            { key: "users", label: "All" },
                            { key: "oems", label: "OEM Contacts" },
                          ] as const
                        ).map((tab) => {
                          const active = listTab === tab.key;
                          return (
                            <button
                              key={tab.key}
                              type="button"
                              onClick={() => setListTab(tab.key)}
                              aria-current={active ? "page" : undefined}
                              data-track-id={`analytics-list-tab-${tab.key}`}
                              className={
                                "shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition " +
                                (active
                                  ? "bg-[var(--anchor-deep)] text-white shadow-sm"
                                  : "text-[var(--anchor-gray)] hover:text-[var(--anchor-deep)]")
                              }
                            >
                              {tab.label}
                            </button>
                          );
                        })}
                      </div>
                      {listTab === "users" && (
                        <span className="whitespace-nowrap text-sm font-normal text-[var(--anchor-gray)]">
                          {visibleUsers.length}
                          {search && ` of ${users.length}`}
                        </span>
                      )}
                    </div>
                    {listTab === "users" && (
                      <input
                        type="search"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search name, email, company…"
                        className="ds-input w-full sm:w-auto sm:min-w-[16rem] sm:max-w-xs"
                      />
                    )}
                  </div>

                  {listTab === "oems" ? (
                    <div className="px-4 py-4 sm:px-6 sm:py-5">
                      <OemDirectory />
                    </div>
                  ) : (
                  <>
                  {visibleUsers.length === 0 ? (
                    <div className="px-6 py-14 text-center text-sm text-[var(--anchor-gray)]">
                      No users match the current selection.
                    </div>
                  ) : (
                    <ul className="divide-y divide-[var(--border-default)]">
                      {visibleUsers.map((u) => (
                        <li key={u.id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-6">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                              <span className="truncate text-sm font-semibold text-[var(--anchor-deep)] sm:text-base">
                                {u.full_name || u.email}
                              </span>
                              <span
                                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                                  userIsInternal(u)
                                    ? "bg-[var(--anchor-mint)]/50 text-[var(--anchor-deep)]"
                                    : "bg-[var(--surface-soft)] text-[var(--anchor-gray)]"
                                }`}
                              >
                                {userIsInternal(u) ? "Internal" : "External"}
                              </span>
                              {u.manufacturer && (
                                <span className="rounded-full bg-[var(--surface-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--anchor-deep)]">
                                  {u.manufacturer}
                                </span>
                              )}
                            </div>
                            <div className="mt-0.5 truncate text-xs text-[var(--anchor-gray)]">
                              {u.email}
                              {u.events.lastSeen && ` · last seen ${fmtRelative(u.events.lastSeen)}`}
                            </div>
                            {u.events.topPages.length > 0 && (
                              <div className="mt-1 truncate text-[11px] text-[var(--anchor-gray)]">
                                Top page: {prettyPagePath(u.events.topPages[0].path)}
                              </div>
                            )}
                          </div>
                          <div className="flex shrink-0 items-center justify-between gap-4 sm:justify-end">
                            <div className="flex items-center gap-4 text-center">
                              <Stat label="7d" value={u.events.total7} />
                              <Stat label="30d" value={u.events.total30} />
                              <Stat label="leads" value={u.leadCount} />
                            </div>
                            <button
                              type="button"
                              data-track-id="analytics-user-pdf"
                              onClick={() => downloadUserPdf(u)}
                              className="shrink-0 rounded-lg border border-[var(--anchor-green)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--anchor-green)] transition-colors hover:bg-[var(--anchor-green)] hover:text-white"
                            >
                              PDF
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                  </>
                  )}
                </Card>
                </section>
              </div>
            )}

            {/* Detail modal: dormant gets the rich DormantUsersPanel (OEM filter +
                never-used toggle); contributors/active use the simpler list modal. */}
            <HeadlineDetailModal
              open={detail?.kind === "contributors" || detail?.kind === "active"}
              title={
                detail?.kind === "contributors"
                  ? "Top contributors this week"
                  : "Active users this week"
              }
              subtitle={
                detail?.kind === "contributors"
                  ? "Top 15 by 7-day event count"
                  : "Users with any activity in the last 7 days"
              }
              users={
                detail?.kind === "contributors"
                  ? contributorsUsers
                  : detail?.kind === "active"
                  ? activeUsers
                  : []
              }
              emptyMessage={
                detail?.kind === "contributors"
                  ? "No activity in the last 7 days."
                  : "Nobody has been active this week."
              }
              onClose={() => setDetail(null)}
              onDownloadPdf={(id) => {
                const u = users.find((x) => x.id === id);
                if (u) downloadUserPdf(u);
              }}
            />

            {detail?.kind === "dormant" && (
              <DormantUsersModal
                users={users}
                onClose={() => setDetail(null)}
                onDownloadPdf={(id) => {
                  const u = users.find((x) => x.id === id);
                  if (u) downloadUserPdf(u);
                }}
              />
            )}
          </>
        )}
      </div>
    </main>
  );
}

function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="mb-4 sm:mb-5">
      <h2 className="text-lg font-bold tracking-tight text-[var(--anchor-deep)] sm:text-xl">{title}</h2>
      <p className="mt-0.5 text-xs text-[var(--anchor-gray)] sm:text-sm">{description}</p>
    </div>
  );
}

function Stat({ label, value, suffix = "" }: { label: string; value: number; suffix?: string }) {
  return (
    <div>
      <div className="text-sm font-bold tabular-nums text-[var(--anchor-deep)]">
        {value.toLocaleString()}{suffix}
      </div>
      <div className="text-[10px] uppercase tracking-wide text-[var(--anchor-gray)]">{label}</div>
    </div>
  );
}

// ── Dormant users modal — wraps DormantUsersPanel in modal chrome ─────────

function DormantUsersModal({
  users,
  onClose,
  onDownloadPdf,
}: {
  users: UserRow[];
  onClose: () => void;
  onDownloadPdf?: (id: string) => void;
}) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Dormant users"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-xl sm:max-w-3xl sm:rounded-3xl">
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border-default)] px-5 py-4 sm:px-6">
          <div>
            <h3 className="text-lg font-bold text-[var(--anchor-deep)] sm:text-xl">Who isn’t using the app</h3>
            <p className="mt-0.5 text-xs text-[var(--anchor-gray)] sm:text-sm">
              Signed up but no activity in 14+ days. Filter by OEM to build a call list.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1.5 text-[var(--anchor-gray)] hover:bg-[var(--surface-soft)] hover:text-[var(--anchor-deep)]"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="6" y1="18" x2="18" y2="6" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 sm:px-6">
          <DormantUsersPanel
            users={users.map((u) => ({
              id: u.id,
              full_name: u.full_name,
              email: u.email,
              manufacturer: u.manufacturer,
              role: u.role,
              created_at: u.created_at,
              lastSeen: u.events.lastSeen,
            }))}
            onDownloadPdf={onDownloadPdf}
          />
        </div>

        <div className="flex items-center justify-end border-t border-[var(--border-default)] bg-[var(--surface-soft)] px-5 py-3 sm:px-6">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--border-default)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--anchor-gray)] hover:text-[var(--anchor-deep)]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Headline components ─────────────────────────────────────────────────────

function HeadlineHero({
  total7,
  deltaPct,
  onClick,
}: {
  total7: number;
  deltaPct: number;
  onClick?: () => void;
}) {
  const direction = deltaPct > 0 ? "up" : deltaPct < 0 ? "down" : "flat";
  const arrow =
    direction === "up" ? (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
        <polyline points="17 6 23 6 23 12" />
      </svg>
    ) : direction === "down" ? (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <polyline points="23 18 13.5 8.5 8.5 13.5 1 6" />
        <polyline points="17 18 23 18 23 12" />
      </svg>
    ) : (
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
    );

  const headlineText =
    direction === "up"
      ? `Activity up ${Math.abs(deltaPct)}% this week`
      : direction === "down"
      ? `Activity down ${Math.abs(deltaPct)}% this week`
      : "Activity flat this week";

  return (
    <button
      type="button"
      onClick={onClick}
      data-track-id="headline-hero-open"
      className="group relative block w-full overflow-hidden rounded-3xl bg-gradient-to-br from-[var(--anchor-deep)] to-[#0d3f0c] p-6 text-left text-white shadow-md transition-shadow duration-200 hover:shadow-lg sm:p-8"
    >
      {/* Decorative orb */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-[var(--anchor-green)] opacity-20 blur-2xl"
      />

      <h2 className="relative text-2xl font-bold leading-tight tracking-tight !text-white sm:text-3xl">
        {headlineText}
      </h2>

      <div className="relative mt-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-4xl font-bold tabular-nums !text-white sm:text-5xl">
          {total7.toLocaleString()}
        </span>
        <span className="text-sm text-white/70 sm:text-base">events in the last 7 days</span>
      </div>

      <div className="relative mt-4">
        <span
          className={
            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold " +
            (direction === "up"
              ? "bg-[var(--anchor-green)] text-[var(--anchor-deep)]"
              : direction === "down"
              ? "bg-red-200 text-red-900"
              : "bg-white/15 text-white")
          }
        >
          {arrow}
          {direction === "flat" ? "no change" : `${Math.abs(deltaPct)}% vs prior 3-week avg`}
        </span>
      </div>
    </button>
  );
}

function StatPairCard({
  label,
  value,
  hint,
  footer,
  accent,
  onClick,
}: {
  label: string;
  value: number;
  hint?: string;
  footer?: string;
  accent: "good" | "neutral" | "bad";
  onClick?: () => void;
}) {
  const accentClass =
    accent === "good"
      ? "bg-[var(--anchor-mint)]/60 text-[var(--anchor-deep)]"
      : accent === "bad"
      ? "bg-red-100 text-red-700"
      : "bg-black/5 text-black/55";

  const body = (
    <>
      <div className="text-[11px] font-semibold uppercase tracking-widest text-[var(--anchor-gray)]">
        {label}
      </div>
      <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="text-4xl font-bold tabular-nums text-[var(--anchor-deep)] sm:text-5xl">
          {value.toLocaleString()}
        </span>
        {hint && (
          <span className="text-xs text-[var(--anchor-gray)] sm:text-sm">{hint}</span>
        )}
      </div>
      {footer && (
        <div className={`mt-3 inline-block rounded-full px-2.5 py-1 text-[11px] font-bold ${accentClass}`}>
          {footer}
        </div>
      )}
    </>
  );

  const baseClass = "rounded-3xl border border-[var(--border-default)] bg-white p-5 shadow-sm sm:p-6";

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        data-track-id="headline-stat-open"
        className={`group block w-full text-left transition-shadow duration-200 hover:shadow-md ${baseClass}`}
      >
        {body}
      </button>
    );
  }

  return <div className={baseClass}>{body}</div>;
}
