"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { AppNavbar } from "@/app/components/ui/AppNavbar";
import { Card } from "@/app/components/ui/Card";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { getViewAs } from "@/lib/role/viewAs";

export const dynamic = "force-dynamic";

type RequestRow = {
  id: string;
  subject: string;
  status: string;
  submitter_name: string | null;
  submitter_email: string | null;
  submitter_role: string | null;
  created_at: string;
  last_message_at: string;
};

function timeAgo(iso: string) {
  const then = new Date(iso).getTime();
  const diff = (Date.now() - then) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 7) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default function SupportListPage() {
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const { t } = useTranslation();

  const [items, setItems] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!alive) return;
      if (!data.user) { router.replace("/"); return; }
      // Admins managing support get bounced to the dedicated queue — but
      // *only* when they're truly viewing as themselves. If an admin has
      // toggled View-As to preview the external/internal experience, let
      // them see the user-facing form like a regular rep would.
      const { data: prof } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.user.id)
        .maybeSingle();
      if (!alive) return;
      const realRole = (prof as { role?: string } | null)?.role;
      const override = getViewAs();
      if (realRole === "admin" && !override) {
        router.replace("/admin/support");
        return;
      }
      await load();
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load() {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/support", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to load.");
      setItems(json.items || []);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setSubmitError(null);
    const s = subject.trim();
    const m = message.trim();
    if (!s || !m) { setSubmitError("Subject and message are both required."); return; }
    try {
      setSubmitting(true);
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ subject: s, message: m }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to submit.");
      setSubject("");
      setMessage("");
      router.push(`/dashboard/support/${json.id}`);
    } catch (e) {
      setSubmitError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="ds-page">
      <AppNavbar
        title="Support"
        subtitle="Get help from an Anchor admin"
        menuItems={[{ label: t("dashboard"), href: "/dashboard" }]}
      />

      <div className="mx-auto max-w-3xl px-5 py-6 pb-[calc(2rem+env(safe-area-inset-bottom))]">
        {/* New request form */}
        <Card className="border-t-4 border-t-[var(--anchor-green)] p-6">
          <div className="ds-caption">New request</div>
          <h1 className="mt-2 text-2xl text-[var(--anchor-deep)]">Need a hand?</h1>
          <p className="mt-1 text-sm text-[var(--anchor-gray)]">
            Anchor admins read every request. We&rsquo;ll reply in the app and email you when there&rsquo;s an answer.
          </p>

          <form data-tutorial="support-form" onSubmit={submit} className="mt-5 space-y-4">
            <div>
              <label className="block text-sm font-semibold text-[var(--anchor-deep)]">Subject</label>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                maxLength={200}
                placeholder="What do you need help with?"
                className="mt-1 block w-full rounded-xl border border-[var(--border-default)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--anchor-green)]"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-[var(--anchor-deep)]">Message</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={5000}
                rows={6}
                placeholder="Describe the issue, what you tried, and anything an admin needs to know."
                className="mt-1 block w-full rounded-xl border border-[var(--border-default)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--anchor-green)]"
              />
            </div>
            {submitError && (
              <div className="rounded-xl bg-[#fef2f2] px-3 py-2 text-sm text-[#991b1b]">{submitError}</div>
            )}
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center justify-center rounded-full bg-[var(--anchor-deep)] px-5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--anchor-green)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Sending…" : "Send request"}
            </button>
          </form>
        </Card>

        {/* Your past requests */}
        <div data-tutorial="support-list" className="mt-8">
          <h2 className="px-1 text-lg font-bold text-[var(--anchor-deep)]">Your requests</h2>
          {loading ? (
            <Card className="mt-3 p-5 text-sm text-black/60">Loading…</Card>
          ) : error ? (
            <Card className="mt-3 p-5 text-sm text-[#991b1b]">{error}</Card>
          ) : items.length === 0 ? (
            <Card className="mt-3 p-5 text-sm text-[var(--anchor-gray)]">
              No support requests yet. File one above and an admin will get back to you.
            </Card>
          ) : (
            <ul className="mt-3 space-y-2">
              {items.map((r) => (
                <li key={r.id}>
                  <Link
                    href={`/dashboard/support/${r.id}`}
                    className="block rounded-2xl border border-[var(--border-default)] bg-white p-4 transition hover:border-[var(--anchor-green)] hover:bg-[var(--anchor-mint)]/30"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-[var(--anchor-deep)]">{r.subject}</div>
                        <div className="text-xs text-[var(--anchor-gray)]">Last activity {timeAgo(r.last_message_at)}</div>
                      </div>
                      <span className={
                        "shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide " +
                        (r.status === "open"
                          ? "bg-[var(--anchor-mint)] text-[var(--anchor-deep)]"
                          : "bg-black/[0.06] text-black/55")
                      }>
                        {r.status}
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </main>
  );
}
