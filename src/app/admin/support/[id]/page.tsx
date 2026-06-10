"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import MessageAttachments, { type SupportAttachmentView } from "@/app/components/support/MessageAttachments";
import ImagePicker from "@/app/components/support/ImagePicker";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { AppNavbar } from "@/app/components/ui/AppNavbar";
import { Card } from "@/app/components/ui/Card";
import { getViewAs } from "@/lib/role/viewAs";

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
  attachments?: SupportAttachmentView[];
  created_at: string;
};

function formatStamp(iso: string) {
  return new Date(iso).toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  });
}

export default function AdminSupportThread() {
  const params = useParams() as { id?: string };
  const id = params.id || "";
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);

  const [ready, setReady] = useState(false);
  const [denied, setDenied] = useState(false);
  const [me, setMe] = useState<string | null>(null);
  const [request, setRequest] = useState<Request | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [reply, setReply] = useState("");
  const [replyImages, setReplyImages] = useState<File[]>([]);
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
      // Same View-As handoff as the admin queue: a previewing admin should
      // see the user-facing thread, not the admin reply UI.
      if (getViewAs()) { router.replace(`/dashboard/support/${id}`); return; }
      setMe(data.user.id);
      const { data: prof } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.user.id)
        .maybeSingle();
      const role = String((prof as { role?: string } | null)?.role || "");
      if (role !== "admin") { setDenied(true); setReady(true); return; }
      setReady(true);
      await load();
    })();
    return () => { alive = false; };
  }, [router, supabase, load, id]);

  async function send(close = false) {
    if (sending) return;
    setSendError(null);
    const m = reply.trim();
    if (!m && !close && replyImages.length === 0) { setSendError("Type a reply or use Close request."); return; }
    try {
      setSending(true);
      const fd = new FormData();
      fd.append("message", m);
      fd.append("close", String(close));
      for (const f of replyImages) fd.append("images", f);
      const res = await fetch(`/api/support/${id}`, { method: "POST", body: fd });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "Failed.");
      setReply("");
      setReplyImages([]);
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
          { label: "Admin Console", href: "/admin" },
          { label: "Queue", href: "/admin/support" },
        ]}
      />

      <div className="mx-auto max-w-3xl px-5 py-6 pb-[calc(2rem+env(safe-area-inset-bottom))]">
        <Link href="/admin/support" className="text-sm text-[var(--anchor-green)] hover:underline">
          ← Queue
        </Link>

        {!ready ? (
          <Card className="mt-4 p-5 text-sm text-black/60">Loading…</Card>
        ) : denied ? (
          <Card className="mt-4 border-[var(--anchor-deep)]/25 bg-[var(--anchor-mint)] p-5 text-sm text-[var(--anchor-deep)]">
            Admin access only.
          </Card>
        ) : loading ? (
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
                From {request.submitter_name || "user"}
                {request.submitter_email ? ` <${request.submitter_email}>` : ""}
                {request.submitter_role ? ` · ${request.submitter_role}` : ""}
                {" · filed "}
                {new Date(request.created_at).toLocaleString()}
              </div>
            </Card>

            <ol className="mt-4 space-y-3">
              {messages.map((m) => {
                const isAdmin = m.author_role === "admin";
                const isMine = me === m.author_id;
                return (
                  <li
                    key={m.id}
                    className={
                      "rounded-2xl border p-4 " +
                      (isAdmin
                        ? "border-[var(--anchor-green)]/40 bg-[var(--anchor-mint)]/30"
                        : "border-[var(--border-default)] bg-white")
                    }
                  >
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="font-semibold text-[var(--anchor-deep)]">
                        {isAdmin ? (isMine ? "You (admin)" : "Anchor Admin") : (m.author_role || "User")}
                      </span>
                      <span className="text-[var(--anchor-gray)]">{formatStamp(m.created_at)}</span>
                    </div>
                    <div className="mt-2 whitespace-pre-wrap text-sm text-[var(--anchor-deep)]">{m.body}</div>
                    <MessageAttachments attachments={m.attachments} />
                  </li>
                );
              })}
            </ol>

            <Card className="mt-4 p-4">
              <label className="block text-sm font-semibold text-[var(--anchor-deep)]">Reply</label>
              <textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                rows={4}
                maxLength={5000}
                placeholder="Reply to the requester. They'll get an email when this is sent."
                className="mt-1 block w-full rounded-xl border border-[var(--border-default)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--anchor-green)]"
              />
              <div className="mt-2">
                <ImagePicker images={replyImages} onChange={setReplyImages} />
              </div>
              {sendError && (
                <div className="mt-2 rounded-xl bg-[#fef2f2] px-3 py-2 text-sm text-[#991b1b]">{sendError}</div>
              )}
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => send(false)}
                  disabled={sending}
                  className="inline-flex items-center justify-center rounded-full bg-[var(--anchor-deep)] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[var(--anchor-green)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {sending ? "Sending…" : "Send reply"}
                </button>
                <button
                  type="button"
                  onClick={() => send(true)}
                  disabled={sending || request.status === "closed"}
                  className="inline-flex items-center justify-center rounded-full bg-white px-4 py-2 text-sm font-semibold text-[var(--anchor-deep)] ring-1 ring-[var(--border-default)] transition hover:bg-[var(--anchor-mint)]/30 disabled:cursor-not-allowed disabled:opacity-50"
                  title={request.status === "closed" ? "Already closed" : "Send reply (if any) and close thread"}
                >
                  Reply &amp; close
                </button>
              </div>
            </Card>
          </>
        )}
      </div>
    </main>
  );
}
