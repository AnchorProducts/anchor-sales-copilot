/// <reference lib="deno.ns" />
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";
import { Resend } from "https://esm.sh/resend@4";

// Notifies the configured recipient(s) when a portal document's `revision` label
// changes, so they can update the QMS master. Fires ONLY on a revision change.
//
// Recipients are managed in the Notifications admin page (/admin/notifications)
// under the "Document revision change" tool — stored in notification_tool_emails
// (raw emails) and notification_tool_assignments (app users). Falls back to the
// REVISION_NOTIFICATION_EMAIL env var only if none are configured there.
//
// Accepts the standard Supabase Database Webhook payload shape:
//   { type: "UPDATE", table: "assets", record, old_record }

type DbClient = ReturnType<typeof createClient>;

const TOOL_KEY = "document_revision";

type AssetRecord = {
  id: string;
  title: string | null;
  revision: string | null;
  last_updated: string | null;
  updated_by: string | null;
};

type RevisionWebhookPayload = {
  type?: string;
  table?: string;
  record: AssetRecord;
  old_record: AssetRecord | null;
};

function text(status: number, body: string): Response {
  return new Response(body, { status });
}

function asString(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null;
}

function asAssetRecord(v: unknown): AssetRecord | null {
  if (typeof v !== "object" || v === null) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.id !== "string") return null;
  return {
    id: o.id,
    title: asString(o.title),
    revision: asString(o.revision),
    last_updated: asString(o.last_updated),
    updated_by: asString(o.updated_by),
  };
}

function parsePayload(v: unknown): RevisionWebhookPayload | null {
  if (typeof v !== "object" || v === null) return null;
  const o = v as Record<string, unknown>;
  const record = asAssetRecord(o.record);
  if (!record) return null;
  return {
    type: asString(o.type) ?? undefined,
    table: asString(o.table) ?? undefined,
    record,
    old_record: asAssetRecord(o.old_record),
  };
}

// Recipients for the "document_revision" tool: raw emails + assigned app users'
// emails, merged and de-duped. Falls back to the env var when nothing is set in
// the admin page, so the notification never silently goes nowhere.
async function resolveRecipients(supabase: DbClient | null, fallbackRaw: string): Promise<string[]> {
  const out = new Set<string>();

  if (supabase) {
    const { data: emailRows } = await supabase
      .from("notification_tool_emails")
      .select("email")
      .eq("tool_key", TOOL_KEY);
    for (const r of (emailRows ?? []) as { email: string | null }[]) {
      const e = asString(r.email);
      if (e) out.add(e.toLowerCase());
    }

    const { data: assignRows } = await supabase
      .from("notification_tool_assignments")
      .select("user_id")
      .eq("tool_key", TOOL_KEY);
    const ids = ((assignRows ?? []) as { user_id: string | null }[])
      .map((a) => a.user_id)
      .filter((v): v is string => typeof v === "string");
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("email").in("id", ids);
      for (const p of (profs ?? []) as { email: string | null }[]) {
        const e = asString(p.email);
        if (e) out.add(e.toLowerCase());
      }
    }
  }

  if (out.size === 0) {
    for (const e of fallbackRaw.split(",").map((s) => s.trim()).filter(Boolean)) {
      out.add(e.toLowerCase());
    }
  }

  return [...out];
}

async function resolveUpdatedBy(supabase: DbClient | null, record: AssetRecord): Promise<string> {
  const fallback = record.updated_by ?? "—";
  if (!supabase || !record.updated_by) return fallback;
  try {
    const { data } = await supabase
      .from("profiles")
      .select("full_name,email")
      .eq("id", record.updated_by)
      .maybeSingle();
    const prof = (data ?? null) as { full_name: string | null; email: string | null } | null;
    if (!prof) return fallback;
    const name = asString(prof.full_name);
    const email = asString(prof.email);
    return [name, email].filter(Boolean).join(" · ") || fallback;
  } catch {
    return fallback;
  }
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

Deno.serve(async (req) => {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY") ?? "";
  const FROM = Deno.env.get("LEAD_NOTIFICATIONS_FROM") ?? "Anchor Co-Pilot <reports@anchorp.com>";
  const FALLBACK_EMAIL = Deno.env.get("REVISION_NOTIFICATION_EMAIL") ?? "";
  const WEBHOOK_SECRET = Deno.env.get("REVISION_WEBHOOK_SECRET") ?? "";

  // If a shared secret is configured, require it (matches training-digest pattern).
  if (WEBHOOK_SECRET) {
    const provided = req.headers.get("x-webhook-secret") ?? "";
    if (provided !== WEBHOOK_SECRET) return text(401, "Bad webhook secret");
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return text(400, "Invalid JSON body");
  }

  const payload = parsePayload(body);
  if (!payload) return text(400, "Missing or malformed asset record");

  const oldRevision = payload.old_record?.revision ?? null;
  const newRevision = payload.record.revision ?? null;

  // Fire ONLY on a controlled revision change.
  if (oldRevision === newRevision) return text(200, "No revision change — skipped");

  const supabase: DbClient | null =
    SUPABASE_URL && SERVICE_ROLE_KEY ? createClient(SUPABASE_URL, SERVICE_ROLE_KEY) : null;

  const to = await resolveRecipients(supabase, FALLBACK_EMAIL);
  if (!to.length) return text(200, "No document_revision recipients configured");
  if (!RESEND_API_KEY) return text(500, "Missing RESEND_API_KEY");

  const updatedBy = await resolveUpdatedBy(supabase, payload.record);
  const documentName = payload.record.title ?? "Untitled document";
  const subject = `Revision update: ${documentName} → ${newRevision ?? "(cleared)"}`;
  const lines = [
    `A controlled document revision changed in the portal.`,
    ``,
    `Document:     ${documentName}`,
    `Revision:     ${oldRevision ?? "(none)"} → ${newRevision ?? "(cleared)"}`,
    `Last updated: ${fmtDate(payload.record.last_updated)}`,
    `Updated by:   ${updatedBy}`,
    ``,
    `Update the QMS master to match.`,
  ];

  const resend = new Resend(RESEND_API_KEY);
  try {
    const result = await resend.emails.send({ from: FROM, to, subject, text: lines.join("\n") });
    const maybeError = (result as { error?: { message?: string } | null }).error;
    if (maybeError) return text(500, `Resend error: ${maybeError.message ?? "unknown"}`);
  } catch (e) {
    return text(500, `Resend error: ${e instanceof Error ? e.message : String(e)}`);
  }

  return text(200, `Revision notification sent to ${to.length} recipient(s)`);
});
