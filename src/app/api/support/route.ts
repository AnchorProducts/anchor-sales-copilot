import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { Resend } from "resend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const clean = (v: unknown) => String(v || "").trim();

type Profile = {
  role: string | null;
  full_name: string | null;
  email: string | null;
};

async function getProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("role,full_name,email")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Profile) ?? null;
}

async function emailAdminsOnNew(args: {
  requestId: string;
  subject: string;
  body: string;
  submitterName: string | null;
  submitterEmail: string | null;
  submitterRole: string | null;
}) {
  const resendKey = clean(process.env.RESEND_API_KEY);
  if (!resendKey) return;

  // Resolve recipients. Admin-configured values (notification_settings) take
  // precedence over env vars: the support_emails list first, then the legacy
  // single support_recipient_email column, then env, then the reports fallback.
  let configured: string[] = [];
  try {
    const { data } = await supabaseAdmin
      .from("notification_settings")
      .select("support_emails, support_recipient_email")
      .eq("id", 1)
      .maybeSingle();
    const row = data as
      | { support_emails?: string[] | null; support_recipient_email?: string | null }
      | null;
    const list = (row?.support_emails ?? []).map((e) => clean(e)).filter(Boolean);
    if (list.length > 0) {
      configured = list;
    } else if (row?.support_recipient_email) {
      const single = clean(row.support_recipient_email);
      if (single) configured = [single];
    }
  } catch { /* columns may not exist — env var fallback is fine */ }

  const to =
    configured.length > 0
      ? configured
      : [
          clean(
            process.env.SUPPORT_NOTIFICATIONS_EMAIL ||
              process.env.LEAD_NOTIFICATIONS_FROM ||
              "reports@anchorp.com"
          ),
        ];
  const from = clean(process.env.LEAD_NOTIFICATIONS_FROM) || "Anchor Co-Pilot <reports@anchorp.com>";

  const lines = [
    `New support request (ID: ${args.requestId.slice(0, 8)})`,
    "",
    `From: ${args.submitterName || "—"} <${args.submitterEmail || "—"}> [${args.submitterRole || "—"}]`,
    `Subject: ${args.subject}`,
    "",
    args.body,
  ];

  const resend = new Resend(resendKey);
  await resend.emails.send({
    from,
    to,
    subject: `Support — ${args.subject} (${args.requestId.slice(0, 8)})`,
    text: lines.join("\n"),
  });
}

export async function POST(req: Request) {
  try {
    const supabase = await supabaseRoute();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const profile = await getProfile(auth.user.id);
    // Any authenticated user with a known role can file a request.
    const role = clean(profile?.role);
    if (!role) return NextResponse.json({ error: "Profile not set up." }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const subject = clean((body as { subject?: string }).subject);
    const message = clean((body as { message?: string }).message);
    if (!subject) return NextResponse.json({ error: "Subject is required." }, { status: 400 });
    if (!message) return NextResponse.json({ error: "Message is required." }, { status: 400 });
    if (subject.length > 200) return NextResponse.json({ error: "Subject is too long." }, { status: 400 });
    if (message.length > 5000) return NextResponse.json({ error: "Message is too long." }, { status: 400 });

    const submitter_name = clean(profile?.full_name) || null;
    const submitter_email = clean(profile?.email) || clean(auth.user.email) || null;
    const submitter_role = role;

    const { data: row, error: insErr } = await supabaseAdmin
      .from("support_requests")
      .insert({
        created_by: auth.user.id,
        subject,
        status: "open",
        submitter_name,
        submitter_email,
        submitter_role,
      })
      .select("id")
      .single();
    if (insErr || !row?.id) {
      return NextResponse.json({ error: insErr?.message || "Failed to create request." }, { status: 500 });
    }
    const requestId = row.id as string;

    const { error: msgErr } = await supabaseAdmin.from("support_messages").insert({
      request_id: requestId,
      author_id: auth.user.id,
      author_role: submitter_role,
      body: message,
    });
    if (msgErr) {
      return NextResponse.json({ error: msgErr.message }, { status: 500 });
    }

    try {
      await emailAdminsOnNew({
        requestId,
        subject,
        body: message,
        submitterName: submitter_name,
        submitterEmail: submitter_email,
        submitterRole: submitter_role,
      });
    } catch (e) {
      console.warn("support new-request email failed", (e as Error)?.message);
    }

    return NextResponse.json({ ok: true, id: requestId }, { status: 201 });
  } catch (e) {
    console.error("support POST error", e);
    return NextResponse.json({ error: (e as Error)?.message || "Failed." }, { status: 500 });
  }
}

export async function GET() {
  try {
    const supabase = await supabaseRoute();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const profile = await getProfile(auth.user.id);
    const role = clean(profile?.role);
    const isAdmin = role === "admin";

    let q = supabaseAdmin
      .from("support_requests")
      .select("id,subject,status,submitter_name,submitter_email,submitter_role,created_at,updated_at,last_message_at")
      .order("last_message_at", { ascending: false })
      .limit(200);
    if (!isAdmin) q = q.eq("created_by", auth.user.id);

    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ items: data ?? [] });
  } catch (e) {
    return NextResponse.json({ error: (e as Error)?.message || "Failed." }, { status: 500 });
  }
}
