import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { Resend } from "resend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function mustGetEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

function parseRecipients(v: string) {
  return v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function startOfWeekUTC(d: Date) {
  // Monday 00:00:00 UTC
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = date.getUTCDay(); // 0=Sun,1=Mon...
  const diffToMonday = (day + 6) % 7; // Monday->0, Sunday->6
  date.setUTCDate(date.getUTCDate() - diffToMonday);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

function fmtISO(d: Date) {
  return d.toISOString();
}

export async function GET(req: Request) {
  try {
    // --- protect this endpoint (cron only) ---
    const secret = mustGetEnv("CRON_SECRET");
    const url = new URL(req.url);
    const provided = url.searchParams.get("secret") || "";
    if (provided !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const resend = new Resend(mustGetEnv("RESEND_API_KEY"));
    const to = parseRecipients(mustGetEnv("WEEKLY_REPORT_TO"));

    // Report window: previous full week (Mon->Mon UTC)
    const now = new Date();
    const thisWeekStart = startOfWeekUTC(now);
    const lastWeekStart = new Date(thisWeekStart);
    lastWeekStart.setUTCDate(lastWeekStart.getUTCDate() - 7);

    const start = fmtISO(lastWeekStart);
    const end = fmtISO(thisWeekStart);

    // -----------------------------
    // Messages (your existing table)
    // -----------------------------
    // Assumes: public.messages has columns: user_id, conversation_id, role, content, created_at
    const { data: msgRows, error: msgErr } = await supabaseAdmin
      .from("messages")
      .select("user_id, conversation_id, role, content, created_at")
      .gte("created_at", start)
      .lt("created_at", end);

    if (msgErr) throw msgErr;

    const msgs = msgRows || [];
    const userMsgs = msgs.filter((m) => m.role === "user");
    const assistantMsgs = msgs.filter((m) => m.role === "assistant");

    const uniqueUsers = new Set(msgs.map((m) => m.user_id).filter(Boolean));
    const uniqueConvos = new Set(msgs.map((m) => m.conversation_id).filter(Boolean));

    // Top “questions” (very simple: most recent distinct user messages, capped)
    const topUserTexts = Array.from(
      new Map(
        userMsgs
          .slice()
          .sort((a, b) => (a.created_at > b.created_at ? -1 : 1))
          .map((m) => [String(m.content || "").trim().toLowerCase(), m])
      ).values()
    )
      .map((m) => String(m.content || "").trim())
      .filter(Boolean)
      .slice(0, 10);

    // -----------------------------
    // Doc opens (from doc-event)
    // -----------------------------
    // Assumes: public.doc_events has columns like:
    // user_id, conversation_id, doc_path, doc_title, doc_type, doc_url, created_at
    const { data: docRows, error: docErr } = await supabaseAdmin
      .from("doc_events")
      .select("user_id, conversation_id, doc_path, doc_title, doc_type, created_at")
      .gte("created_at", start)
      .lt("created_at", end);

    // If table doesn’t exist yet, don’t hard-fail the whole report
    const docEvents = docErr ? [] : (docRows || []);

    const docOpens = docEvents.length;
    const uniqueDocs = new Set(docEvents.map((d) => d.doc_path).filter(Boolean));

    // Top opened docs
    const docCounts = new Map<string, { title: string; type: string; count: number }>();
    for (const d of docEvents) {
      const key = d.doc_path || "—";
      const prev = docCounts.get(key) || {
        title: d.doc_title || d.doc_path || "—",
        type: d.doc_type || "doc",
        count: 0,
      };
      prev.count += 1;
      docCounts.set(key, prev);
    }
    const topDocs = Array.from(docCounts.entries())
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10);

    // Format email (keep it readable)
    const subject = `Anchor Sales Co-Pilot — Weekly Usage Report (${start.slice(0, 10)} → ${end.slice(0, 10)})`;

    const lines: string[] = [];
    lines.push(`Weekly Usage Report`);
    lines.push(`Window: ${start} → ${end}`);
    lines.push(``);
    lines.push(`MESSAGES`);
    lines.push(`• Total messages: ${msgs.length}`);
    lines.push(`• User messages: ${userMsgs.length}`);
    lines.push(`• Assistant messages: ${assistantMsgs.length}`);
    lines.push(`• Unique users: ${uniqueUsers.size}`);
    lines.push(`• Active conversations: ${uniqueConvos.size}`);
    lines.push(``);
    lines.push(`DOC OPENS`);
    lines.push(`• Doc opens: ${docOpens}`);
    lines.push(`• Unique docs opened: ${uniqueDocs.size}`);
    lines.push(``);

    if (topDocs.length) {
      lines.push(`TOP OPENED DOCS`);
      for (const [path, meta] of topDocs) {
        lines.push(`• (${meta.count}x) ${meta.title} — ${meta.type} — ${path}`);
      }
      lines.push(``);
    }

    if (topUserTexts.length) {
      lines.push(`RECENT UNIQUE USER QUESTIONS (sample)`);
      for (const t of topUserTexts) lines.push(`• ${t}`);
      lines.push(``);
    }

    if (docErr) {
      lines.push(`NOTE`);
      lines.push(`• doc_events query error: ${String((docErr as any)?.message || docErr)}`);
      lines.push(``);
    }

    const text = lines.join("\n");

    await resend.emails.send({
      from: "Anchor Co-Pilot <reports@anchorp.com>", // can be any verified sender in Resend
      to,
      subject,
      text,
    });

    return NextResponse.json(
      { ok: true, start, end, sentTo: to, totals: { msgs: msgs.length, docOpens } },
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || String(e) }, { status: 500 });
  }
}
