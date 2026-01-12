/// <reference lib="deno.ns" />
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { Resend } from "https://esm.sh/resend@4";

type TrainingEvent = {
  id: string;
  kind: string | null;
  ref_id: string | null;
  actor_user_id: string | null;
  rating: number | null;
  status: string | null;
  conversation_id: string | null;
  session_id: string | null;
  document_id: string | null;
  chunk_id: string | null;
  note: string | null;
  correction: string | null;
  created_at: string;
  digested_at: string | null;
};

function getAdminList(): string[] {
  const raw = Deno.env.get("ADMIN_ALERT_EMAILS") ?? "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function fmt(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function unauthorized(msg = "Unauthorized") {
  return new Response(msg, { status: 401 });
}

function ok(msg: string) {
  return new Response(msg, { status: 200 });
}

function serverError(msg: string) {
  return new Response(msg, { status: 500 });
}

Deno.serve(async (req) => {
  // ---- env ----
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
  const SITE_URL = Deno.env.get("SITE_URL") ?? "";
  const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";

  if (!SUPABASE_URL) return serverError("Missing SUPABASE_URL");
  if (!SERVICE_ROLE_KEY) return serverError("Missing SUPABASE_SERVICE_ROLE_KEY");

  // ---- auth for cron/manual trigger ----
  // If CRON_SECRET is set, require it for ALL requests (safe default)
  if (CRON_SECRET) {
    const provided = req.headers.get("x-cron-secret") ?? "";
    if (provided !== CRON_SECRET) return unauthorized("Bad cron secret");
  }

  // ---- recipients ----
  const to = getAdminList();
  if (!to.length) return ok("No ADMIN_ALERT_EMAILS configured");

  // ---- clients ----
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const now = new Date().toISOString();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  // ---- fetch undigested events ----
  const { data, error } = await supabase
    .from("training_events")
    .select(
      "id,kind,ref_id,actor_user_id,rating,status,conversation_id,session_id,document_id,chunk_id,note,correction,created_at,digested_at"
    )
    .is("digested_at", null)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(500);

  if (error) return serverError(`DB error: ${error.message}`);

  const events = (data || []) as TrainingEvent[];
  if (!events.length) return ok("No new training events");

  const corrections = events.filter((e) => e.kind === "correction");
  const badFeedback = events.filter((e) => e.kind === "feedback" && (e.rating ?? 0) <= 2);

  const subject = `Anchor Co-Pilot digest: ${corrections.length} corrections, ${badFeedback.length} low ratings`;

  // ---- build email body ----
  const lines: string[] = [];
  lines.push(`Daily training digest (${fmt(now)})`);
  lines.push("");
  lines.push(`New corrections: ${corrections.length}`);
  lines.push(`Low ratings (<=2): ${badFeedback.length}`);
  lines.push(`Total events: ${events.length}`);
  lines.push("");

  const dash = SITE_URL ? `${SITE_URL}/admin/knowledge` : "/admin/knowledge";
  lines.push(`Open dashboard: ${dash}`);
  lines.push("");

  if (corrections.length) {
    lines.push(`--- Corrections (latest) ---`);
    for (const c of corrections.slice(0, 10)) {
      lines.push(
        `• ${fmt(c.created_at)} | status=${c.status ?? "—"} | doc=${c.document_id ?? "—"} | chunk=${c.chunk_id ?? "—"}`
      );
      if (c.note) lines.push(`  note: ${c.note}`);
      if (c.correction) lines.push(`  correction: ${String(c.correction).slice(0, 240)}`);
    }
    lines.push("");
  }

  if (badFeedback.length) {
    lines.push(`--- Low ratings (latest) ---`);
    for (const f of badFeedback.slice(0, 10)) {
      lines.push(
        `• ${fmt(f.created_at)} | rating=${f.rating ?? "—"} | doc=${f.document_id ?? "—"} | chunk=${f.chunk_id ?? "—"}`
      );
      if (f.note) lines.push(`  note: ${f.note}`);
    }
    lines.push("");
  }

  const bodyText = lines.join("\n");

  // ---- send email ----
  if (!RESEND_API_KEY) return serverError("Missing RESEND_API_KEY");

  const resend = new Resend(RESEND_API_KEY);
  try {
    await resend.emails.send({
      from: "Anchor Co-Pilot <onboarding@resend.dev>", // must be verified in Resend
      to,
      subject,
      text: bodyText,
    });
  } catch (e: any) {
    return serverError(`Resend error: ${e?.message || String(e)}`);
  }

  // ---- mark digested ----
  const ids = events.map((e) => e.id);
  const { error: upErr } = await supabase
    .from("training_events")
    .update({ digested_at: now })
    .in("id", ids);

  if (upErr) return serverError(`Digest sent, but failed to mark digested: ${upErr.message}`);

  return ok(`Digest sent. Marked ${ids.length} events.`);
});
