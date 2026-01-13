// src/app/dashboard/page.tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

export const dynamic = "force-dynamic";

type ConversationRow = {
  id: string;
  title: string | null;
  updated_at: string | null;
  created_at: string | null;
};

type DocEventRow = {
  id?: string;
  doc_title: string | null;
  doc_type: string | null;
  doc_path: string;
  doc_url: string | null;
  created_at: string;
  conversation_id?: string | null;
};

function formatWhen(iso?: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function titleOrNew(title?: string | null) {
  const t = (title || "").trim();
  return t.length ? t : "New chat";
}

export default function DashboardPage() {
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);

  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [recentChats, setRecentChats] = useState<ConversationRow[]>([]);
  const [recentDocs, setRecentDocs] = useState<DocEventRow[]>([]);
  const [activityError, setActivityError] = useState<string | null>(null);

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/");
    router.refresh();
  }

  useEffect(() => {
    let alive = true;

    (async () => {
      setLoading(true);
      setActivityError(null);

      try {
        // ✅ ensure we have a session in-browser before querying RLS tables
        const { data: userData } = await supabase.auth.getUser();
        const user = userData.user;

        if (!alive) return;

        if (!user) {
          router.replace("/");
          return;
        }

        setUserId(user.id);

        // Recent chats
        const { data: convos, error: convoErr } = await supabase
          .from("conversations")
          .select("id,title,updated_at,created_at")
          .eq("user_id", user.id)
          .is("deleted_at", null)
          .order("updated_at", { ascending: false })
          .limit(5);

        if (convoErr) console.error("DASH_CONVERSATIONS_ERROR:", convoErr);
        if (!alive) return;
        setRecentChats((convos || []) as ConversationRow[]);

        // Recent docs (from doc_events if you have it)
        // If you don’t have this table yet, we fail silently and show empty state.
        const { data: docs, error: docsErr } = await supabase
          .from("doc_events")
          .select("doc_title,doc_type,doc_path,doc_url,created_at,conversation_id")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(5);

        if (docsErr) {
          // don’t crash the dashboard if the table/route isn’t ready yet
          console.warn("DASH_DOC_EVENTS_WARN:", docsErr.message);
          if (!alive) return;
          setRecentDocs([]);
        } else {
          if (!alive) return;
          setRecentDocs((docs || []) as DocEventRow[]);
        }
      } catch (e: any) {
        console.error("DASH_ACTIVITY_FATAL:", e);
        if (!alive) return;
        setActivityError(e?.message || "Could not load recent activity.");
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, [router, supabase]);

  return (
    <main className="min-h-dvh bg-[#FFFFFF] text-[#000000]">
      {/* Top band */}
      <div className="border-b border-black/10 bg-gradient-to-r from-[#11500F] via-[#047835] to-[#047835]">
        <div className="mx-auto max-w-6xl px-5 py-8">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-xl bg-white/10 ring-1 ring-white/15 flex items-center justify-center">
                <img src="/anchorp.svg" alt="Anchor" className="h-10 w-auto" />
              </div>

              <div className="leading-tight">
                <div className="text-sm font-semibold tracking-wide text-white">
                  Anchor Sales Co-Pilot
                </div>
                <div className="text-[12px] text-white/80">Dashboard</div>
              </div>
            </div>

            <button
              type="button"
              onClick={signOut}
              className="h-9 min-w-[96px] inline-flex items-center justify-center rounded-md border border-white/20 bg-white/10 px-3 text-[12px] font-semibold text-white hover:bg-white/15 transition"
              title="Sign out"
            >
              Sign out
            </button>
          </div>

          <div className="mt-6 flex flex-col gap-2">
            <h1 className="text-3xl font-semibold tracking-tight text-white">
              Welcome back
            </h1>
            <p className="max-w-2xl text-sm text-white/80">
              Jump into Copilot or manage product tackle boxes. Everything stays organized,
              modern, and fast.
            </p>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="mx-auto max-w-6xl px-5 py-8">
        {/* Quick actions row */}
        <div className="mb-6 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center rounded-full bg-[#9CE2BB] px-3 py-1 text-[12px] font-semibold text-[#11500F]">
            Internal tools
          </span>
        </div>

        {/* Main tiles */}
        <div className="grid gap-5 md:grid-cols-2">
          {/* Chat */}
          <Link
            href="/chat"
            className="group rounded-3xl border border-black/10 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold">Chat Copilot</div>
                <div className="mt-1 text-sm text-[#76777B]">
                  Ask questions, pull docs, and get install guidance instantly.
                </div>
              </div>

              <span className="inline-flex items-center rounded-full bg-black/5 px-3 py-1 text-[12px] font-semibold text-black/70">
                AI
              </span>
            </div>

            <div className="mt-5 flex items-center justify-between">
              <div className="text-sm font-semibold text-[#047835]">
                Open Copilot{" "}
                <span className="transition group-hover:translate-x-1 inline-block">→</span>
              </div>

              <div className="h-10 w-10 rounded-2xl bg-[#9CE2BB] ring-1 ring-black/10 flex items-center justify-center">
                <span className="text-[#11500F] font-black">C</span>
              </div>
            </div>
          </Link>

          {/* Assets */}
          <Link
            href="/assets"
            className="group rounded-3xl border border-black/10 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold">Asset Management</div>
                <div className="mt-1 text-sm text-[#76777B]">
                  Product tackle boxes: manuals, CAD, images, sales sheets, and more.
                </div>
              </div>

              <span className="inline-flex items-center rounded-full bg-[#9CE2BB] px-3 py-1 text-[12px] font-semibold text-[#11500F]">
                Library
              </span>
            </div>

            <div className="mt-5 flex items-center justify-between">
              <div className="text-sm font-semibold text-[#047835]">
                View Assets{" "}
                <span className="transition group-hover:translate-x-1 inline-block">→</span>
              </div>

              <div className="h-10 w-10 rounded-2xl bg-black/5 ring-1 ring-black/10 flex items-center justify-center">
                <span className="text-black/70 font-black">A</span>
              </div>
            </div>
          </Link>
        </div>

        {/* Secondary section */}
        <div className="mt-6 grid gap-5 md:grid-cols-3">
          {/* Recent activity (NOW REAL) */}
          <div className="rounded-3xl border border-black/10 bg-white p-5">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">Recent activity</div>
              {loading ? (
                <div className="text-[11px] text-[#76777B]">Loading…</div>
              ) : (
                <div className="text-[11px] text-[#76777B]">Last 5</div>
              )}
            </div>

            {activityError ? (
              <div className="mt-3 rounded-xl border border-black/10 bg-black/[0.02] p-3 text-sm text-[#76777B]">
                {activityError}
              </div>
            ) : (
              <div className="mt-3 space-y-3">
                {/* Recent chats */}
                <div>
                  <div className="text-[11px] font-semibold text-black/70">Chats</div>
                  {recentChats.length === 0 ? (
                    <div className="mt-2 text-sm text-[#76777B]">No chats yet.</div>
                  ) : (
                    <div className="mt-2 space-y-1">
                      {recentChats.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => router.push(`/chat?cid=${encodeURIComponent(c.id)}`)}
                          className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-left hover:bg-black/[0.03] transition"
                        >
                          <div className="truncate text-sm font-semibold">
                            {titleOrNew(c.title)}
                          </div>
                          <div className="text-[11px] text-[#76777B]">
                            {formatWhen(c.updated_at || c.created_at)}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Recent docs */}
                <div>
                  <div className="text-[11px] font-semibold text-black/70">Docs opened</div>
                  {recentDocs.length === 0 ? (
                    <div className="mt-2 text-sm text-[#76777B]">
                      No doc opens recorded yet.
                    </div>
                  ) : (
                    <div className="mt-2 space-y-1">
                      {recentDocs.map((d) => (
                        <button
                          key={`${d.doc_path}-${d.created_at}`}
                          type="button"
                          onClick={() => d.doc_url && window.open(d.doc_url, "_blank", "noopener,noreferrer")}
                          className="w-full rounded-xl border border-black/10 bg-white px-3 py-2 text-left hover:bg-black/[0.03] transition"
                        >
                          <div className="truncate text-sm font-semibold">
                            {d.doc_title || d.doc_path}
                          </div>
                          <div className="text-[11px] text-[#76777B] truncate">
                            {d.doc_type || "doc"} • {formatWhen(d.created_at)}
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-black/10 bg-white p-5">
            <div className="text-sm font-semibold">Quick links</div>
            <div className="mt-3 flex flex-col gap-2 text-sm">
              <Link className="text-[#047835] hover:underline" href="/chat">
                Go to Copilot
              </Link>
              <Link className="text-[#047835] hover:underline" href="/assets">
                Open Asset Library
              </Link>
            </div>
          </div>

          <div className="rounded-3xl border border-black/10 bg-white p-5">
            <div className="text-sm font-semibold">System status</div>
            <div className="mt-2 flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-full bg-[#047835]" />
              <span className="text-sm text-[#76777B]">Online</span>
            </div>
            <div className="mt-2 text-[11px] text-[#76777B]">
              User: <span className="text-black/70">{userId ? "Signed in" : "…"}</span>
            </div>
          </div>
        </div>

        <div className="mt-8 text-[12px] text-[#76777B]">
          Tip: You can show “last doc opened” here using the doc_events table from /api/doc-event.
        </div>
      </div>
    </main>
  );
}
