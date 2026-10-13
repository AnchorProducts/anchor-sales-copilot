"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import MessageAttachments, { type SupportAttachmentView } from "@/app/components/support/MessageAttachments";
import ImagePicker from "@/app/components/support/ImagePicker";

type ChatMessage = {
  id: string;
  author_id: string;
  author_role: string | null;
  author_name: string | null;
  body: string;
  attachments?: SupportAttachmentView[];
  created_at: string;
};

function formatStamp(iso: string) {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/* KEEP THE LINKS WE ALREADY HAVE.
 *
 * Every poll comes back with each attachment signed afresh, and a signed URL
 * carries a new token each time — so swapping it into the <img> made the browser
 * download every photo in the thread again, every 8 seconds, for as long as the
 * thread was open. That is Supabase storage egress, and in Oct 2026 the project
 * went over its quota.
 *
 * So a message already on screen keeps the links it was first given, and an
 * unchanged src is never re-fetched. Links are re-taken after 45 minutes, well
 * inside the server's one-hour expiry, so opening a photo full-size still works
 * on a thread left open all afternoon. */
const RESIGN_AFTER_MS = 45 * 60 * 1000;

function keepSignedLinks(prev: ChatMessage[], next: ChatMessage[], signedAt: Map<string, number>) {
  const now = Date.now();
  const before = new Map(prev.map((m) => [m.id, m]));
  return next.map((m) => {
    const old = before.get(m.id);
    const at = signedAt.get(m.id);
    if (old?.attachments?.length && at && now - at < RESIGN_AFTER_MS) {
      return { ...m, attachments: old.attachments };
    }
    signedAt.set(m.id, now);
    return m;
  });
}

// Per-order chat thread between the submitting rep and admins. Used on both the
// rep order-history view and the admin marketing-orders console. Loads the
// thread, polls for new messages while open, and posts text + photo replies.
export default function MarketingOrderChat({ orderId }: { orderId: string }) {
  const [me, setMe] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [draft, setDraft] = useState("");
  const [images, setImages] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement | null>(null);
  // When each message's attachment links were signed — see keepSignedLinks.
  const signedAt = useRef(new Map<string, number>());

  const load = useCallback(
    async (opts?: { quiet?: boolean }) => {
      if (!opts?.quiet) setLoading(true);
      try {
        const res = await fetch(`/api/marketing-orders/${orderId}/messages`, { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (!res.ok) {
          setError(json?.error || "Failed to load messages.");
          return;
        }
        setError(null);
        setMe(json?.me ?? null);
        setMessages((prev) => keepSignedLinks(prev, json?.messages || [], signedAt.current));
        // Opening/viewing the thread counts as reading it — clear unread server-side.
        void fetch(`/api/marketing-orders/${orderId}/messages`, { method: "PATCH" }).catch(() => {});
      } catch (e) {
        setError((e as Error)?.message || "Failed to load messages.");
      } finally {
        if (!opts?.quiet) setLoading(false);
      }
    },
    [orderId]
  );

  // Initial load + light polling so a reply from the other side shows up without
  // a manual refresh (the app uses polling, not realtime, elsewhere too).
  // Not while the tab is in the background: nobody is reading it, and every poll
  // is a request. Catches up the moment the tab is looked at again.
  useEffect(() => {
    load();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") load({ quiet: true });
    }, 8000);
    const onShow = () => document.visibilityState === "visible" && load({ quiet: true });
    document.addEventListener("visibilitychange", onShow);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onShow);
    };
  }, [load]);

  // Keep the newest message in view as the thread grows.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length]);

  async function send() {
    const text = draft.trim();
    if (!text && images.length === 0) return;
    setSending(true);
    setSendError(null);
    try {
      const form = new FormData();
      form.set("message", text);
      for (const img of images) form.append("images", img);
      const res = await fetch(`/api/marketing-orders/${orderId}/messages`, {
        method: "POST",
        body: form,
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setSendError(json?.error || "Failed to send.");
        return;
      }
      setDraft("");
      setImages([]);
      await load({ quiet: true });
    } catch (e) {
      setSendError((e as Error)?.message || "Failed to send.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-soft)] p-3">
      <div className="max-h-72 space-y-3 overflow-y-auto pr-1">
        {loading ? (
          <div className="text-sm text-[var(--anchor-gray)]">Loading messages…</div>
        ) : error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</div>
        ) : messages.length === 0 ? (
          <div className="text-sm text-[var(--anchor-gray)]">
            No messages yet. Ask a question or share a photo about this order.
          </div>
        ) : (
          messages.map((m) => {
            const mine = me != null && m.author_id === me;
            const isAdmin = m.author_role === "admin";
            const who = m.author_name || (isAdmin ? "Anchor" : "Rep");
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] ${mine ? "items-end" : "items-start"} flex flex-col`}>
                  <div
                    className={`rounded-2xl px-3 py-2 text-sm ${
                      mine
                        ? "bg-[var(--anchor-deep)] text-white"
                        : isAdmin
                          ? "bg-[var(--anchor-mint)]/70 text-[var(--anchor-deep)]"
                          : "border border-[var(--border-default)] bg-white text-black"
                    }`}
                  >
                    {m.body && <div className="whitespace-pre-line">{m.body}</div>}
                    <MessageAttachments attachments={m.attachments} />
                  </div>
                  <div className="mt-1 px-1 text-[11px] text-[var(--anchor-gray)]">
                    {who} · {formatStamp(m.created_at)}
                  </div>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      <div className="mt-3 border-t border-[var(--border-default)] pt-3">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void send();
            }
          }}
          rows={2}
          placeholder="Write a message about this order…"
          className="w-full resize-y rounded-lg border border-[var(--border-default)] bg-white px-3 py-2 text-sm outline-none focus:border-[var(--anchor-green)]"
        />
        <div className="mt-2">
          <ImagePicker images={images} onChange={setImages} />
        </div>
        {sendError && <div className="mt-2 text-xs text-red-600">{sendError}</div>}
        <div className="mt-2 flex items-center justify-between">
          <span className="text-[11px] text-[var(--anchor-gray)]">⌘/Ctrl + Enter to send</span>
          <button
            type="button"
            onClick={() => void send()}
            disabled={sending || (!draft.trim() && images.length === 0)}
            className="inline-flex h-9 items-center rounded-lg bg-[var(--anchor-green)] px-4 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {sending ? "Sending…" : "Send"}
          </button>
        </div>
      </div>
    </div>
  );
}
