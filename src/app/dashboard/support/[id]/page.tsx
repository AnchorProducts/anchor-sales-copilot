"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { AppNavbar } from "@/app/components/ui/AppNavbar";
import { Card } from "@/app/components/ui/Card";
import { useTranslation } from "@/lib/i18n/useTranslation";

export const dynamic = "force-dynamic";

type Request = {
  id: string;
  created_by: string;
  subject: string;
  status: string;
  submitter_name: string | null;
  submitter_email: string | null;
  submitter_role: string | null;
  created_at: string;
  last_message_at: string;
};

type Message = {
  id: string;
  author_id: string;
  author_role: string | null;
  body: string;
  created_at: string;
};

function formatStamp(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function SupportThreadPage() {
  const params = useParams() as { id?: string };
  const id = params.id || "";
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const { t } = useTranslation();

  const [me, setMe] = useState<string | null>(null);
  const [request, setRequest] = useState<Request | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/support/${id}`, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to load.");
      setRequest(json.request as Request);
      setMessages((json.messages || []) as Message[]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!alive) return;
      if (!data.user) { router.replace("/"); return; }
      setMe(data.user.id);
      await load();
    })();
    return () => { alive = false; };
  }, [router, supabase, load]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (sending) return;
    setSendError(null);
    const m = reply.trim();
    if (!m) { setSendError("Type a reply first."); return; }
    try {
      setSending(true);
      const res = await fetch(`/api/support/${id}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: m }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed to send.");
      setReply("");
      await load();
    } catch (e) {
      setSendError((e as Error).message);
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="ds-page">
      <AppNavbar
        title="Support thread"
        subtitle={request?.subject || ""}
        menuItems={[
          { label: t("dashboard"), href: "/dashboard" },
          { label: "All requests", href: "/dashboard/support" },
        ]}
      />

      <div className="mx-auto max-w-3xl px-5 py-6 pb-[calc(2rem+env(safe-area-inset-bottom))]">
        <Link href="/dashboard/support" className="text-sm text-[var(--anchor-green)] hover:underline">
          ← All requests
        </Link>

        {loading ? (
          <Card className="mt-4 p-5 text-sm text-black/60">Loading…</Card>
        ) : error || !request ? (
          <Card className="mt-4 p-5 text-sm text-[#991b1b]">{error || "Not found."}</Card>
        ) : (
          <>
            <Card className="mt-4 border-t-4 border-t-[var(--anchor-green)] p-5">
              <div className="flex items-center justify-between gap-3">
                <h1 className="text-xl font-bold text-[var(--anchor-deep)]">{request.subject}</h1>
                <span className={
                  "shrink-0 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide " +
                  (request.status === "open"
                    ? "bg-[var(--anchor-mint)] text-[var(--anchor-deep)]"
                    : "bg-black/[0.06] text-black/55")
                }>
                  {request.status}
                </span>
              </div>
              <div className="mt-1 text-xs text-[var(--anchor-gray)]">
                Filed by {request.submitter_name || request.submitter_email || "user"} on {new Date(request.created_at).toLocaleString()}
              </div>
            </Card>

            <ol className="mt-4 space-y-3">
              {messages.map((m) => {
                const isMine = me === m.author_id;
                const isAdmin = m.author_role === "admin";
                return (
                  <li
                    key={m.id}
                    className={
                      "rounded-2xl border p-4 " +
                      (isAdmin
                        ? "border-[var(--anchor-green)]/40 bg-[var(--anchor-mint)]/30"
                        : isMine
                          ? "border-[var(--border-default)] bg-white"
                          : "border-[var(--border-default)] bg-white")
                    }
                  >
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="font-semibold text-[var(--anchor-deep)]">
                        {isAdmin ? "Anchor Admin" : isMine ? "You" : (m.author_role || "User")}
                      </span>
                      <span className="text-[var(--anchor-gray)]">{formatStamp(m.created_at)}</span>
                    </div>
                    <div className="mt-2 whitespace-pre-wrap text-sm text-[var(--anchor-deep)]">{m.body}</div>
                  </li>
                );
              })}
            </ol>

            <Card className="mt-4 p-4">
              <form onSubmit={send} className="space-y-3">
                <label className="block text-sm font-semibold text-[var(--anchor-deep)]">Reply</label>
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  rows={4}
                  maxLength={5000}
                  placeholder="Add more detail or follow up here."
                  className="block w-full rounded-xl border border-[var(--border-default)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--anchor-green)]"
                />
                {sendError && (
                  <div className="rounded-xl bg-[#fef2f2] px-3 py-2 text-sm text-[#991b1b]">{sendError}</div>
                )}
                <button
                  type="submit"
                  disabled={sending}
                  className="inline-flex items-center justify-center rounded-full bg-[var(--anchor-deep)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--anchor-green)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {sending ? "Sending…" : "Send reply"}
                </button>
              </form>
            </Card>
          </>
        )}
      </div>
    </main>
  );
}
