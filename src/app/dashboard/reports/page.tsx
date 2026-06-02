"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { AppNavbar } from "@/app/components/ui/AppNavbar";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { Card } from "@/app/components/ui/Card";
import { generateUserActivityPdf } from "@/lib/analytics/userActivityPdf";
import { generateCategorySummaryPdf } from "@/lib/analytics/categoryActivityPdf";
import { prettyPagePath } from "@/lib/analytics/pagePath";
import { APP_NAME } from "@/lib/appMode";

export const dynamic = "force-dynamic";

type ActivityCategory = "internal" | "external" | "manufacturer";

const CATEGORY_META: Record<ActivityCategory, {
  title: string;
  subtitle: string;
  description: string;
  emptyKey: "noExternalUsers" | "noInternalUsers" | "noManufacturerUsers";
}> = {
  external: {
    title: "External Reps Activity",
    subtitle: "External user activity",
    description: "What every external rep is doing, across sessions, leads, and assessments.",
    emptyKey: "noExternalUsers",
  },
  internal: {
    title: "Internal Users Activity",
    subtitle: "Internal user activity",
    description: "What every Anchor employee (anchor_rep + admin) is doing across the app.",
    emptyKey: "noInternalUsers",
  },
  manufacturer: {
    title: "Manufacturer Users Activity",
    subtitle: "Manufacturer user activity",
    description: "Activity for manufacturer contacts who have signed up for the app.",
    emptyKey: "noManufacturerUsers",
  },
};

function parseCategory(value: string | null): ActivityCategory {
  if (value === "internal" || value === "manufacturer") return value;
  return "external";
}

type ExternalUser = {
  id: string;
  email: string;
  full_name: string | null;
  company: string | null;
  phone: string | null;
  created_at: string | null;
  manufacturer?: string | null;
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

type ClickAggregate = { label: string; path: string; count: number };
type RecentEvent = {
  created_at: string;
  event_type: string;
  page_path: string | null;
  label: string | null;
};

type UserEvents = {
  total7: number;
  total30: number;
  lastSeen: string | null;
  byType: Record<string, number>;
  topPages: Array<{ path: string; count: number }>;
  topClicks: ClickAggregate[];
  recent: RecentEvent[];
};

type UserRow = ExternalUser & {
  conversationCount: number;
  leadCount: number;
  reports: AssessmentReport[];
  events: UserEvents;
};

type SortKey = "active" | "newest" | "leads" | "sessions";

type DailyEvent = { date: string; count: number };
type ChartsPayload = {
  dailyEvents: DailyEvent[];
  eventsByType: Record<string, number>;
};

const EVENT_TYPE_LABELS: Record<string, string> = {
  login: "Logins",
  app_open: "App opens",
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

function fmtShortDate(iso: string): string {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function relativeTime(iso: string | null): string {
  if (!iso) return "Never";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

function initials(name: string | null, email: string): string {
  const source = (name && name.trim()) || email;
  const parts = source.split(/[\s@.]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

function avatarColor(seed: string): string {
  // Deterministic color from a small palette tied to the design tokens.
  const palette = ["#11500F", "#047835", "#4A8F3E", "#1D6B4A", "#2F7F5C", "#7BB87B"];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = (hash * 31 + seed.charCodeAt(i)) | 0;
  return palette[Math.abs(hash) % palette.length];
}

function CategoryAnalyticsView({ category }: { category: ActivityCategory }) {
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);

  const meta = CATEGORY_META[category];

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [charts, setCharts] = useState<ChartsPayload>({ dailyEvents: [], eventsByType: {} });
  const [expanded, setExpanded] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("active");

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const { data: userData } = await supabase.auth.getUser();
        if (!alive) return;
        if (!userData.user) { router.replace("/"); return; }

        const res = await fetch(`/api/admin/user-activity?category=${category}`, {
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
        setCharts({
          dailyEvents: (body?.charts?.dailyEvents ?? []) as DailyEvent[],
          eventsByType: (body?.charts?.eventsByType ?? {}) as Record<string, number>,
        });
      } catch (e: unknown) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "Failed to load reports.");
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();

    return () => { alive = false; };
  }, [supabase, router, category]);

  const totalReports = users.reduce((s, u) => s + u.reports.length, 0);
  const totalConvs   = users.reduce((s, u) => s + u.conversationCount, 0);
  const totalLeads   = users.reduce((s, u) => s + u.leadCount, 0);
  const total7Events = users.reduce((s, u) => s + u.events.total7, 0);
  const activeUsers  = users.filter((u) => u.events.total7 > 0).length;
  const maxActivity  = Math.max(1, ...users.map((u) => u.events.total7));

  const total30Events = charts.dailyEvents.reduce((s, d) => s + d.count, 0);
  const peakDay = charts.dailyEvents.reduce(
    (acc, d) => (d.count > acc.count ? d : acc),
    { date: "", count: 0 }
  );

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matched = q
      ? users.filter((u) => {
          return (
            (u.full_name ?? "").toLowerCase().includes(q) ||
            (u.email ?? "").toLowerCase().includes(q) ||
            (u.company ?? "").toLowerCase().includes(q)
          );
        })
      : users;

    const sorted = [...matched];
    switch (sortKey) {
      case "active":
        sorted.sort((a, b) => {
          if (b.events.total7 !== a.events.total7) return b.events.total7 - a.events.total7;
          const aT = a.events.lastSeen ? new Date(a.events.lastSeen).getTime() : 0;
          const bT = b.events.lastSeen ? new Date(b.events.lastSeen).getTime() : 0;
          return bT - aT;
        });
        break;
      case "newest":
        sorted.sort((a, b) => {
          const aT = a.created_at ? new Date(a.created_at).getTime() : 0;
          const bT = b.created_at ? new Date(b.created_at).getTime() : 0;
          return bT - aT;
        });
        break;
      case "leads":
        sorted.sort((a, b) => b.leadCount - a.leadCount);
        break;
      case "sessions":
        sorted.sort((a, b) => b.conversationCount - a.conversationCount);
        break;
    }
    return sorted;
  }, [users, search, sortKey]);

  const { t } = useTranslation();

  return (
    <>
      {/* Page heading */}
      <header className="mb-6 flex flex-col gap-3 sm:mb-8 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{meta.title}</h1>
            <p className="mt-1 text-sm text-[var(--anchor-gray)]">
              {meta.description}
            </p>
          </div>
          <button
            type="button"
            data-track-id="category-summary-pdf"
            disabled={loading || users.length === 0}
            onClick={() =>
              generateCategorySummaryPdf({
                category,
                users: users.map((u) => ({
                  full_name: u.full_name,
                  email: u.email,
                  company: u.company,
                  manufacturer: u.manufacturer ?? null,
                  conversationCount: u.conversationCount,
                  leadCount: u.leadCount,
                  reports: u.reports,
                  events: {
                    total7: u.events.total7,
                    total30: u.events.total30,
                    lastSeen: u.events.lastSeen,
                    byType: u.events.byType,
                    topPages: u.events.topPages,
                  },
                })),
                charts,
              })
            }
            className="inline-flex shrink-0 items-center justify-center gap-1.5 self-start rounded-lg border border-[var(--anchor-green)] bg-white px-3 py-2 text-xs font-semibold text-[var(--anchor-green)] transition-colors hover:bg-[var(--anchor-green)] hover:text-white disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Download summary PDF
          </button>
        </header>

        {loading && <StatsSkeleton />}

        {error && (
          <Card className="border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </Card>
        )}

        {!loading && !error && (
          <>
            {/* Hero stats */}
            <section className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
              <StatCard
                label="Active (7d)"
                value={activeUsers}
                hint={`${users.length} total`}
                accent="bg-[var(--anchor-mint)]/40 text-[var(--anchor-deep)]"
              />
              <StatCard
                label="Events (7d)"
                value={total7Events}
                hint={`${totalConvs} sessions`}
              />
              <StatCard
                label="Leads"
                value={totalLeads}
                hint="all time"
              />
              <StatCard
                label="Assessments"
                value={totalReports}
                hint="rooftop reports"
              />
            </section>

            {/* Charts */}
            <section className="mb-6 grid gap-3 sm:gap-4 md:grid-cols-3">
              <Card className="p-4 sm:p-5 md:col-span-2">
                <div className="mb-3 flex items-baseline justify-between gap-3">
                  <div>
                    <div className="ds-caption">Activity · last 30 days</div>
                    <div className="text-xs text-[var(--anchor-gray)]">
                      {total30Events.toLocaleString()} events total
                    </div>
                  </div>
                  <div className="text-right text-xs text-[var(--anchor-gray)]">
                    Peak {peakDay.count.toLocaleString()} on {fmtShortDate(peakDay.date)}
                  </div>
                </div>
                <DailyEventsChart data={charts.dailyEvents} />
              </Card>
              <Card className="p-4 sm:p-5">
                <div className="ds-caption mb-3">Event mix · last 30 days</div>
                <EventMixChart data={charts.eventsByType} />
              </Card>
            </section>

            {/* Controls */}
            <section className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div data-tutorial="reports-search" className="relative flex-1 sm:max-w-md">
                <svg
                  className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[var(--anchor-gray)]"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <circle cx="11" cy="11" r="7" />
                  <path d="M21 21l-4-4" />
                </svg>
                <input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search by name, email, or company"
                  aria-label="Search users"
                  className="ds-input w-full !pl-11"
                />
              </div>

              <div data-tutorial="reports-sort" className="flex flex-wrap items-center gap-1.5">
                <SortPill active={sortKey === "active"} onClick={() => setSortKey("active")}>Most active</SortPill>
                <SortPill active={sortKey === "newest"} onClick={() => setSortKey("newest")}>Newest</SortPill>
                <SortPill active={sortKey === "leads"} onClick={() => setSortKey("leads")}>Top leads</SortPill>
                <SortPill active={sortKey === "sessions"} onClick={() => setSortKey("sessions")}>Top sessions</SortPill>
              </div>
            </section>

            {/* User list */}
            <Card data-tutorial="reports-list" className="overflow-hidden p-0">
              <div className="flex items-center justify-between border-b border-[var(--border-default)] px-4 py-3 sm:px-6">
                <h2 className="text-base font-semibold">
                  Users
                  <span className="ml-2 text-sm font-normal text-[var(--anchor-gray)]">
                    {filteredUsers.length}
                    {search && ` of ${users.length}`}
                  </span>
                </h2>
              </div>

              {filteredUsers.length === 0 && (
                <div className="px-6 py-14 text-center text-sm text-[var(--anchor-gray)]">
                  {search
                    ? "No users match this search."
                    : category === "external"
                    ? t("noExternalUsers")
                    : category === "internal"
                    ? "No internal users found."
                    : "No manufacturer users have signed up yet."}
                </div>
              )}

              <ul className="divide-y divide-[var(--border-default)]">
                {filteredUsers.map((u) => {
                  const isOpen = expanded === u.id;
                  const pct = Math.min(100, Math.round((u.events.total7 / maxActivity) * 100));
                  return (
                    <li key={u.id}>
                      <button
                        type="button"
                        onClick={() => setExpanded(isOpen ? null : u.id)}
                        aria-expanded={isOpen}
                        className="group flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--surface-soft)] sm:items-center sm:gap-4 sm:px-6 sm:py-4"
                      >
                        <Avatar name={u.full_name} email={u.email} />

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                            <span className="truncate text-sm font-semibold text-[var(--anchor-deep)] sm:text-base">
                              {u.full_name || u.email}
                            </span>
                            {u.manufacturer ? (
                              <span className="truncate text-xs text-[var(--anchor-gray)]">
                                · {u.manufacturer}
                              </span>
                            ) : u.company ? (
                              <span className="truncate text-xs text-[var(--anchor-gray)]">
                                · {u.company}
                              </span>
                            ) : null}
                          </div>
                          <div className="truncate text-xs text-[var(--anchor-gray)]">
                            {u.email}
                          </div>

                          {/* Mobile-only stat pills */}
                          <div className="mt-2 flex flex-wrap gap-1.5 sm:hidden">
                            <Pill kind={u.events.total7 > 0 ? "live" : "muted"}>
                              {u.events.total7} · 7d
                            </Pill>
                            <Pill>{u.conversationCount} sessions</Pill>
                            <Pill>{u.leadCount} leads</Pill>
                            {u.reports.length > 0 && <Pill>{u.reports.length} reports</Pill>}
                          </div>

                          {/* Activity bar (all sizes) */}
                          <div className="mt-2 hidden h-1 w-full overflow-hidden rounded-full bg-[var(--surface-strong)] sm:block">
                            <div
                              className="h-full rounded-full bg-[var(--anchor-green)] transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>

                        {/* Desktop stats */}
                        <div className="hidden shrink-0 items-center gap-5 text-center md:flex">
                          <Stat value={u.events.total7} label="7d events" highlight={u.events.total7 > 0} />
                          <Stat value={u.conversationCount} label="sessions" />
                          <Stat value={u.leadCount} label="leads" />
                          <Stat value={u.reports.length} label="reports" />
                          <div className="min-w-[5.5rem] text-right text-[11px] text-[var(--anchor-gray)]">
                            {u.events.lastSeen ? relativeTime(u.events.lastSeen) : "Joined " + fmt(u.created_at)}
                          </div>
                        </div>

                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={2}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className={`ml-1 h-5 w-5 shrink-0 text-[var(--anchor-gray)] transition-transform ${isOpen ? "rotate-180" : ""}`}
                          aria-hidden
                        >
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </button>

                      {isOpen && (
                        <div className="border-t border-[var(--border-default)] bg-[var(--surface-soft)] px-4 py-4 sm:px-6 sm:py-5">
                          {/* Activity summary line + PDF export */}
                          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
                              <span className="font-semibold text-[var(--anchor-deep)]">
                                Last 30 days
                              </span>
                              <span className="text-[var(--anchor-gray)]">
                                {u.events.total30} events
                              </span>
                              <span className="text-[var(--anchor-gray)]">
                                · {u.events.total7} in past 7d
                              </span>
                              {u.events.lastSeen && (
                                <span className="text-[var(--anchor-gray)]">
                                  · last seen {fmtDateTime(u.events.lastSeen)}
                                </span>
                              )}
                              {u.phone && (
                                <span className="text-[var(--anchor-gray)]">· {u.phone}</span>
                              )}
                            </div>
                            <button
                              type="button"
                              data-track-id="user-activity-pdf"
                              onClick={() =>
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
                                })
                              }
                              className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-[var(--anchor-green)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--anchor-green)] transition-colors hover:bg-[var(--anchor-green)] hover:text-white sm:text-sm"
                            >
                              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                                <polyline points="7 10 12 15 17 10" />
                                <line x1="12" y1="15" x2="12" y2="3" />
                              </svg>
                              Download PDF
                            </button>
                          </div>

                          {u.events.total30 === 0 ? (
                            <p className="rounded-xl bg-white px-4 py-3 text-sm text-[var(--anchor-gray)]">
                              No activity recorded in the last 30 days.
                            </p>
                          ) : (
                            <div className="mb-5 grid gap-3 sm:gap-4 md:grid-cols-2 xl:grid-cols-3">
                              <div className="rounded-xl border border-[var(--border-default)] bg-white p-4">
                                <div className="ds-caption mb-3">Event breakdown</div>
                                <ul className="space-y-2 text-sm">
                                  {Object.entries(u.events.byType)
                                    .sort((a, b) => b[1] - a[1])
                                    .map(([type, count]) => (
                                      <li key={type} className="flex items-center justify-between gap-3">
                                        <span className="truncate text-[var(--text-primary)]">
                                          {eventTypeLabel(type)}
                                        </span>
                                        <span className="ds-badge !rounded-full">{count}</span>
                                      </li>
                                    ))}
                                </ul>
                              </div>
                              <div className="rounded-xl border border-[var(--border-default)] bg-white p-4">
                                <div className="ds-caption mb-3">Top pages</div>
                                {u.events.topPages.length === 0 ? (
                                  <div className="text-sm text-[var(--anchor-gray)]">—</div>
                                ) : (
                                  <ul className="space-y-2 text-sm">
                                    {u.events.topPages.map((p) => (
                                      <li key={p.path} className="flex items-center justify-between gap-3">
                                        <span
                                          className="truncate text-[var(--text-primary)]"
                                          title={p.path}
                                        >
                                          {prettyPagePath(p.path)}
                                        </span>
                                        <span className="ds-badge !rounded-full">{p.count}</span>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                              <div className="rounded-xl border border-[var(--border-default)] bg-white p-4 md:col-span-2 xl:col-span-1">
                                <div className="ds-caption mb-3">Top clicks</div>
                                {u.events.topClicks.length === 0 ? (
                                  <div className="text-sm text-[var(--anchor-gray)]">
                                    No click activity yet.
                                  </div>
                                ) : (
                                  <ul className="space-y-2 text-sm">
                                    {u.events.topClicks.map((c, i) => (
                                      <li key={`${c.path}::${c.label}::${i}`} className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                          <div className="truncate text-[var(--text-primary)]" title={c.label}>
                                            {c.label || "—"}
                                          </div>
                                          {c.path && (
                                            <span className="block truncate text-[11px] text-[var(--anchor-gray)]" title={c.path}>
                                              {prettyPagePath(c.path)}
                                            </span>
                                          )}
                                        </div>
                                        <span className="ds-badge !rounded-full shrink-0">{c.count}</span>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>
                            </div>
                          )}

                          <div className="ds-caption mb-3">{t("rooftopAssessmentReports")}</div>
                          {u.reports.length === 0 ? (
                            <p className="rounded-xl bg-white px-4 py-3 text-sm text-[var(--anchor-gray)]">
                              {t("noAssessmentReports")}
                            </p>
                          ) : (
                            <div className="flex flex-col gap-2">
                              {u.reports.map((r) => (
                                <div
                                  key={r.id}
                                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border-default)] bg-white px-4 py-3"
                                >
                                  <div className="min-w-0">
                                    <div className="truncate text-sm font-semibold text-[var(--anchor-deep)]">
                                      {r.contractor_name || "—"} · {r.company_name || "—"}
                                    </div>
                                    <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-[var(--anchor-gray)]">
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
                    </li>
                  );
                })}
              </ul>
            </Card>
          </>
        )}
    </>
  );
}

export default function ReportsPage() {
  // Thin URL-driven wrapper around <CategoryAnalyticsView/> so the legacy
  // /dashboard/reports?category=… URLs keep working. The unified /admin/analytics
  // page imports CategoryAnalyticsView directly and switches the prop via tabs.
  const [category, setCategory] = useState<ActivityCategory>("external");
  const { t } = useTranslation();

  useEffect(() => {
    if (typeof window === "undefined") return;
    setCategory(parseCategory(new URLSearchParams(window.location.search).get("category")));
  }, []);

  const meta = CATEGORY_META[category];

  return (
    <main className="ds-page">
      <AppNavbar
        title={APP_NAME}
        subtitle={meta.subtitle}
        menuItems={[
          { label: t("dashboard"), href: "/dashboard" },
          { label: "OEM Analytics", href: "/admin/analytics" },
        ]}
      />
      <div className="ds-container py-6 pb-[calc(3rem+env(safe-area-inset-bottom))] sm:py-10">
        <CategoryAnalyticsView category={category} />
      </div>
    </main>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Subcomponents
// ────────────────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: number;
  hint?: string;
  accent?: string;
}) {
  return (
    <Card className="p-4 sm:p-5">
      <div className="ds-caption">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-2xl font-bold tabular-nums text-[var(--anchor-deep)] sm:text-3xl">
          {value.toLocaleString()}
        </span>
        {hint && (
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
              accent ?? "bg-[var(--surface-soft)] text-[var(--anchor-gray)]"
            }`}
          >
            {hint}
          </span>
        )}
      </div>
    </Card>
  );
}

function StatsSkeleton() {
  return (
    <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      {[0, 1, 2, 3].map((i) => (
        <Card key={i} className="p-4 sm:p-5">
          <div className="h-3 w-16 animate-pulse rounded bg-[var(--surface-strong)]" />
          <div className="mt-3 h-8 w-20 animate-pulse rounded bg-[var(--surface-strong)]" />
        </Card>
      ))}
    </div>
  );
}

function SortPill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "rounded-full bg-[var(--anchor-deep)] px-3 py-1.5 text-xs font-semibold text-white shadow-sm"
          : "rounded-full border border-[var(--border-default)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--anchor-gray)] transition-colors hover:bg-[var(--surface-soft)] hover:text-[var(--anchor-deep)]"
      }
    >
      {children}
    </button>
  );
}

function Stat({
  value,
  label,
  highlight = false,
}: {
  value: number;
  label: string;
  highlight?: boolean;
}) {
  return (
    <div className="min-w-[3.5rem]">
      <div
        className={`text-sm font-semibold tabular-nums ${
          highlight ? "text-[var(--anchor-green)]" : "text-[var(--anchor-deep)]"
        }`}
      >
        {value.toLocaleString()}
      </div>
      <div className="text-[10px] uppercase tracking-wide text-[var(--anchor-gray)]">
        {label}
      </div>
    </div>
  );
}

function Pill({
  children,
  kind = "default",
}: {
  children: React.ReactNode;
  kind?: "default" | "live" | "muted";
}) {
  const styles =
    kind === "live"
      ? "bg-[var(--anchor-mint)]/50 text-[var(--anchor-deep)]"
      : kind === "muted"
        ? "bg-[var(--surface-strong)] text-[var(--anchor-gray)]"
        : "bg-[var(--surface-soft)] text-[var(--anchor-deep)]";
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${styles}`}>
      {children}
    </span>
  );
}

function Avatar({ name, email }: { name: string | null; email: string }) {
  const seed = (name || email).toLowerCase();
  const bg = avatarColor(seed);
  const text = initials(name, email);
  return (
    <div
      aria-hidden
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white sm:h-11 sm:w-11"
      style={{ backgroundColor: bg }}
    >
      {text}
    </div>
  );
}

function DailyEventsChart({ data }: { data: DailyEvent[] }) {
  if (data.length === 0) {
    return <div className="text-sm text-[var(--anchor-gray)]">No data yet.</div>;
  }
  const max = Math.max(1, ...data.map((d) => d.count));
  const W = 600;
  const H = 140;
  const padLeft = 28;
  const padRight = 8;
  const padTop = 8;
  const padBottom = 22;
  const innerW = W - padLeft - padRight;
  const innerH = H - padTop - padBottom;
  const barW = innerW / data.length;
  const gap = Math.max(1, barW * 0.18);

  const gridYs = [0, 0.25, 0.5, 0.75, 1].map((p) => padTop + innerH * (1 - p));
  const labelXs = data
    .map((d, i) => ({ i, d }))
    .filter(({ i }) => i === 0 || i === data.length - 1 || i === Math.floor(data.length / 2));

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="Daily events over the last 30 days"
      className="h-36 w-full"
      preserveAspectRatio="none"
    >
      {/* gridlines */}
      {gridYs.map((y, idx) => (
        <line
          key={idx}
          x1={padLeft}
          x2={W - padRight}
          y1={y}
          y2={y}
          stroke="var(--border-default)"
          strokeWidth={1}
          strokeDasharray={idx === gridYs.length - 1 ? "0" : "2 4"}
        />
      ))}
      {/* y-axis labels */}
      {[0, 0.5, 1].map((p) => {
        const v = Math.round(max * p);
        const y = padTop + innerH * (1 - p);
        return (
          <text
            key={p}
            x={padLeft - 6}
            y={y + 3}
            textAnchor="end"
            fontSize={10}
            fill="var(--anchor-gray)"
          >
            {v}
          </text>
        );
      })}
      {/* bars */}
      {data.map((d, i) => {
        const x = padLeft + barW * i + gap / 2;
        const w = Math.max(1, barW - gap);
        const h = (d.count / max) * innerH;
        const y = padTop + innerH - h;
        const isPeak = d.count === max && d.count > 0;
        return (
          <rect
            key={d.date}
            x={x}
            y={y}
            width={w}
            height={h}
            rx={1.5}
            fill={isPeak ? "var(--anchor-deep)" : "var(--anchor-green)"}
          >
            <title>{`${fmtShortDate(d.date)}: ${d.count}`}</title>
          </rect>
        );
      })}
      {/* x-axis labels */}
      {labelXs.map(({ i, d }) => {
        const x = padLeft + barW * i + barW / 2;
        return (
          <text
            key={d.date}
            x={x}
            y={H - 6}
            textAnchor="middle"
            fontSize={10}
            fill="var(--anchor-gray)"
          >
            {fmtShortDate(d.date)}
          </text>
        );
      })}
    </svg>
  );
}

function EventMixChart({ data }: { data: Record<string, number> }) {
  const entries = Object.entries(data).sort((a, b) => b[1] - a[1]);
  const total = entries.reduce((s, [, c]) => s + c, 0);

  if (total === 0) {
    return <div className="text-sm text-[var(--anchor-gray)]">No events yet.</div>;
  }

  const palette = [
    "#11500F",
    "#047835",
    "#4A8F3E",
    "#7BB87B",
    "#9CE2BB",
    "#1D6B4A",
    "#2F7F5C",
  ];

  return (
    <div className="space-y-3">
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-[var(--surface-strong)]">
        {entries.map(([type, count], i) => (
          <div
            key={type}
            style={{
              width: `${(count / total) * 100}%`,
              backgroundColor: palette[i % palette.length],
            }}
            title={`${eventTypeLabel(type)}: ${count}`}
          />
        ))}
      </div>
      <ul className="space-y-1.5 text-xs">
        {entries.map(([type, count], i) => (
          <li key={type} className="flex items-center gap-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: palette[i % palette.length] }}
              aria-hidden
            />
            <span className="flex-1 truncate text-[var(--text-primary)]">
              {eventTypeLabel(type)}
            </span>
            <span className="tabular-nums text-[var(--anchor-gray)]">
              {Math.round((count / total) * 100)}%
            </span>
            <span className="ds-badge !rounded-full">{count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
