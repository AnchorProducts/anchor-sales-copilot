"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { AppNavbar } from "@/app/components/ui/AppNavbar";
import { Card } from "@/app/components/ui/Card";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { PitchThread, type PitchComment } from "@/app/components/marketing/PitchThread";
import { CATEGORY_META, REVIEW_META, type CommentKind } from "@/lib/marketing/ideaConstants";
import { useSiteLive } from "@/lib/flags/useSiteLive";
import { NotLiveNotice } from "@/app/components/ui/NotLiveNotice";
import { MarketingHubNav } from "@/app/components/marketing/MarketingHubNav";

/* ============================================================================
 * Strategy Board → Submissions (§5.4). The marketing/admin side of Pitch to
 * Marketing: the queue of pitches waiting on a decision.
 *
 * Same table, same query as the portal's inbox — this is the app's surface over
 * it. Approving places the pitch on the shared board in "Considering", after
 * which it behaves like any other board idea.
 *
 * Rendered in two places, following the OrdersPanel/InventoryPanel convention:
 *   • standalone at /marketing/submissions (its own nav shell + hub nav)
 *   • embedded as the Submissions tab of the Marketing Admin Center
 * Everything behind the "Site live" flag, same as the rest of the pitch flow.
 * ==========================================================================*/

type Submission = {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  status: string | null;
  review_status: string | null;
  submitted_by: string | null;
  submitter_team: string | null;
  planned_timeline: string | null;
  decline_reason: string | null;
  reviewed_at: string | null;
  created_at: string;
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "—"
    : d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export default function SubmissionsPanel({
  embedded = false,
}: { embedded?: boolean } = {}) {
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const { t } = useTranslation();

  const [userId, setUserId] = useState("");
  const [ready, setReady] = useState(false);
  const { live, ready: liveReady } = useSiteLive();

  const [rows, setRows] = useState<Submission[]>([]);
  const [threads, setThreads] = useState<Record<string, PitchComment[]>>({});
  const [submitters, setSubmitters] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [denial, setDenial] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!alive) return;
      // Embedded, the host page owns the auth redirect — don't fight it.
      if (!data.user) {
        if (!embedded) router.replace("/");
        return;
      }
      setUserId(data.user.id);
      setReady(true);
    })();
    return () => { alive = false; };
  }, [router, supabase, embedded]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch(`/api/marketing/submissions${showAll ? "?all=1" : ""}`, {
        cache: "no-store",
        credentials: "include",
      });
      if (res.status === 403) {
        const why = await res.json().catch(() => null);
        setForbidden(true);
        setDenial(typeof why?.reason === "string" ? why.reason : null);
        return;
      }
      const json = await res.json().catch(() => null);
      if (!res.ok) { setErr(json?.error || "Couldn't load submissions."); return; }
      setForbidden(false);
      setUnavailable(Boolean(json?.unavailable));
      setRows((json?.submissions ?? []) as Submission[]);
      setThreads((json?.threads ?? {}) as Record<string, PitchComment[]>);
      setSubmitters((json?.submitters ?? {}) as Record<string, string>);
    } finally {
      setLoading(false);
    }
  }, [showAll]);

  useEffect(() => { if (ready && live) void load(); }, [ready, live, load]);

  async function decide(id: string, action: "approve" | "decline") {
    const prompt_ =
      action === "approve"
        ? window.prompt("What timeline should the submitter expect? (e.g. \"Q4 2026\" or \"next sprint\")")
        : window.prompt("Why is this declined? The submitter will see this.");
    const value = (prompt_ ?? "").trim();
    if (!value) return; // cancelled, or left blank — both required

    setBusy(id);
    setErr(null);
    try {
      const res = await fetch(`/api/marketing/submissions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(
          action === "approve" ? { action, planned_timeline: value } : { action, decline_reason: value }
        ),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) { setErr(json?.error || "That didn't save."); return; }
      await load();
    } finally {
      setBusy(null);
    }
  }

  const comment = useCallback(
    async (ideaId: string, body: string, kind: CommentKind) => {
      const res = await fetch(`/api/pitches/${ideaId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ body, kind }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) { setErr(json?.error || "That didn't send."); return false; }
      await load();
      return true;
    },
    [load]
  );

  async function requestInfo(id: string) {
    const question = (window.prompt("What do you need from the submitter?") ?? "").trim();
    if (!question) return;
    setBusy(id);
    try {
      await comment(id, question, "info_request");
    } finally {
      setBusy(null);
    }
  }

  const authorName = useCallback(
    (id: string | null) => (id ? submitters[id] ?? null : null),
    [submitters]
  );

  const shell = (
    <div
      className={
        embedded ? "pt-4 pb-[calc(6rem+env(safe-area-inset-bottom))] lg:pb-4" : "ds-container py-6 pb-[calc(3rem+env(safe-area-inset-bottom))] sm:py-10"
      }
    >
      {!ready || !liveReady ? (
        <Card className="p-5 text-sm text-black/60">{t("loading")}</Card>
      ) : !live ? (
        // Embedded, the tab isn't rendered at all when the flag is off — this
        // only fires on the standalone route.
        <NotLiveNotice />
      ) : forbidden ? (
        <Card className="border-[var(--anchor-deep)]/25 bg-[var(--anchor-mint)] p-5 text-sm text-[var(--anchor-deep)]">
          {denial === "not_internal_deploy" ? (
            <>
              The Marketing Hub only runs on the internal build of the app. Your account is fine — this
              copy of the site is the external one. Open the internal site instead. (Running locally?
              Set <code>NEXT_PUBLIC_APP_MODE=internal</code> in <code>.env.local</code> and restart.)
            </>
          ) : (
            <>
              The Marketing Hub is limited to admins and the Marketing team. If that should be you, an
              admin can add you in Admin → Portal Access.
            </>
          )}
        </Card>
      ) : (
        <>
          {!embedded && <MarketingHubNav />}

          <header className="mb-5">
            {embedded ? (
              <p className="text-sm text-[var(--anchor-gray)]">
                Marketing ideas pitched by the rest of the company. Approving puts the idea straight onto the
                Strategy Board under <b>Considering</b>, and tells the submitter the timeline you set.
              </p>
            ) : (
              <>
                <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Submissions</h1>
                <p className="mt-1 text-sm text-[var(--anchor-gray)] sm:text-base">
                  Marketing ideas pitched by the rest of the company. Approving puts the idea straight onto the
                  Strategy Board under <b>Considering</b>, and tells the submitter the timeline you set.
                </p>
              </>
            )}
          </header>

          {unavailable && (
            <Card className="mb-4 border-[#fde68a] bg-[#fffbeb] p-4 text-sm text-[#7c4a00]">
              The pitch tables aren&apos;t migrated yet, so this queue is empty by default.
            </Card>
          )}
          {err && <Card className="mb-4 border-red-200 bg-red-50 p-4 text-sm text-red-700">{err}</Card>}

          <div className="mb-4 flex gap-2">
            <button
              type="button"
              onClick={() => setShowAll(false)}
              className={
                "rounded-full border px-4 py-2 text-[12px] font-semibold transition " +
                (!showAll
                  ? "border-[var(--anchor-green)] bg-[var(--anchor-green)] text-white"
                  : "border-black/10 bg-white text-black hover:bg-[var(--surface-soft)]")
              }
            >
              Awaiting decision
            </button>
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className={
                "rounded-full border px-4 py-2 text-[12px] font-semibold transition " +
                (showAll
                  ? "border-[var(--anchor-green)] bg-[var(--anchor-green)] text-white"
                  : "border-black/10 bg-white text-black hover:bg-[var(--surface-soft)]")
              }
            >
              All pitches
            </button>
          </div>

          {loading ? (
            <Card className="p-5 text-sm text-black/60">{t("loading")}</Card>
          ) : rows.length === 0 ? (
            <Card className="p-8 text-center text-sm text-[var(--anchor-gray)]">
              {showAll ? "No pitches yet." : "Nothing waiting on you. Nice."}
            </Card>
          ) : (
            <ul className="space-y-3">
              {rows.map((s) => {
                const review = REVIEW_META[s.review_status ?? ""] ?? {
                  label: "—",
                  cls: "bg-[var(--surface-soft)] text-[var(--anchor-gray)]",
                };
                const cat = CATEGORY_META[s.category ?? ""];
                const thread = threads[s.id] ?? [];
                const isOpen = open === s.id;
                const decided = s.review_status === "approved" || s.review_status === "declined";
                const rowBusy = busy === s.id;

                return (
                  <li key={s.id}>
                    <Card className="overflow-hidden p-0">
                      <button
                        type="button"
                        onClick={() => setOpen(isOpen ? null : s.id)}
                        className="flex w-full items-start gap-3 p-4 text-left transition-colors hover:bg-[var(--surface-soft)] sm:p-5"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                            <span className="text-sm font-semibold text-[var(--anchor-deep)] sm:text-base">{s.title}</span>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${review.cls}`}>
                              {review.label}
                            </span>
                            {cat && (
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cat.cls}`}>
                                {cat.label}
                              </span>
                            )}
                          </div>
                          <div className="mt-1 text-xs text-[var(--anchor-gray)]">
                            {(s.submitted_by && submitters[s.submitted_by]) || "Unknown"}
                            {s.submitter_team && ` · ${s.submitter_team}`}
                            {` · ${fmtDate(s.created_at)}`}
                            {thread.length > 0 && ` · ${thread.length} message${thread.length === 1 ? "" : "s"}`}
                          </div>
                        </div>
                        <svg
                          viewBox="0 0 24 24"
                          className={`h-4 w-4 shrink-0 text-[var(--anchor-gray)] transition-transform ${isOpen ? "rotate-180" : ""}`}
                          fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden
                        >
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </button>

                      {isOpen && (
                        <div className="space-y-4 border-t border-[var(--border-default)] p-4 sm:p-5">
                          {s.description && (
                            <p className="whitespace-pre-wrap text-sm text-[var(--text-primary)]">{s.description}</p>
                          )}

                          {s.review_status === "approved" && (
                            <div className="rounded-xl bg-[var(--anchor-mint)] p-3 text-sm text-[var(--anchor-deep)]">
                              <b>Approved.</b> Timeline: {s.planned_timeline || "—"} · On the board under Considering.
                            </div>
                          )}
                          {s.review_status === "declined" && (
                            <div className="rounded-xl bg-[#fbeaea] p-3 text-sm text-[#9c3f3f]">
                              <b>Declined.</b> {s.decline_reason || "—"}
                            </div>
                          )}

                          {!decided && (
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                disabled={rowBusy}
                                onClick={() => void decide(s.id, "approve")}
                                className="h-10 rounded-xl bg-[var(--anchor-green)] px-4 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                disabled={rowBusy}
                                onClick={() => void requestInfo(s.id)}
                                className="h-10 rounded-xl border border-[var(--border-default)] bg-white px-4 text-sm font-semibold text-[var(--anchor-deep)] transition-colors hover:bg-[var(--surface-soft)] disabled:opacity-50"
                              >
                                Request info
                              </button>
                              <button
                                type="button"
                                disabled={rowBusy}
                                onClick={() => void decide(s.id, "decline")}
                                className="h-10 rounded-xl border border-[var(--border-default)] bg-white px-4 text-sm font-semibold text-red-700 transition-colors hover:bg-red-50 disabled:opacity-50"
                              >
                                Decline
                              </button>
                            </div>
                          )}

                          <PitchThread
                            comments={thread}
                            currentUserId={userId}
                            authorName={authorName}
                            replyKind="comment"
                            replyLabel="Reply"
                            placeholder="Reply to the submitter…"
                            onReply={(bodyText, kind) => comment(s.id, bodyText, kind)}
                          />
                        </div>
                      )}
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );

  if (embedded) return shell;

  return (
    <main className="ds-page">
      <AppNavbar
        title="Submissions"
        subtitle="Pitches from the rest of the company"
        menuItems={[{ label: t("dashboard"), href: "/dashboard" }]}
      />
      {shell}
    </main>
  );
}
