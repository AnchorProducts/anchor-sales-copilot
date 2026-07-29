import "server-only";
import { Resend } from "resend";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { MARKETING_TEAM } from "@/lib/portalRoles";
import { interpolate, renderEmailHtml, renderEmailText } from "@/lib/email/renderEmail";
import { templateDef } from "@/lib/email/pitchTemplates";

/* ============================================================================
 * Pitch to Marketing — transactional email (§5.5).
 *
 * The COPY is not written here. Each send loads its template from the shared
 * `mkt_email_template` table, which marketing edits in the Marketing Hub, and
 * falls back to the defaults in pitchTemplates.ts when no row exists yet. This
 * module only decides who gets an email and supplies the variables.
 *
 * Every send is best-effort: with no RESEND_API_KEY the helpers are no-ops,
 * like the app's other notifications, so a missing key or a template read
 * failure can never break a pitch submission or a review decision.
 * ==========================================================================*/

function clean(v: unknown) {
  return String(v ?? "").trim();
}

function appUrl(): string {
  return clean(process.env.NEXT_PUBLIC_APP_URL).replace(/\/+$/, "") || "https://anchor-internal.vercel.app";
}

const MY_PITCHES_URL = () => `${appUrl()}/dashboard/pitch`;
const SUBMISSIONS_URL = () => `${appUrl()}/marketing/submissions`;

type SavedTemplate = {
  subject: string;
  heading: string;
  body: string;
  button_label: string;
};

/** Marketing's saved copy for a template, or null to use the built-in default. */
async function loadTemplate(key: string): Promise<SavedTemplate | null> {
  try {
    const { data, error } = await supabaseAdmin
      .from("mkt_email_template")
      .select("subject, heading, body, button_label")
      .eq("key", key)
      .maybeSingle();
    if (error) return null; // table not migrated yet, or read failed — use defaults
    return (data as SavedTemplate | null) ?? null;
  } catch {
    return null;
  }
}

/** Render a template with its variables and send it. */
async function sendTemplated(params: {
  key: string;
  to: string[];
  buttonUrl: string;
  vars: Record<string, string>;
}) {
  const apiKey = clean(process.env.RESEND_API_KEY);
  const recipients = params.to.map(clean).filter(Boolean);
  if (!apiKey || recipients.length === 0) return;

  const def = templateDef(params.key);
  if (!def) return;

  const saved = await loadTemplate(params.key);
  const source = {
    subject: clean(saved?.subject) || def.defaults.subject,
    heading: clean(saved?.heading) || def.defaults.heading,
    body: clean(saved?.body) || def.defaults.body,
    buttonLabel: clean(saved?.button_label) || def.defaults.buttonLabel,
  };

  const content = {
    subject: interpolate(source.subject, params.vars),
    heading: interpolate(source.heading, params.vars),
    body: interpolate(source.body, params.vars),
    buttonLabel: interpolate(source.buttonLabel, params.vars),
    buttonUrl: params.buttonUrl,
  };

  const from = clean(process.env.LEAD_NOTIFICATIONS_FROM) || "Anchor Co-Pilot <reports@anchorp.com>";
  try {
    await new Resend(apiKey).emails.send({
      from,
      to: recipients,
      subject: content.subject,
      html: renderEmailHtml(content),
      text: renderEmailText(content),
    });
  } catch {
    // Best-effort: a notification must never break the action that triggered it.
  }
}

/** Email addresses of everyone who reviews pitches: portal admins and the
 *  marketing team, straight off the shared authorized-users list. */
export async function marketingRecipients(): Promise<string[]> {
  const { data } = await supabaseAdmin.from("portal_invites").select("email, role, team");
  const rows = (data ?? []) as Array<{ email: string; role: string | null; team: string | null }>;
  return rows
    .filter((r) => r.role?.toLowerCase() === "admin" || r.team?.toLowerCase() === MARKETING_TEAM)
    .map((r) => r.email)
    .filter(Boolean);
}

/** The submitter's email, looked up from their profile. */
export async function submitterEmail(userId: string | null): Promise<string | null> {
  if (!userId) return null;
  const { data } = await supabaseAdmin.from("profiles").select("email").eq("id", userId).maybeSingle();
  return clean((data as { email?: string } | null)?.email) || null;
}

export async function notifyNewPitch(params: {
  title: string;
  category: string | null;
  submitterName: string | null;
}) {
  const link = SUBMISSIONS_URL();
  await sendTemplated({
    key: "pitch_new",
    to: await marketingRecipients(),
    buttonUrl: link,
    vars: {
      title: params.title,
      category: params.category || "—",
      submitter: params.submitterName || "An internal user",
      link,
    },
  });
}

export async function notifyInfoResponse(params: {
  title: string;
  responderName: string | null;
  body: string;
}) {
  const link = SUBMISSIONS_URL();
  await sendTemplated({
    key: "pitch_info_response",
    to: await marketingRecipients(),
    buttonUrl: link,
    vars: {
      title: params.title,
      responder: params.responderName || "The submitter",
      message: params.body,
      link,
    },
  });
}

export async function notifyApproved(params: { to: string | null; title: string; timeline: string }) {
  if (!params.to) return;
  const link = MY_PITCHES_URL();
  await sendTemplated({
    key: "pitch_approved",
    to: [params.to],
    buttonUrl: link,
    vars: { title: params.title, timeline: params.timeline || "—", link },
  });
}

export async function notifyDeclined(params: { to: string | null; title: string; reason: string }) {
  if (!params.to) return;
  const link = MY_PITCHES_URL();
  await sendTemplated({
    key: "pitch_declined",
    to: [params.to],
    buttonUrl: link,
    vars: { title: params.title, reason: params.reason || "—", link },
  });
}

export async function notifyInfoRequest(params: { to: string | null; title: string; question: string }) {
  if (!params.to) return;
  const link = MY_PITCHES_URL();
  await sendTemplated({
    key: "pitch_info_request",
    to: [params.to],
    buttonUrl: link,
    vars: { title: params.title, question: params.question, link },
  });
}
