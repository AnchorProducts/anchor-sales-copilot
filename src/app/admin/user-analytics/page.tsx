"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { AppNavbar } from "@/app/components/ui/AppNavbar";
import { Card } from "@/app/components/ui/Card";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { PeopleDirectory, type DirectoryPdfTarget } from "@/app/components/admin/PeopleDirectory";
import { UserAnalyticsCharts, buildUserAnalyticsSummary, shortEventLabel } from "@/app/components/admin/UserAnalyticsCharts";
// jsPDF-backed PDF helpers are dynamically imported in the handlers below so
// jspdf (~300KB) is code-split out of this page's initial bundle.

const DAY_OPTIONS = [7, 14, 30, 90] as const;
const dayLabel = (d: number) => `Last ${d} days`;
const DAY_FILTER_OPTIONS = DAY_OPTIONS.map((value) => ({ value, label: dayLabel(value) }));

export const dynamic = "force-dynamic";

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
  dailyEvents: Array<{ date: string; count: number }>;
};

export default function AdminUserAnalyticsPage() {
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const { t } = useTranslation();

  const [ready, setReady] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [days, setDays] = useState<number>(30);
  const loadedRef = useRef(false);

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
      if (!loadedRef.current) setLoading(true);
      setLoadErr(null);
      const res = await fetch(`/api/admin/user-activity?category=all&days=${days}`, {
        credentials: "include",
        cache: "no-store",
      });
      const body = await res.json().catch(() => ({}));
      if (!alive) return;
      if (!res.ok) {
        setLoadErr(body?.error || "Failed to load users.");
        setLoading(false);
        return;
      }
      setUsers((body?.users ?? []) as UserRow[]);
      loadedRef.current = true;
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [ready, accessError, days]);

  // Non-OEM users only: roster members carry a contact_type, everyone else is
  // internal staff or an other signed-up user. Matches the directory's scope.
  const otherUsers = useMemo(() => users.filter((u) => !u.contact_type), [users]);

  // Shared summary feeds both the on-screen charts and the master PDF.
  const summary = useMemo(() => buildUserAnalyticsSummary(otherUsers, days), [otherUsers, days]);

  async function exportMasterPdf() {
    const { generateUserAnalyticsPdf } = await import("@/lib/analytics/userAnalyticsPdf");
    const isInternal = (role: string | null) => role === "anchor_rep" || role === "admin";
    const userTotal = (u: UserRow) => Object.values(u.events.byType).reduce((s, n) => s + n, 0);

    // Columns of the breakdown = the most common event types across these users.
    const agg: Record<string, number> = {};
    for (const u of otherUsers) for (const [t, n] of Object.entries(u.events.byType)) agg[t] = (agg[t] ?? 0) + n;
    const topTypeKeys = Object.entries(agg)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([t]) => t);

    const rows = otherUsers
      .map((u) => ({
        name: u.full_name || u.email,
        email: u.email,
        category: isInternal(u.role) ? "Internal" : "External",
        counts: topTypeKeys.map((t) => u.events.byType[t] ?? 0),
        total: userTotal(u),
      }))
      .filter((r) => r.total > 0)
      .sort((a, b) => b.total - a.total);

    generateUserAnalyticsPdf({
      title: "User Analytics",
      scopeLabel: "Internal staff & other app users",
      windowLabel: dayLabel(days),
      stats: summary.stats,
      series: summary.series,
      byType: summary.byType,
      breakdown: { typeLabels: topTypeKeys.map(shortEventLabel), rows },
    });
  }

  // Load a user's events in the current window for the inline row drill-down.
  async function loadUserEvents(profileId: string): Promise<Array<{ at: string; type: string; detail: string }>> {
    const res = await fetch(`/api/admin/user-events?userId=${profileId}&days=${days}`, { credentials: "include", cache: "no-store" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return [];
    return (body?.events ?? []) as Array<{ at: string; type: string; detail: string }>;
  }

  // Per-user PDF: every event the user made in the selected window.
  async function downloadUserEventLog(target: DirectoryPdfTarget) {
    let events: Array<{ at: string; type: string; detail: string }> = [];
    let truncated = false;
    if (target.signedUp && target.profileId) {
      const res = await fetch(`/api/admin/user-events?userId=${target.profileId}&days=${days}`, { credentials: "include", cache: "no-store" });
      const body = await res.json().catch(() => ({}));
      if (res.ok) { events = (body?.events ?? []) as typeof events; truncated = !!body?.truncated; }
    }
    const { generateUserEventLogPdf } = await import("@/lib/analytics/userEventLogPdf");
    generateUserEventLogPdf({
      name: target.name,
      email: target.email ?? "—",
      windowLabel: dayLabel(days),
      lastSeen: target.lastSeen,
      signedUp: target.signedUp,
      truncated,
      events,
    });
  }

  return (
    <main className="ds-page">
      <AppNavbar
        title="User Analytics"
        subtitle="Internal staff & other app users"
        menuItems={[
          { label: t("dashboard"), href: "/dashboard" },
          { label: "Admin Console", href: "/admin" },
          { label: "OEM Analytics", href: "/admin/analytics" },
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
            <header className="mb-6 flex flex-col gap-4 sm:mb-8 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">User Analytics</h1>
                <p className="mt-1 text-sm text-[var(--anchor-gray)] sm:text-base">
                  Everyone who isn&apos;t an OEM rep or consultant — internal Anchor staff and other signed-up users.
                </p>
              </div>
              {!loading && (
                <button
                  type="button"
                  data-track-id="user-analytics-export"
                  disabled={otherUsers.length === 0}
                  onClick={exportMasterPdf}
                  className="inline-flex h-9 items-center justify-center gap-1.5 self-start rounded-lg border border-[var(--anchor-green)] bg-[var(--anchor-green)] px-3 text-sm font-semibold text-white transition-colors hover:bg-[var(--anchor-deep)] disabled:cursor-not-allowed disabled:opacity-50 lg:self-end"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                  Master PDF
                  <span className="rounded-full bg-white/20 px-1.5 text-[11px] font-semibold">{dayLabel(days)}</span>
                </button>
              )}
            </header>

            {loadErr && (
              <Card className="mb-4 border-red-200 bg-red-50 p-4 text-sm text-red-700">{loadErr}</Card>
            )}

            {loading ? (
              <Card className="p-5 text-sm text-[var(--anchor-gray)]">Loading users…</Card>
            ) : (
              <div className="space-y-6 sm:space-y-8">
                <UserAnalyticsCharts summary={summary} />

                <Card className="overflow-hidden p-0">
                  <div className="border-b border-[var(--border-default)] px-4 py-3 sm:px-6">
                    <h2 className="text-base font-semibold">App users</h2>
                    <p className="mt-0.5 text-xs text-[var(--anchor-gray)]">
                      Internal staff and other users — search, filter, and export any user&apos;s activity.
                    </p>
                  </div>
                  <PeopleDirectory
                    scope="other"
                    appUsers={users}
                    days={days}
                    onDays={setDays}
                    dayOptions={DAY_FILTER_OPTIONS}
                    onLoadEvents={loadUserEvents}
                    onDownloadUserPdf={downloadUserEventLog}
                  />
                </Card>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
