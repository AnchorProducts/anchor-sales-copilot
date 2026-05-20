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

                {/* ─── Section 1: Where to focus ─────────────────────────── */}
                <section>
                  <SectionHeader
                    title="Where to focus"
                    description="Two views to bring into OEM conversations: who’s doing well, and who isn’t using the app."
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

                    <Card className="p-4 sm:p-5">
                      <div className="mb-3">
                        <h3 className="text-base font-bold text-[var(--anchor-deep)] sm:text-lg">Who isn’t using the app</h3>
                        <p className="mt-0.5 text-xs text-[var(--anchor-gray)]">
                          Signed up but no activity in 14+ days. Filter by OEM to build a call list.
                        </p>
                      </div>
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
                        onDownloadPdf={(id) => {
                          const u = users.find((x) => x.id === id);
                          if (u) downloadUserPdf(u);
                        }}
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
