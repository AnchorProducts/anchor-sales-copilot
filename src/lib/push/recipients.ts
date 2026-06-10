// Unifies notification routing: a user assigned to a tool (in
// notification_tool_assignments) gets BOTH push and email. These helpers resolve
// the assigned users' email addresses and merge them with the per-form
// email-address lists so an event notifies everyone, deduplicated.
import { Resend } from "resend";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

// Email addresses of the app users assigned to a tool. Best-effort; [] on error.
export async function getToolUserEmails(toolKey: string): Promise<string[]> {
  try {
    const { data: assigns } = await supabaseAdmin
      .from("notification_tool_assignments")
      .select("user_id")
      .eq("tool_key", toolKey);
    const ids = (assigns || []).map((a: { user_id: string }) => a.user_id);
    if (ids.length === 0) return [];

    const { data: profs } = await supabaseAdmin.from("profiles").select("email").in("id", ids);
    const out: string[] = [];
    for (const p of (profs || []) as { email: string | null }[]) {
      const e = (p.email || "").trim().toLowerCase();
      if (e && !out.includes(e)) out.push(e);
    }
    return out;
  } catch {
    return [];
  }
}

// Raw email addresses configured for a tool (email-only recipients). [] on error.
export async function getToolEmails(toolKey: string): Promise<string[]> {
  try {
    const { data } = await supabaseAdmin
      .from("notification_tool_emails")
      .select("email")
      .eq("tool_key", toolKey);
    const out: string[] = [];
    for (const r of (data || []) as { email: string | null }[]) {
      const e = (r.email || "").trim().toLowerCase();
      if (e && !out.includes(e)) out.push(e);
    }
    return out;
  } catch {
    return [];
  }
}

// The full email recipient list for a tool: assigned users' emails + raw tool
// emails, de-duplicated. This is the single source of truth for who gets the
// email side of a tool's notification.
export async function getToolRecipientEmails(toolKey: string): Promise<string[]> {
  const [users, emails] = await Promise.all([getToolUserEmails(toolKey), getToolEmails(toolKey)]);
  return mergeEmails(users, emails);
}

// Merge + dedupe email lists (case-insensitive), dropping blanks.
export function mergeEmails(...lists: (string[] | string | null | undefined)[]): string[] {
  const out: string[] = [];
  for (const list of lists) {
    const arr = Array.isArray(list) ? list : list ? [list] : [];
    for (const raw of arr) {
      const e = String(raw || "").trim().toLowerCase();
      if (e && !out.includes(e)) out.push(e);
    }
  }
  return out;
}

// Email a tool's assigned users directly. For tools that don't already have a
// per-form email flow (so they still get the email half of the unification).
// Best-effort; no-op if Resend/recipients are missing.
export async function emailToolUsers(
  toolKey: string,
  opts: { subject: string; text: string }
): Promise<void> {
  try {
    const key = (process.env.RESEND_API_KEY || "").trim();
    if (!key) return;
    const to = await getToolRecipientEmails(toolKey);
    if (to.length === 0) return;
    const from =
      (process.env.LEAD_NOTIFICATIONS_FROM || "").trim() || "Anchor Co-Pilot <reports@anchorp.com>";
    const resend = new Resend(key);
    await resend.emails.send({ from, to, subject: opts.subject, text: opts.text });
  } catch (e) {
    console.warn("[notify] emailToolUsers failed:", e);
  }
}
