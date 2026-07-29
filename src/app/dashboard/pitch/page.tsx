"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { AppNavbar } from "@/app/components/ui/AppNavbar";
import { Card } from "@/app/components/ui/Card";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { PitchThread, type PitchComment } from "@/app/components/marketing/PitchThread";
import {
  IDEA_CATEGORIES,
  CATEGORY_META,
  REVIEW_META,
  type CommentKind,
} from "@/lib/marketing/ideaConstants";
import { markPitchesSeen, newestActivityAt } from "@/lib/pitches/seen";
import { useSiteLive } from "@/lib/flags/useSiteLive";
import { NotLiveNotice } from "@/app/components/ui/NotLiveNotice";

export const dynamic = "force-dynamic";

/* ============================================================================
 * Pitch to Marketing — the submitter's surface (§5.3).
 *
 * Any authorized internal user can pitch a marketing idea and track it here.
 * The list is scoped by RLS to this user's own pitches; there is no way to see
 * the rest of the Strategy Board from this page.
 * ==========================================================================*/

type Pitch = {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  status: string | null;
  review_status: string | null;
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

export default function PitchPage() {
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const { t } = useTranslation();

  const [userId, setUserId] = useState("");
  const [ready, setReady] = useState(false);
  const { live, ready: liveReady } = useSiteLive();

  const [pitches, setPitches] = useState<Pitch[]>([]);
  const [threads, setThreads] = useState<Record<string, PitchComment[]>>({});
  const [unavailable, setUnavailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  // Form.
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<string>("campaign");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!alive) return;
      if (!data.user) { router.replace("/"); return; }
      setUserId(data.user.id);
      setReady(true);
    })();
    return () => { alive = false; };
  }, [router, supabase]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/pitches", { cache: "no-store", credentials: "include" });
      const json = await res.json().catch(() => null);
      if (!res.ok) { setErr(json?.error || "Couldn't load your pitches."); return; }
      setUnavailable(Boolean(json?.unavailable));
      setPitches((json?.pitches ?? []) as Pitch[]);
      setThreads((json?.threads ?? {}) as Record<string, PitchComment[]>);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (ready && live) void load(); }, [ready, live, load]);

  // Opening the page is "seeing" the current activity — clears the nav badge.
  useEffect(() => {
    if (loading || !pitches.length) return;
    const newest = newestActivityAt(pitches, threads);
    if (newest) markPitchesSeen(newest);
  }, [loading, pitches, threads]);

  async function submitPitch(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setErr(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/pitches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ title, description, category, notes }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) { setErr(json?.error || "That didn't send."); return; }
      setTitle(""); setDescription(""); setNotes(""); setCategory("campaign");
      setSent(true);
      setTimeout(() => setSent(false), 5000);
      await load();
    } finally {
      setSubmitting(false);
    }
  }

  const reply = useCallback(
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

  return (
    <main className="ds-page">
      <AppNavbar
        title="Pitch to Marketing"
        subtitle="Send marketing an idea"
        menuItems={[{ label: t("dashboard"), href: "/dashboard" }]}
      />

      <div className="ds-container py-6 pb-[calc(3rem+env(safe-area-inset-bottom))] sm:py-10">
        {!liveReady ? (
          <Card className="p-5 text-sm text-black/60">{t("loading")}</Card>
        ) : !live ? (
          <NotLiveNotice />
        ) : (
        <>
        <header className="mb-5">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Pitch an idea to Marketing</h1>
          <p className="mt-1 text-sm text-[var(--anchor-gray)] sm:text-base">
            Got a campaign, an event, a piece of content worth making? Send it over. Marketing reviews every
            pitch and tells you where it landed — approved with a timeline, or declined with the reason.
          </p>
        </header>

        {unavailable && (
          <Card className="mb-4 border-[#fde68a] bg-[#fffbeb] p-4 text-sm text-[#7c4a00]">
            Pitching isn&apos;t switched on yet — the database migration is still pending. You can look around,
            but submissions won&apos;t save.
          </Card>
        )}
        {err && <Card className="mb-4 border-red-200 bg-red-50 p-4 text-sm text-red-700">{err}</Card>}
        {sent && (
          <Card className="mb-4 border-[var(--anchor-green)]/30 bg-[var(--anchor-mint)] p-4 text-sm text-[var(--anchor-deep)]">
            Sent. Marketing has been notified — you&apos;ll hear back here and by email.
          </Card>
        )}

        <Card className="mb-8 p-4 sm:p-6">
          <form onSubmit={submitPitch} className="space-y-4">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-[var(--anchor-gray)]">Title</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                placeholder="Snow-retention campaign for Northeast contractors"
                className="h-11 w-full rounded-xl border border-[var(--border-default)] bg-white px-3 text-sm outline-none focus:border-[var(--anchor-green)]"
              />
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-[var(--anchor-gray)]">The idea</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                required
                rows={4}
                placeholder="What is it, who is it for, and why now?"
                className="w-full rounded-xl border border-[var(--border-default)] bg-white p-3 text-sm outline-none focus:border-[var(--anchor-green)]"
              />
            </label>

            <label className="block sm:max-w-xs">
              <span className="mb-1 block text-xs font-semibold text-[var(--anchor-gray)]">Category</span>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="h-11 w-full rounded-xl border border-[var(--border-default)] bg-white px-3 text-sm outline-none focus:border-[var(--anchor-green)]"
              >
                {IDEA_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-[var(--anchor-gray)]">
                Supporting notes <span className="font-normal">(optional)</span>
              </span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Customers who asked for this, competitors doing it, links…"
                className="w-full rounded-xl border border-[var(--border-default)] bg-white p-3 text-sm outline-none focus:border-[var(--anchor-green)]"
              />
            </label>

            <button
              type="submit"
              disabled={submitting}
              className="h-11 rounded-xl bg-[var(--anchor-green)] px-6 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
            >
              {submitting ? "Sending…" : "Send to Marketing"}
            </button>
          </form>
        </Card>

        <h2 className="mb-3 text-lg font-bold tracking-tight">My Pitches</h2>

        {loading ? (
          <Card className="p-5 text-sm text-black/60">{t("loading")}</Card>
        ) : pitches.length === 0 ? (
          <Card className="p-8 text-center text-sm text-[var(--anchor-gray)]">
            Nothing pitched yet. Your ideas will show up here with marketing&apos;s response.
          </Card>
        ) : (
          <ul className="space-y-3">
            {pitches.map((p) => {
              const review = REVIEW_META[p.review_status ?? ""] ?? { label: "—", cls: "bg-[var(--surface-soft)] text-[var(--anchor-gray)]" };
              const cat = CATEGORY_META[p.category ?? ""];
              const thread = threads[p.id] ?? [];
              const isOpen = open === p.id;
              const needsInfo = p.review_status === "needs_info";

              return (
                <li key={p.id}>
                  <Card className="overflow-hidden p-0">
                    <button
                      type="button"
                      onClick={() => setOpen(isOpen ? null : p.id)}
                      className="flex w-full items-start gap-3 p-4 text-left transition-colors hover:bg-[var(--surface-soft)] sm:p-5"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                          <span className="text-sm font-semibold text-[var(--anchor-deep)] sm:text-base">{p.title}</span>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${review.cls}`}>
                            {review.label}
                          </span>
                          {cat && (
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${cat.cls}`}>
                              {cat.label}
                            </span>
                          )}
                          {needsInfo && (
                            <span className="rounded-full bg-[#fdf3e2] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#8a6d3b]">
                              Needs your reply
                            </span>
                          )}
                        </div>
                        <div className="mt-1 text-xs text-[var(--anchor-gray)]">
                          Sent {fmtDate(p.created_at)}
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
                        {p.description && (
                          <p className="whitespace-pre-wrap text-sm text-[var(--text-primary)]">{p.description}</p>
                        )}

                        {p.review_status === "approved" && (
                          <div className="rounded-xl bg-[var(--anchor-mint)] p-3 text-sm text-[var(--anchor-deep)]">
                            <b>Approved.</b> Planned timeline: {p.planned_timeline || "—"}
                          </div>
                        )}
                        {p.review_status === "declined" && (
                          <div className="rounded-xl bg-[#fbeaea] p-3 text-sm text-[#9c3f3f]">
                            <b>Not moving forward.</b> {p.decline_reason || "—"}
                          </div>
                        )}

                        <PitchThread
                          comments={thread}
                          currentUserId={userId}
                          replyKind={needsInfo ? "info_response" : "comment"}
                          replyLabel={needsInfo ? "Send info" : "Reply"}
                          placeholder={
                            needsInfo
                              ? "Answer marketing's question…"
                              : "Add anything else marketing should know…"
                          }
                          onReply={(bodyText, kind) => reply(p.id, bodyText, kind)}
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
    </main>
  );
}
