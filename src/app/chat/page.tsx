// src/app/chat/page.tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import Button from "@/app/components/ui/Button";
import { Input } from "@/app/components/ui/Field";
import ChatSidebar from "@/app/components/ChatSidebar";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { trackEvent } from "@/lib/analytics/track";
import { ToolLoader } from "@/app/components/visuals/FeatureGraphic";

// ─── Types ────────────────────────────────────────────────────────────────────
type UserType = "internal" | "external";

type RecommendedDoc = {
  title: string;
  doc_type: string;
  path: string;
  url: string | null;
};

type SourceUsed = {
  chunkId: string;
  documentId: string;
  title: string | null;
  similarity: number;
  content: string;
};

type ChatResponse = {
  conversationId?: string;
  sessionId?: string;
  answer?: string;
  foldersUsed?: string[];
  recommendedDocs?: RecommendedDoc[];
  sourcesUsed?: SourceUsed[];
  error?: string;
};

type Msg = { role: "user" | "assistant"; content: string; docs?: RecommendedDoc[] };

type ProfileRow = {
  role: "admin" | "anchor_rep" | "external_rep";
  user_type: UserType;
  email: string;
};

type ConversationRow = {
  id: string;
  title: string | null;
  updated_at: string | null;
  created_at: string | null;
  deleted_at?: string | null;
};

// ─── Constants ────────────────────────────────────────────────────────────────
const DEFAULT_GREETING: Msg = {
  role: "assistant",
  content:
    "Hey, I'm your Anchor Products sales expert. Tell me what you're securing and I'll point you to the right solution.\n\nFor engineering questions — spacing, loads, or code compliance — I'll connect you with the Anchor Products team directly.",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function renderMessageContent(content: string) {
  const parts = String(content || "").split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  if (parts.length <= 1) {
    return <div className="text-black whitespace-pre-line">{content}</div>;
  }
  return (
    <div className="space-y-2">
      {parts.map((p, i) => (
        <div key={i} className="text-black whitespace-pre-line">{p}</div>
      ))}
    </div>
  );
}

function titleOrNew(title?: string | null) {
  const t = (title || "").trim();
  return t.length ? t : "New chat";
}

async function readJsonSafely<T = any>(res: Response): Promise<T | null> {
  const text = await res.text();
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`Non-JSON response (${res.status}): ${text.slice(0, 200)}`);
  }
}

// ─── Local chat cache ─────────────────────────────────────────────────────────
// The server only persists plain message text (to chat_messages, keyed by
// session_id); the `messages` table the sidebar reads from isn't written to,
// and the inline sheet/doc buttons (`docs`) aren't stored anywhere. So opening a
// sheet — a full-page navigation to /docs/view — and coming back would remount
// the chat with an empty thread and no sheet buttons. We mirror the live thread
// (messages + docs) into localStorage, keyed per user+conversation, so it
// survives that round trip and is restored on mount. We also remember the
// last-active conversation so we land back on it instead of the most recent.
const CHAT_THREAD_PREFIX = "anchor.chat.thread";
const CHAT_LAST_PREFIX = "anchor.chat.last";

function chatThreadKey(uid: string, cid: string) {
  return `${CHAT_THREAD_PREFIX}.${uid}.${cid}`;
}
function readCachedThread(uid: string, cid: string): Msg[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(chatThreadKey(uid, cid));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.length > 0 ? (parsed as Msg[]) : null;
  } catch {
    return null;
  }
}
function writeCachedThread(uid: string, cid: string, msgs: Msg[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(chatThreadKey(uid, cid), JSON.stringify(msgs));
  } catch {
    /* quota / serialization — non-fatal */
  }
}
function clearCachedThread(uid: string, cid: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(chatThreadKey(uid, cid));
  } catch {
    /* non-fatal */
  }
}
function readLastConversation(uid: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(`${CHAT_LAST_PREFIX}.${uid}`);
  } catch {
    return null;
  }
}
function writeLastConversation(uid: string, cid: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`${CHAT_LAST_PREFIX}.${uid}`, cid);
  } catch {
    /* non-fatal */
  }
}

// ─── ChatPage ─────────────────────────────────────────────────────────────────
export default function ChatPage() {
  const router = useRouter();

  const supabase = useMemo(() => supabaseBrowser(), []);

  // ── Profile-driven access ─────────────────────────────────────────────────
  const [role, setRole]           = useState<ProfileRow["role"] | null>(null);
  const [userType, setUserType]   = useState<UserType>("external");
  const [profileLoading, setProfileLoading] = useState(true);

  // ── Auth + conversation ───────────────────────────────────────────────────
  const [userId, setUserId]               = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [sessionId, setSessionId]         = useState<string | null>(null);

  // ── Sidebar ───────────────────────────────────────────────────────────────
  const [conversations, setConversations] = useState<ConversationRow[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // ── UI ────────────────────────────────────────────────────────────────────
  const [historyLoading, setHistoryLoading] = useState(true);

  // ── Sales Copilot chat ────────────────────────────────────────────────────
  const [input, setInput]       = useState("");
  const [messages, setMessages] = useState<Msg[]>([DEFAULT_GREETING]);
  const [loading, setLoading]   = useState(false);

  // ── Internal feedback (per-message, internal users only) ─────────────────
  type FbEntry = { open: boolean; note: string; sent: boolean; rating: "good" | "bad" | null; busy: boolean };
  const [feedback, setFeedback] = useState<Record<number, FbEntry>>({});

  function fbFor(idx: number): FbEntry {
    return feedback[idx] ?? { open: false, note: "", sent: false, rating: null, busy: false };
  }
  function setFb(idx: number, patch: Partial<FbEntry>) {
    setFeedback((prev) => ({ ...prev, [idx]: { ...fbFor(idx), ...patch } }));
  }

  async function submitFeedback(idx: number, messages: Msg[]) {
    const fb = fbFor(idx);
    const msg = messages[idx];
    const userMsg = [...messages].slice(0, idx).reverse().find((m) => m.role === "user");

    // The feedback/corrections routes both require a session id; fall back to the
    // conversation id when the chat API hasn't returned a sessionId yet, so the
    // request validates instead of silently 400-ing.
    const sid = sessionId ?? conversationId;

    setFb(idx, { busy: true });
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: sid,
          conversationId,
          userMessage: userMsg?.content ?? null,
          assistantMessage: msg.content,
          documentId: null,
          chunkId: null,
          rating: fb.rating === "good" ? 5 : 1,
          note: fb.note.trim() || null,
        }),
      });
      // Only confirm "saved" if the write actually succeeded.
      if (!res.ok) {
        setFb(idx, { busy: false });
        return;
      }
      if (fb.rating === "bad" && fb.note.trim()) {
        await fetch("/api/corrections", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: sid,
            conversationId,
            userMessage: userMsg?.content ?? null,
            assistantMessage: msg.content,
            documentId: null,
            chunkId: null,
            note: fb.note.trim(),
            correction: fb.note.trim(),
          }),
        });
      }
      setFb(idx, { sent: true, open: false, busy: false });
    } catch {
      setFb(idx, { busy: false });
    }
  }

  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading, historyLoading]);

  // ── Conversation helpers ──────────────────────────────────────────────────
  const loadConversationMessages = useCallback(
    async (uid: string, cid: string) => {
      setHistoryLoading(true);
      try {
        // Prefer the locally cached thread — it preserves the inline sheet/doc
        // buttons (and survives the /docs/view round trip), which the DB copy
        // doesn't carry.
        const cached = readCachedThread(uid, cid);
        if (cached) {
          setMessages(cached);
          return;
        }

        const { data: rows, error: msgErr } = await supabase
          .from("messages")
          .select("role,content,meta,created_at")
          .eq("conversation_id", cid)
          .eq("user_id", uid)
          .order("created_at", { ascending: true })
          .limit(500);

        if (msgErr) console.error("MESSAGES_LOAD_ERROR:", msgErr);

        if (rows && rows.length > 0) {
          const display: Msg[] = [];
          for (const r of rows as any[]) {
            const role = r.role as "user" | "assistant";
            const content = (r.content ?? "").toString();
            if (role === "assistant" && !content.trim()) continue;
            display.push({ role, content });
          }
          setMessages(display as any);
        } else {
          setMessages([DEFAULT_GREETING] as any);
        }

        
        
      } finally {
        setHistoryLoading(false);
      }
    },
    [supabase]
  );

  const loadConversations = useCallback(
    async (uid: string) => {
      try {
        const { data, error } = await supabase
          .from("conversations")
          .select("id,title,updated_at,created_at,deleted_at")
          .eq("user_id", uid)
          .is("deleted_at", null)
          .order("updated_at", { ascending: false })
          .limit(50);

        if (error) console.error("CONVERSATIONS_LIST_ERROR:", error);
        const list = (data || []) as ConversationRow[];
        setConversations(list);
        return list;
      } finally {}
    },
    [supabase]
  );

  const createConversation = useCallback(
    async (uid: string) => {
      const { data: createdConv, error } = await supabase
        .from("conversations")
        .insert({ user_id: uid, title: "New chat" })
        .select("id,title,updated_at,created_at,deleted_at")
        .single();

      if (error) console.error("CONVERSATION_CREATE_ERROR:", error);
      return (createdConv || null) as ConversationRow | null;
    },
    [supabase]
  );

  const renameConversation = useCallback(
    async (cid: string, title: string) => {
      if (!userId) return;
      const trimmed = title.trim();
      if (!trimmed) return;
      const { error } = await supabase
        .from("conversations")
        .update({ title: trimmed, updated_at: new Date().toISOString() })
        .eq("id", cid)
        .eq("user_id", userId);
      if (error) { console.error("CONVERSATION_RENAME_ERROR:", error); return; }
      await loadConversations(userId);
    },
    [supabase, userId, loadConversations]
  );

  const switchConversation = useCallback(
    async (cid: string) => {
      if (!userId || cid === conversationId) return;
      setConversationId(cid);
      
      setSessionId(null);
      setInput("");
      
      await loadConversationMessages(userId, cid);
    },
    [conversationId, loadConversationMessages, userId]
  );

  const deleteConversation = useCallback(
    async (cid: string) => {
      if (!userId) return;
      const ok = window.confirm("Delete this chat? You can't undo this.");
      if (!ok) return;
      const now = new Date().toISOString();
      const { error } = await supabase
        .from("conversations")
        .update({ deleted_at: now, updated_at: now })
        .eq("id", cid)
        .eq("user_id", userId);
      if (error) { console.error("CONVERSATION_DELETE_ERROR:", error); return; }
      clearCachedThread(userId, cid);
      const list = await loadConversations(userId);
      if (cid === conversationId) {
        const nextId = list?.[0]?.id ?? null;
        
        setSessionId(null);
        setInput("");
        
        if (nextId) {
          setConversationId(nextId);
          await loadConversationMessages(userId, nextId);
        } else {
          const created = await createConversation(userId);
          setConversationId(created?.id ?? null);
          setMessages([DEFAULT_GREETING]);
          await loadConversations(userId);
        }
      }
    },
    [userId, supabase, loadConversations, conversationId, loadConversationMessages, createConversation]
  );

  // ── Boot ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const { data: userData, error: userErr } = await supabase.auth.getUser();
        if (!alive) return;

        if (userErr) console.error("AUTH_GET_USER_ERROR:", userErr);

        const user = userData.user;
        if (!user) { router.replace("/"); return; }

        setUserId(user.id);

        // Profile
        let { data: profile, error: profileErr } = await supabase
          .from("profiles")
          .select("role,user_type,email,full_name,company")
          .eq("id", user.id)
          .maybeSingle<ProfileRow>();

        if (!alive) return;
        if (profileErr) {
          console.warn("PROFILE_READ_ERROR (non-fatal):", profileErr);
          const { data: minProfile } = await supabase
            .from("profiles")
            .select("role,user_type,email")
            .eq("id", user.id)
            .maybeSingle<Pick<ProfileRow, "role" | "user_type" | "email">>();
          if (!alive) return;
          profile = minProfile ? { ...minProfile } : null;
        }

        if (!profile) {
          const email = (user.email || "").trim().toLowerCase();
          const isInternal = email.endsWith("@anchorp.com");
          const user_type: UserType = isInternal ? "internal" : "external";
          const roleToSet: ProfileRow["role"] = isInternal ? "anchor_rep" : "external_rep";

          const { data: created, error: upsertErr } = await supabase
            .from("profiles")
            .upsert(
              { id: user.id, email, user_type, role: roleToSet, updated_at: new Date().toISOString() },
              { onConflict: "id" }
            )
            .select("role,user_type,email")
            .single<ProfileRow>();

          if (upsertErr) console.error("PROFILE_UPSERT_ERROR:", upsertErr);
          profile = created ?? null;
        }

        if (!alive) return;

        setRole(profile?.role ?? null);
        setUserType((profile?.user_type as UserType) ?? "external");

        // Conversations
        const list = await loadConversations(user.id);
        if (!alive) return;

        // Land back on the conversation we were last in (e.g. after opening a
        // sheet), falling back to the most recent one.
        const lastId = readLastConversation(user.id);
        let cid: string | null =
          lastId && list.some((c) => c.id === lastId) ? lastId : (list?.[0]?.id ?? null);
        if (!cid) {
          const created = await createConversation(user.id);
          cid = created?.id ?? null;
          await loadConversations(user.id);
        }

        if (!alive) return;
        setConversationId(cid);

        if (cid) await loadConversationMessages(user.id, cid);
        else setMessages([DEFAULT_GREETING]);
      } finally {
        if (!alive) return;
        setProfileLoading(false);
        setHistoryLoading(false);
      }
    })();

    return () => { alive = false; };
  }, [createConversation, loadConversationMessages, loadConversations, router, supabase]);

  // Mirror the live thread (incl. sheet buttons) into localStorage so it
  // survives full-page navigations like opening a sheet in /docs/view. Skip the
  // bare greeting so we never clobber a real cached thread with an empty one.
  useEffect(() => {
    if (!userId || !conversationId) return;
    if (messages.length <= 1) return;
    writeCachedThread(userId, conversationId, messages);
  }, [messages, userId, conversationId]);

  // Remember the active conversation so a remount lands back on it.
  useEffect(() => {
    if (!userId || !conversationId) return;
    writeLastConversation(userId, conversationId);
  }, [userId, conversationId]);

  async function newChat() {
    if (!userId) return;
    setMessages([DEFAULT_GREETING]);
    
    setSessionId(null);
    setInput("");
    
    const created = await createConversation(userId);
    if (!created?.id) return;
    setConversationId(created.id);
    await loadConversations(userId);
    setMessages([DEFAULT_GREETING]);
  }

  const ready = !profileLoading && !historyLoading && !!userId && !!conversationId;
  const inputDisabled = !ready;
  const { t } = useTranslation();

  const roleLabel = useMemo(() => {
    if (role === "anchor_rep")   return "Anchor Rep";
    if (role === "external_rep") return "External Rep";
    if (role === "admin")        return "Admin";
    return "no role";
  }, [role]);

  // ── Send ──────────────────────────────────────────────────────────────────
  async function send() {
    const text = input.trim();
    if (!text || loading) return;
    if (!userId || !conversationId) return;
    if (profileLoading || historyLoading) return;

    

    const nextMessages: Msg[] = [...messages, { role: "user", content: text }];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);
    

    try {
      const thread = nextMessages.map((m) => ({ role: m.role, content: m.content }));

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: thread, userType, conversationId, sessionId }),
      });

      if (res.status === 401) { router.replace("/"); router.refresh(); return; }

      trackEvent("chat_message_sent", { conversationId });

      const data = await readJsonSafely<ChatResponse>(res);

      if (!res.ok) {
        const msg = (data?.error ?? `HTTP ${res.status}`).toString();
        setMessages((m) => [...m, { role: "assistant", content: `I hit an error.\n\n${msg}` }]);
        return;
      }

      if (data?.sessionId) setSessionId(data.sessionId);

      const docs: RecommendedDoc[] = Array.isArray(data?.recommendedDocs) ? data!.recommendedDocs! : [];
      const answerText = (data?.answer ?? "").toString().trim();
      if (answerText) {
        setMessages((m) => [...m, { role: "assistant", content: answerText, docs: docs.length ? docs : undefined }]);
      } else {
        setMessages((m) => [
          ...m,
          { role: "assistant", content: "I didn't get a response back. Try again — and if it keeps happening, tell me what you're securing + membrane type so I can recommend the right solution." },
        ]);
      }

      // Auto-title
      const current = conversations.find((c) => c.id === conversationId);
      const currentTitle = (current?.title || "").trim();
      if (!currentTitle || currentTitle.toLowerCase() === "new chat") {
        renameConversation(conversationId, text.slice(0, 48).trim() || "New chat");
      }

      if (data?.conversationId && data.conversationId !== conversationId) {
        setConversationId(data.conversationId);
      }

      await loadConversations(userId);
    } catch (e: any) {
      setMessages((m) => [...m, { role: "assistant", content: `Network error: ${e?.message || String(e)}` }]);
    } finally {
      setLoading(false);
    }
  }

  // ── Shared UI tokens ──────────────────────────────────────────────────────
  const PANEL      = "bg-white";
  const PANEL_BODY = "flex-1 min-h-0";
  const SOFT_SCROLL = "overflow-y-auto [scrollbar-width:thin]";
  const MUTED      = "text-[var(--anchor-gray)]";

  return (
    // Chat is edge-to-edge on mobile: no ds-page padding, no floating bottom
    // nav (it's hidden on /chat — see src/app/components/ui/MobileBottomNav.tsx).
    // Desktop (lg+) restores zero padding so the sidebar layout works as before.
    // Note: deliberately NOT using .ds-page — that global class adds
    // top/bottom padding (status bar buffer + room for the floating pill nav)
    // which would push the chat away from the viewport edges. Chat needs full
    // bleed, so we set just the layout primitives directly. On desktop the
    // AppSidebar (16rem fixed) sits to the left; lg:pl-64 keeps room for it.
    <main
      className="flex h-dvh flex-col overflow-hidden bg-white text-black sm:bg-[var(--surface-page)] lg:pl-64"
    >


      {/* ── Body ─────────────────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <div className="mx-auto flex h-full max-w-6xl px-0 py-0 sm:px-4 sm:py-4">
          <div className="flex flex-1 gap-4 min-h-0 w-full">

            {/* ── Sidebar — desktop (always visible) ───────────────────── */}
            <aside data-tutorial="chat-history" className="hidden sm:flex w-[260px] shrink-0 flex-col overflow-hidden rounded-3xl border border-black/10 bg-white shadow-md">
              <ChatSidebar
                conversations={conversations}
                activeId={conversationId}
                loading={historyLoading}
                onNewChat={newChat}
                onSelect={switchConversation}
                onRename={renameConversation}
                onDelete={deleteConversation}
              />
            </aside>

            {/* ── Mobile drawer ─────────────────────────────────────────── */}
            {sidebarOpen && (
              <div className="fixed inset-0 z-40 sm:hidden">
                <div
                  className="absolute inset-0 bg-black/40 backdrop-blur-[2px]"
                  onClick={() => setSidebarOpen(false)}
                />
                <div
                  className="absolute left-0 top-0 bottom-0 w-[76vw] max-w-[300px] flex flex-col overflow-hidden bg-white shadow-xl"
                  style={{ paddingTop: "env(safe-area-inset-top)" }}
                >
                  <ChatSidebar
                    conversations={conversations}
                    activeId={conversationId}
                    loading={historyLoading}
                    onNewChat={() => { newChat(); setSidebarOpen(false); }}
                    onSelect={(id) => { switchConversation(id); setSidebarOpen(false); }}
                    onRename={renameConversation}
                    onDelete={deleteConversation}
                    onClose={() => setSidebarOpen(false)}
                  />
                </div>
              </div>
            )}

            {/* ── Chat panel ───────────────────────────────────────────── */}
            <section
              className={[
                PANEL,
                "relative flex flex-1 min-w-0 flex-col min-h-0 overflow-hidden",
                "rounded-none border-0 shadow-none",
                "sm:rounded-3xl sm:border sm:border-black/10 sm:bg-white sm:shadow-md",
              ].join(" ")}
            >
              {/* ── Mobile-only top menu ───────────────────────────────── */}
              <div
                className="sm:hidden shrink-0 flex items-center justify-between gap-2 px-3 border-b border-black/10 bg-white"
                style={{
                  paddingTop: "calc(env(safe-area-inset-top) + 6px)",
                  paddingBottom: "6px",
                }}
              >
                <button
                  type="button"
                  onClick={() => setSidebarOpen(true)}
                  aria-label="Menu"
                  className="flex h-8 w-8 items-center justify-center rounded-md text-black/70 active:bg-black/[0.05]"
                >
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 6h18M3 12h18M3 18h18" />
                  </svg>
                </button>
                <Link
                  href="/dashboard"
                  aria-label="Return to dashboard"
                  className="flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[12px] font-semibold text-[var(--anchor-deep)] active:bg-[var(--anchor-mint)]"
                >
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M19 12H5" />
                    <path d="M12 19l-7-7 7-7" />
                  </svg>
                  <span>Return to Dashboard</span>
                </Link>
              </div>

              {/* ── Messages ─────────────────────────────────────────────── */}
              <div className={`${PANEL_BODY} ${SOFT_SCROLL} overscroll-contain px-3 py-3 sm:px-5 sm:py-4 bg-transparent`}>
                <div className="space-y-2.5 sm:space-y-3">
                  {historyLoading && messages.length === 0 && (
                    <ToolLoader feature="chat" label={t("loadingYourChat")} />
                  )}
                  {messages.map((m, idx) => {
                    const isInternal = role === "admin" || role === "anchor_rep";
                    const showFeedbackWidget = isInternal && m.role === "assistant" && m.content !== DEFAULT_GREETING.content;
                    const fb = fbFor(idx);

                    return (
                      <div key={idx} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                        {/* User bubbles: narrow + right-aligned. Assistant: wider, left-aligned. */}
                        <div className={m.role === "user" ? "max-w-[78%] sm:max-w-[72%]" : "max-w-[92%] sm:max-w-[88%] w-full"}>
                          <div
                            className={[
                              "whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-[13.5px] leading-relaxed sm:px-4 sm:py-3 sm:text-sm",
                              m.role === "user"
                                ? "border border-[var(--anchor-deep)]/20 bg-[var(--anchor-mint)] shadow-sm"
                                : "border border-black/10 bg-[var(--surface-soft)] shadow-sm",
                            ].join(" ")}
                          >
                            {renderMessageContent(m.content)}

                            {m.role === "assistant" && m.docs && m.docs.length > 0 && (
                              <div className="mt-3 border-t border-black/8 pt-3">
                                <div className="ds-caption mb-2">
                                  {t("relatedDocuments")}
                                </div>
                                <div className="flex flex-col gap-1.5">
                                  {m.docs.map((doc) => {
                                    const viewerHref = `/docs/view?path=${encodeURIComponent(doc.path)}&from=${encodeURIComponent("/chat")}&title=${encodeURIComponent(doc.title)}`;
                                    return (
                                      <a
                                        key={doc.path}
                                        href={viewerHref}
                                        className="flex items-center justify-between gap-2 rounded-xl border border-black/10 bg-white px-3 py-2.5 text-xs transition active:bg-[var(--surface-soft)] hover:bg-[var(--surface-soft)]"
                                      >
                                        <div className="min-w-0">
                                          <div className="truncate font-semibold text-black">{doc.title}</div>
                                          <div className="text-[11px] text-[var(--anchor-gray)]">{doc.doc_type}</div>
                                        </div>
                                        <span className="shrink-0 text-[var(--anchor-green)] font-medium">{t("open")}</span>
                                      </a>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Internal-only feedback widget */}
                          {showFeedbackWidget && (
                            <div className="mt-1.5 px-1">
                              {fb.sent ? (
                                <span className="text-[11px] text-[var(--anchor-gray)]">{t("feedbackSaved")}</span>
                              ) : fb.open ? (
                                <div className="mt-1 flex flex-col gap-2">
                                  <textarea
                                    rows={2}
                                    placeholder={t("whatWasWrong")}
                                    value={fb.note}
                                    onChange={(e) => setFb(idx, { note: e.target.value })}
                                    className="ds-textarea text-xs"
                                  />
                                  <div className="flex gap-2">
                                    <button
                                      type="button"
                                      disabled={fb.busy}
                                      onClick={() => submitFeedback(idx, messages)}
                                      className="ds-btn ds-btn-destructive px-3 py-1.5 text-xs disabled:opacity-50"
                                    >
                                      {fb.busy ? t("saving") : t("submit")}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setFb(idx, { open: false, note: "" })}
                                      className="ds-btn ds-btn-secondary px-3 py-1.5 text-xs"
                                    >
                                      {t("cancel")}
                                    </button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    onClick={() => { setFb(idx, { rating: "good" }); submitFeedback(idx, messages); }}
                                    className="text-[11px] text-[var(--anchor-gray)] hover:text-[var(--anchor-green)] transition"
                                    title={t("accurate")}
                                  >
                                    {t("accurate")}
                                  </button>
                                  <span className="text-[11px] text-black/20">·</span>
                                  <button
                                    type="button"
                                    onClick={() => setFb(idx, { rating: "bad", open: true })}
                                    className="text-[11px] text-[var(--anchor-gray)] hover:text-red-600 transition"
                                    title={t("needsCorrection")}
                                  >
                                    {t("needsCorrection")}
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {(historyLoading || loading) && (
                    <div className="max-w-[88%] rounded-2xl border border-black/10 bg-white px-3.5 py-2.5 text-[13.5px] text-black/70 sm:px-4 sm:py-3 sm:text-sm">
                      {historyLoading ? t("loadingChat") : t("thinking")}
                    </div>
                  )}

                  <div ref={scrollRef} />
                </div>
              </div>

              {/* ── Composer ─────────────────────────────────────────────── */}
              {/* Extra mobile bottom padding makes the green strip taller
                  while keeping the input + send button anchored at the top
                  of it. Desktop retains the safe-area inset. */}
              <div className="shrink-0 border-t border-black/10 bg-[var(--surface-strong)] pb-10 sm:[padding-bottom:max(env(safe-area-inset-bottom),0px)]">
                <div data-tutorial="chat-composer" className="flex items-center gap-2 px-3 py-2.5 sm:px-4 sm:py-3">
                  <Input
                    className="min-w-0 flex-1 px-3 py-2.5 text-[15px] sm:py-3 sm:text-sm disabled:opacity-60"
                    placeholder={inputDisabled ? t("loadingYourChat") : t("messageAnchorCoPilot")}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    disabled={inputDisabled}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        send();
                      }
                    }}
                  />
                  <Button
                    onClick={send}
                    disabled={loading || inputDisabled}
                    className="shrink-0 h-10 w-10 p-0 text-lg disabled:opacity-50 sm:h-auto sm:w-auto sm:px-5 sm:py-3 sm:text-sm"
                    type="button"
                    variant="primary"
                    aria-label="Send"
                  >
                    <span className="sm:hidden">↑</span>
                    <span className="hidden sm:inline">{t("send")}</span>
                  </Button>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>

    </main>
  );
}
