"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { AppNavbar } from "@/app/components/ui/AppNavbar";
import { Card } from "@/app/components/ui/Card";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { OemMatrixTable } from "@/app/components/admin/OemMatrixTable";
import { MatrixFilterMenu, DAY_OPTIONS, dayLabel } from "@/app/components/admin/MatrixFilterMenu";
import { PeopleDirectory, type DirectoryChat, type DirectoryPdfTarget } from "@/app/components/admin/PeopleDirectory";
import { OemPeopleModal, type OemPerson } from "@/app/components/admin/OemPeopleModal";
import { UserAnalyticsCharts, buildUserAnalyticsSummary } from "@/app/components/admin/UserAnalyticsCharts";
// Pure totals/types eager (no jspdf); the PDF generators are dynamically
// imported in their handlers so jspdf stays out of this page's initial bundle.
import {
  computeTotals,
  type MatrixGroup,
  type MatrixPdfPayload,
} from "@/lib/analytics/oemMatrixCore";



// One dashboard, three panels. OEM engagement and internal-user activity used
// to be two separate admin pages fetching the same endpoint and splitting the
// result by contact_type — which meant two windows, two search boxes and two
// answers to "who is this person".
type AnalyticsView = "overview" | "matrix" | "people";

const VIEWS: { key: AnalyticsView; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "matrix", label: "OEM matrix" },
  { key: "people", label: "People" },
];

function viewFromUrl(): AnalyticsView {
  if (typeof window === "undefined") return "overview";
  const v = new URLSearchParams(window.location.search).get("view");
  return VIEWS.some((x) => x.key === v) ? (v as AnalyticsView) : "overview";
}
const GROUP_LABEL: Record<MatrixGroup, string> = { sales: "Sales rep", tech: "Tech rep", consultant: "Consultant" };
const ALL_GROUPS: MatrixGroup[] = ["sales", "tech", "consultant"];

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
  contact_type: string | null; // set only for OEM roster members (rep/consultant)
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
  const [matrix, setMatrix] = useState<MatrixPdfPayload | null>(null);
  const [matrixManufacturers, setMatrixManufacturers] = useState<string[]>([]);
  const [matrixGroups, setMatrixGroups] = useState<MatrixGroup[]>([]);
  // ONE time window for the whole dashboard. The matrix and the directory used
  // to keep their own, which meant two controls on one page that answered the
  // same question with different numbers.
  const [days, setDays] = useState<number>(30);
  const usersLoadedRef = useRef(false);

  // Which panel is showing. Everything shares the window, the search and the
  // loaded data, so switching is instant and never re-fetches. Mirrored in the
  // URL so a panel is linkable — and so /admin/user-analytics can land its
  // redirect on People, which is what that page was.
  const [view, setView] = useState<AnalyticsView>("overview");
  useEffect(() => {
    setView(viewFromUrl());
  }, []);

  function selectView(next: AnalyticsView) {
    setView(next);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    url.searchParams.set("view", next);
    window.history.replaceState(null, "", url.toString());
  }
  // The dashboard's one search box: narrows the OEM matrix to matching
  // manufacturers and the directory to matching people.
  const [search, setSearch] = useState("");

  const [detail, setDetail] = useState<
    | { kind: "activity" }
    | { kind: "signedup" }
    | { kind: "noprojects" }
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

  // Fetch unified user-activity payload, windowed by the people directory's
  // time selection. Only blank the page on the first load — later window
  // changes swap data in place so the matrix doesn't flicker.
  useEffect(() => {
    if (!ready || accessError) return;
    let alive = true;
    (async () => {
      if (!usersLoadedRef.current) setLoading(true);
      setLoadErr(null);
      const res = await fetch(`/api/admin/user-activity?category=all&days=${days}`, {
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
      usersLoadedRef.current = true;
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [ready, accessError, days]);

  // Per-manufacturer matrix (sales/tech/consultant), recomputed by the server
  // over the selected time window.
  useEffect(() => {
    if (!ready || accessError) return;
    let alive = true;
    (async () => {
      const res = await fetch(`/api/admin/oem-matrix?days=${days}`, { credentials: "include", cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (!alive || !res.ok) return;
      setMatrix({
        rows: body?.rows ?? [],
        totals: body?.totals ?? { sales: null, tech: null, consultant: null },
        events: body?.events ?? [],
        projects: body?.projects ?? [],
      } as MatrixPdfPayload);
    })();
    return () => { alive = false; };
  }, [ready, accessError, days]);

  // Matrix narrowed to the selected manufacturers (empty = all). The Type filter
  // is applied at render time (column subset), so totals stay correct per group.
  const filteredMatrix = useMemo(() => {
    if (!matrix) return null;
    const q = search.trim().toLowerCase();
    let rows =
      matrixManufacturers.length === 0
        ? matrix.rows
        : matrix.rows.filter((r) => matrixManufacturers.includes(r.manufacturer));
    // The dashboard's search narrows the matrix by OEM name, so one box
    // answers "show me Carlisle" whichever panel you're looking at.
    if (q) rows = rows.filter((r) => r.manufacturer.toLowerCase().includes(q));
    return { rows, totals: computeTotals(rows) };
  }, [matrix, matrixManufacturers, search]);

  // Headline metrics summarise the matrix as currently filtered (manufacturers,
  // types, and time window), so the KPI strip is a live readout of the matrix.
  const matrixSummary = useMemo(() => {
    const t = filteredMatrix?.totals;
    const groups: MatrixGroup[] = matrixGroups.length ? matrixGroups : ["sales", "tech", "consultant"];
    let signedUp = 0, notSignedUp = 0, uses = 0, notReporting = 0, leads = 0, reports = 0;
    if (t) {
      for (const g of groups) {
        const c = t[g];
        if (!c) continue;
        signedUp += c.downloaded;
        notSignedUp += c.notDownloaded;
        uses += c.uses;
        notReporting += c.notReporting;
        leads += c.leads;
        reports += c.reports;
      }
    }
    const contacts = signedUp + notSignedUp;
    const activationPct = contacts > 0 ? Math.round((signedUp / contacts) * 100) : 0;
    return { signedUp, notSignedUp, contacts, uses, notReporting, leads, reports, projects: leads + reports, activationPct };
  }, [filteredMatrix, matrixGroups]);

  // Everyone who isn't on the OEM roster — internal staff and other signed-up
  // users. What the old User Analytics page charted.
  const otherUsers = useMemo(() => users.filter((u) => !u.contact_type), [users]);
  const userSummary = useMemo(() => buildUserAnalyticsSummary(otherUsers, days), [otherUsers, days]);

  const profileIdByEmail = useMemo(() => {
    const m = new Map<string, string>();
    for (const u of users) if (u.email) m.set(u.email.toLowerCase(), u.id);
    return m;
  }, [users]);

  // The people behind the matrix cards — deduped across the filtered rows and
  // selected groups, so the KPI cards drill into exactly who they count.
  const matrixPeople = useMemo<OemPerson[]>(() => {
    const groups = matrixGroups.length ? matrixGroups : ALL_GROUPS;
    const map = new Map<string, OemPerson>();
    for (const r of filteredMatrix?.rows ?? []) {
      for (const g of groups) {
        for (const p of r.groups[g].people) {
          const key = `${(p.email || p.name).toLowerCase()}|${g}`;
          const existing = map.get(key);
          if (existing) {
            if (!existing.oems.includes(r.manufacturer)) existing.oems.push(r.manufacturer);
          } else {
            map.set(key, {
              key,
              name: p.name,
              email: p.email,
              type: GROUP_LABEL[g],
              oems: [r.manufacturer],
              signedUp: p.signedUp,
              uses: p.uses,
              leads: p.leads,
              reports: p.reports,
              profileId: p.email ? profileIdByEmail.get(p.email.toLowerCase()) ?? null : null,
            });
          }
        }
      }
    }
    return [...map.values()];
  }, [filteredMatrix, matrixGroups, profileIdByEmail]);

  const detailPeople = useMemo<OemPerson[]>(() => {
    if (detail?.kind === "activity") return matrixPeople.filter((p) => p.signedUp && p.uses > 0).sort((a, b) => b.uses - a.uses);
    if (detail?.kind === "signedup") return matrixPeople.filter((p) => p.signedUp).sort((a, b) => b.uses - a.uses);
    if (detail?.kind === "noprojects") return matrixPeople.filter((p) => p.signedUp && p.leads + p.reports === 0).sort((a, b) => b.uses - a.uses);
    return [];
  }, [detail, matrixPeople]);

  // The master PDF for internal & other users: a per-user breakdown across the
  // most common event types in the window. Ported from the User Analytics page
  // this dashboard absorbed.
  async function exportUserMasterPdf() {
    const { generateUserAnalyticsPdf } = await import("@/lib/analytics/userAnalyticsPdf");
    const { shortEventLabel } = await import("@/app/components/admin/UserAnalyticsCharts");
    const isInternal = (role: string | null) => role === "anchor_rep" || role === "admin";
    const userTotal = (u: UserRow) => Object.values(u.events.byType).reduce((s, n) => s + n, 0);

    // Columns of the breakdown = the most common event types across these users.
    const agg: Record<string, number> = {};
    for (const u of otherUsers) for (const [k, n] of Object.entries(u.events.byType)) agg[k] = (agg[k] ?? 0) + n;
    const topTypeKeys = Object.entries(agg)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([k]) => k);

    const rows = otherUsers
      .map((u) => ({
        name: u.full_name || u.email,
        email: u.email,
        category: isInternal(u.role) ? "Internal" : "External",
        counts: topTypeKeys.map((k) => u.events.byType[k] ?? 0),
        total: userTotal(u),
      }))
      .filter((r) => r.total > 0)
      .sort((a, b) => b.total - a.total);

    generateUserAnalyticsPdf({
      title: "User Analytics",
      scopeLabel: "Internal staff & other app users",
      windowLabel: dayLabel(days),
      stats: userSummary.stats,
      series: userSummary.series,
      byType: userSummary.byType,
      breakdown: { typeLabels: topTypeKeys.map(shortEventLabel), rows },
    });
  }

  // A person's chat threads. Not windowed like the event log: "what has this
  // rep been asking?" is a question about the whole relationship, and the useful
  // answer is often the thread from two months ago.
  async function loadUserChat(profileId: string): Promise<DirectoryChat> {
    const res = await fetch(`/api/admin/user-chat?userId=${profileId}`, { credentials: "include", cache: "no-store" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { conversations: [] };
    return { conversations: body?.conversations ?? [], truncated: !!body?.truncated };
  }

  // Load a rep/consultant's events in the current window for the inline drill-down.
  async function loadUserEvents(profileId: string): Promise<Array<{ at: string; type: string; detail: string }>> {
    const res = await fetch(`/api/admin/user-events?userId=${profileId}&days=${days}`, { credentials: "include", cache: "no-store" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return [];
    return (body?.events ?? []) as Array<{ at: string; type: string; detail: string }>;
  }

  // Per-user PDF: every event a rep/consultant made in the given window
  // (defaults to the directory window; the matrix cards pass the matrix window).
  // Works for unsigned contacts too (they simply have no activity).
  async function downloadUserEventLog(target: DirectoryPdfTarget, windowDays: number = days) {
    let events: Array<{ at: string; type: string; detail: string }> = [];
    let truncated = false;
    if (target.signedUp && target.profileId) {
      const res = await fetch(`/api/admin/user-events?userId=${target.profileId}&days=${windowDays}`, { credentials: "include", cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (res.ok) { events = (body?.events ?? []) as typeof events; truncated = !!body?.truncated; }
    }
    const { generateUserEventLogPdf } = await import("@/lib/analytics/userEventLogPdf");
    generateUserEventLogPdf({
      name: target.name,
      email: target.email ?? "—",
      windowLabel: dayLabel(windowDays),
      lastSeen: target.lastSeen,
      signedUp: target.signedUp,
      truncated,
      events,
    });
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <main className="ds-page">
      <AppNavbar
        title="Analytics"
        subtitle="Adoption, usage & people"
        menuItems={[
          { label: t("dashboard"), href: "/dashboard" },
          { label: "Admin Console", href: "/admin" },
          { label: "Contacts", href: "/admin/manufacturer-contacts" },
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
            <header className="mb-4 sm:mb-5">
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Analytics</h1>
              <p className="mt-1 text-sm text-[var(--anchor-gray)] sm:text-base">
                Who is using the app and what they&apos;re doing — OEM reps and consultants,
                internal staff, and everyone else, over one window.
              </p>
            </header>

            {/* One toolbar for the whole dashboard: which panel, over what
                window, and the single search box. */}
            <div className="mb-5 flex flex-col gap-3 sm:mb-6">
              <div className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] sm:gap-2 [&::-webkit-scrollbar]:hidden">
                {VIEWS.map((v) => (
                  <button
                    key={v.key}
                    type="button"
                    onClick={() => selectView(v.key)}
                    aria-current={view === v.key ? "page" : undefined}
                    className={`shrink-0 rounded-xl px-3 py-1.5 text-sm font-semibold transition ${
                      view === v.key
                        ? "bg-[var(--anchor-green)] text-white"
                        : "border border-[var(--border-default)] bg-white text-[var(--anchor-deep)] hover:bg-[var(--surface-soft)]"
                    }`}
                  >
                    {v.label}
                  </button>
                ))}
              </div>

              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                {/* Hidden on Overview, where there's nothing to narrow —
                    a search box that does nothing is worse than none. */}
                {view !== "overview" && (
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={
                      view === "matrix"
                        ? "Search OEMs…"
                        : "Search name, email, company, OEM…"
                    }
                    className="ds-input w-full sm:flex-1"
                  />
                )}
                <select
                  value={days}
                  onChange={(e) => setDays(Number(e.target.value))}
                  aria-label="Time window"
                  className="ds-select w-full sm:ml-auto sm:w-auto"
                >
                  {DAY_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {loadErr && (
              <Card className="mb-4 border-red-200 bg-red-50 p-4 text-sm text-red-700">{loadErr}</Card>
            )}

            {loading ? (
              <Card className="p-5 text-sm text-[var(--anchor-gray)]">Loading analytics…</Card>
            ) : (
              <div className="space-y-6 sm:space-y-8">

                {/* ─── Headline KPI strip — a live readout of the matrix ──── */}
                {view === "overview" && (
                <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4">
                  <div className="sm:col-span-2">
                    <HeadlineHero
                      title={`OEM activity · ${dayLabel(days).toLowerCase()}`}
                      value={matrixSummary.uses}
                      unit="events from signed-up reps"
                      chip={`${matrixSummary.leads.toLocaleString()} leads · ${matrixSummary.reports.toLocaleString()} reports submitted`}
                      onClick={() => setDetail({ kind: "activity" })}
                    />
                  </div>
                  <StatPairCard
                    label="Reps signed up"
                    value={matrixSummary.signedUp}
                    hint={`of ${matrixSummary.contacts.toLocaleString()} contacts`}
                    accent={matrixSummary.activationPct >= 50 ? "good" : matrixSummary.activationPct >= 25 ? "neutral" : "bad"}
                    footer={`${matrixSummary.activationPct}% activation`}
                    onClick={() => setDetail({ kind: "signedup" })}
                  />
                  <StatPairCard
                    label="No projects yet"
                    value={matrixSummary.notReporting}
                    hint={`signed up, nothing submitted ${dayLabel(days).toLowerCase()}`}
                    accent={matrixSummary.signedUp === 0 ? "neutral" : matrixSummary.notReporting === 0 ? "good" : "bad"}
                    footer={
                      matrixSummary.signedUp === 0
                        ? "No reps signed up yet"
                        : matrixSummary.notReporting > 0
                        ? "Needs outreach"
                        : "All reps active"
                    }
                    onClick={() => setDetail({ kind: "noprojects" })}
                  />
                </section>
                )}

                {/* Internal staff and other signed-up users — what the second
                    analytics page used to be, on the same overview as the OEM
                    numbers so "how are we doing" is one screen. */}
                {view === "overview" && (
                  <section>
                    <div className="mb-4 flex flex-col gap-2 sm:mb-5 sm:flex-row sm:items-end sm:justify-between">
                      <div>
                        <h2 className="text-lg font-bold tracking-tight text-[var(--anchor-deep)] sm:text-xl">
                          Internal &amp; other users
                        </h2>
                        <p className="mt-0.5 text-xs text-[var(--anchor-gray)] sm:text-sm">
                          Everyone who isn&apos;t on the OEM roster — Anchor staff and other
                          signed-up users, {dayLabel(days).toLowerCase()}.
                        </p>
                      </div>
                      <button
                        type="button"
                        data-track-id="user-analytics-export"
                        disabled={otherUsers.length === 0}
                        onClick={exportUserMasterPdf}
                        className="inline-flex h-9 shrink-0 items-center justify-center gap-1.5 self-start rounded-lg border border-[var(--anchor-green)] bg-[var(--anchor-green)] px-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--anchor-deep)] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="7 10 12 15 17 10" />
                          <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                        Master PDF
                      </button>
                    </div>
                    <UserAnalyticsCharts summary={userSummary} />
                  </section>
                )}

                {/* ─── OEM matrix ─────────────────────────────────────────── */}
                {view === "matrix" && (
                <section>
                  <div className="mb-4 flex flex-col gap-3 sm:mb-5 sm:flex-row sm:items-end sm:justify-between">
                    <div>
                      <h2 className="text-lg font-bold tracking-tight text-[var(--anchor-deep)] sm:text-xl">OEM matrix</h2>
                      <p className="mt-0.5 text-xs text-[var(--anchor-gray)] sm:text-sm">
                        One row per OEM, split by sales reps, tech reps, and consultants — adoption, usage, and projects submitted over the window set in <span className="font-semibold">Filters</span>. Click a row to drill into the people behind each number.
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <MatrixFilterMenu
                        manufacturers={(matrix?.rows ?? []).map((r) => r.manufacturer)}
                        selectedManufacturers={matrixManufacturers}
                        onManufacturers={setMatrixManufacturers}
                        selectedGroups={matrixGroups}
                        onGroups={setMatrixGroups}
                        days={days}
                        onDays={setDays}
                      />
                      <button
                        type="button"
                        data-track-id="matrix-export-pdf"
                        disabled={!filteredMatrix || filteredMatrix.rows.length === 0}
                        onClick={async () => {
                          if (!matrix) return;
                          const { generateFullAnalyticsPdf } = await import("@/lib/analytics/oemMatrixPdf");
                          generateFullAnalyticsPdf(matrix, {
                            windowLabel: dayLabel(days),
                            manufacturers: matrixManufacturers,
                            groups: matrixGroups,
                          });
                        }}
                        className="inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-[var(--anchor-green)] bg-[var(--anchor-green)] px-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--anchor-deep)] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                          <polyline points="7 10 12 15 17 10" />
                          <line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                        Export PDF
                      </button>
                    </div>
                  </div>
                  {filteredMatrix && (
                    <OemMatrixTable
                      rows={filteredMatrix.rows}
                      totals={filteredMatrix.totals}
                      groups={matrixGroups.length ? matrixGroups : undefined}
                    />
                  )}
                </section>
                )}

                {/* ─── People: one directory for everybody ────────────────── */}
                {view === "people" && (
                <section>
                  <div className="mb-4 sm:mb-5">
                    <h2 className="text-lg font-bold tracking-tight text-[var(--anchor-deep)] sm:text-xl">People</h2>
                    <p className="mt-0.5 text-xs text-[var(--anchor-gray)] sm:text-sm">
                      Everyone in one list — OEM reps, tech reps and consultants alongside Anchor
                      staff and other signed-up users. Narrow by contact type, OEM or activity in
                      Filters; open a row for their events {dayLabel(days).toLowerCase()}, or pull
                      their full log as a PDF.
                    </p>
                  </div>
                <Card className="overflow-hidden p-0">
                  <PeopleDirectory
                    scope="all"
                    appUsers={users}
                    searchTerm={search}
                    // No onDays/dayOptions: this panel's Filters are about
                    // people — type, OEM, activity. The window belongs to the
                    // dashboard toolbar above.
                    days={days}
                    onLoadEvents={loadUserEvents}
                    onLoadChat={loadUserChat}
                    onDownloadUserPdf={downloadUserEventLog}
                  />
                </Card>
                </section>
                )}
              </div>
            )}

            {/* KPI-card drill-down: the matrix people behind each number. */}
            <OemPeopleModal
              open={detail !== null}
              title={
                detail?.kind === "activity"
                  ? `OEM activity · ${dayLabel(days).toLowerCase()}`
                  : detail?.kind === "signedup"
                  ? "Reps signed up"
                  : "No projects yet"
              }
              subtitle={
                detail?.kind === "activity"
                  ? "Signed-up reps & consultants, by events"
                  : detail?.kind === "signedup"
                  ? "Reps & consultants who have signed up"
                  : `Signed up, nothing submitted ${dayLabel(days).toLowerCase()}`
              }
              people={detailPeople}
              emptyMessage={
                detail?.kind === "noprojects"
                  ? "Everyone signed up has submitted something."
                  : "No one matches the current filters."
              }
              onClose={() => setDetail(null)}
              onDownloadPdf={(p) =>
                downloadUserEventLog({ name: p.name, email: p.email, profileId: p.profileId, signedUp: p.signedUp, lastSeen: null }, days)
              }
            />
          </>
        )}
      </div>
    </main>
  );
}

// ── Headline components ─────────────────────────────────────────────────────

function HeadlineHero({
  title,
  value,
  unit,
  chip,
  onClick,
}: {
  title: string;
  value: number;
  unit: string;
  chip: string;
  onClick?: () => void;
}) {
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

      <h2 className="relative text-xs font-semibold uppercase tracking-widest !text-white/70 sm:text-sm">
        {title}
      </h2>

      <div className="relative mt-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-4xl font-bold tabular-nums !text-white sm:text-5xl">
          {value.toLocaleString()}
        </span>
        <span className="text-sm text-white/70 sm:text-base">{unit}</span>
      </div>

      <div className="relative mt-4">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--anchor-green)] px-2.5 py-1 text-xs font-bold text-[var(--anchor-deep)]">
          {chip}
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
