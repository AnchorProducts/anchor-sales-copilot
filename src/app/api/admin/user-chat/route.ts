import { NextRequest, NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One user's chat history — what they asked the assistant and what it answered
// back — for the People panel of the analytics dashboard.
//
// Deliberately NOT windowed like the event log is. "What has this rep been
// asking?" is a question about the whole relationship, and the useful answer is
// usually the conversation from two months ago, not the one from Tuesday. Dates
// are on every thread, so a narrower reading is still possible by eye.
//
// Soft-deleted threads ARE included, and marked. Deleting a chat here means
// "take it off my sidebar", not "erase it" — the rows are kept on purpose. And
// people tidy up: one rep has 118 threads of which 2 are undeleted, so
// filtering them out told an admin "hasn't used the chat" about someone with
// 253 messages. A false answer is worse than an uncomfortable one; the badge
// says which threads the person had cleared.
const MAX_CONVERSATIONS = 50;
const MAX_MESSAGES = 1000;
// A long assistant answer can run to thousands of words. The transcript is for
// reading what was asked and roughly what came back, not for archiving, so
// oversized bodies are cut with a marker rather than shipped in full.
const MAX_CONTENT = 4000;

type ConversationRow = {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
};
type MessageRow = { conversation_id: string; role: string; content: string | null; created_at: string };

async function requireAdmin() {
  const supabase = await supabaseRoute();
  const { data: auth, error } = await supabase.auth.getUser();
  if (error || !auth?.user) return { error: "Unauthorized", status: 401 as const };
  const { data: prof } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", auth.user.id)
    .maybeSingle();
  if (String((prof as { role?: string } | null)?.role || "") !== "admin") {
    return { error: "Forbidden", status: 403 as const };
  }
  return { user: auth.user };
}

function clip(v: string | null): { text: string; clipped: boolean } {
  const s = (v ?? "").toString();
  if (s.length <= MAX_CONTENT) return { text: s, clipped: false };
  return { text: s.slice(0, MAX_CONTENT), clipped: true };
}

export async function GET(req: NextRequest) {
  const gate = await requireAdmin();
  if ("error" in gate) return NextResponse.json({ error: gate.error }, { status: gate.status });

  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) return NextResponse.json({ error: "userId is required" }, { status: 400 });

  // Driven from the messages, not from the conversation list. Someone with 118
  // threads of which 34 hold messages would otherwise get "the newest 50
  // threads" — mostly empty shells — and their actual transcripts would fall off
  // the end. Newest messages first so the cap keeps the recent ones; each thread
  // is put back in order below.
  const { data: msgData, error: msgErr } = await supabaseAdmin
    .from("messages")
    .select("conversation_id,role,content,created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(MAX_MESSAGES + 1);
  if (msgErr) return NextResponse.json({ error: msgErr.message }, { status: 500 });

  const raw = (msgData ?? []) as MessageRow[];
  const truncated = raw.length > MAX_MESSAGES;
  const rows = raw.slice(0, MAX_MESSAGES);
  if (rows.length === 0) {
    return NextResponse.json({ conversations: [], truncated: false, moreConversations: false });
  }

  const byConversation = new Map<string, Array<{ role: string; content: string; clipped: boolean; at: string }>>();
  for (const m of rows) {
    // An empty assistant turn is a streaming artefact, not something it said.
    if (m.role === "assistant" && !(m.content ?? "").trim()) continue;
    const { text, clipped } = clip(m.content);
    const list = byConversation.get(m.conversation_id) ?? [];
    list.push({ role: m.role === "assistant" ? "assistant" : "user", content: text, clipped, at: m.created_at });
    byConversation.set(m.conversation_id, list);
  }
  // Read back down the page the way it happened.
  for (const list of byConversation.values()) list.sort((a, b) => a.at.localeCompare(b.at));

  const ids = [...byConversation.keys()];
  const moreConversations = ids.length > MAX_CONVERSATIONS;
  const keep = ids.slice(0, MAX_CONVERSATIONS);

  const { data: convData, error: convErr } = await supabaseAdmin
    .from("conversations")
    .select("id,title,created_at,updated_at,deleted_at")
    .eq("user_id", userId)
    .in("id", keep);
  if (convErr) return NextResponse.json({ error: convErr.message }, { status: 500 });

  const meta = new Map((convData ?? []).map((c) => [c.id, c as ConversationRow]));
  const conversations = keep
    .map((id) => {
      const c = meta.get(id);
      const messages = byConversation.get(id) ?? [];
      const last = messages[messages.length - 1]?.at ?? "";
      return {
        id,
        // A thread whose conversation row is gone still has its messages, and
        // they're still what this person asked.
        title: (c?.title || "").trim() || "Untitled chat",
        created_at: c?.created_at ?? messages[0]?.at ?? last,
        updated_at: c?.updated_at ?? last,
        deleted: !!c?.deleted_at,
        messages,
      };
    })
    .filter((c) => c.messages.length > 0)
    .sort((a, b) => (b.messages[b.messages.length - 1]?.at || "").localeCompare(a.messages[a.messages.length - 1]?.at || ""));

  return NextResponse.json({ conversations, truncated, moreConversations });
}
