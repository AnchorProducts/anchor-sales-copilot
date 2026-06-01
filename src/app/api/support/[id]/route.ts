import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { Resend } from "resend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const clean = (v: unknown) => String(v || "").trim();

async function getRole(userId: string) {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("role,full_name,email")
    .eq("id", userId)
    .maybeSingle();
  return data as { role: string | null; full_name: string | null; email: string | null } | null;
}

async function loadRequest(id: string) {
  const { data, error } = await supabaseAdmin
    .from("support_requests")
    .select("id,created_by,subject,status,submitter_name,submitter_email,submitter_role,created_at,last_message_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as
    | {
        id: string;
        created_by: string;
        subject: string;
        status: string;
        submitter_name: string | null;
        submitter_email: string | null;
        submitter_role: string | null;
        created_at: string;
        last_message_at: string;
      }
    | null;
}

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const supabase = await supabaseRoute();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const prof = await getRole(auth.user.id);
    const role = clean(prof?.role);
    const isAdmin = role === "admin";

    const request = await loadRequest(id);
    if (!request) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!isAdmin && request.created_by !== auth.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: messages, error: mErr } = await supabaseAdmin
      .from("support_messages")
      .select("id,author_id,author_role,body,created_at")
      .eq("request_id", id)
      .order("created_at", { ascending: true });
    if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });

    return NextResponse.json({ request, messages: messages ?? [] });
  } catch (e) {
    return NextResponse.json({ error: (e as Error)?.message || "Failed." }, { status: 500 });
  }
}

// POST = add a reply. Admins reply to any thread; the requester replies to
// their own. Admin replies trigger an email to the requester.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const supabase = await supabaseRoute();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const prof = await getRole(auth.user.id);
    const role = clean(prof?.role);
    const isAdmin = role === "admin";

    const request = await loadRequest(id);
    if (!request) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!isAdmin && request.created_by !== auth.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({}));
    const message = clean((body as { message?: string }).message);
    const close = (body as { close?: boolean }).close === true;
    if (!message && !close) {
      return NextResponse.json({ error: "Message is required." }, { status: 400 });
    }
    if (message.length > 5000) return NextResponse.json({ error: "Message is too long." }, { status: 400 });

    if (message) {
      const { error: insErr } = await supabaseAdmin.from("support_messages").insert({
        request_id: id,
        author_id: auth.user.id,
        author_role: role || null,
        body: message,
      });
      if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 });
    }

    // Admins can flip status. Sending a reply auto-reopens a closed thread
    // so the requester can see the new message in their list.
    let nextStatus: string | null = null;
    if (close && isAdmin) nextStatus = "closed";
    else if (message && request.status === "closed") nextStatus = "open";
    if (nextStatus && nextStatus !== request.status) {
      await supabaseAdmin
        .from("support_requests")
        .update({ status: nextStatus, updated_at: new Date().toISOString() })
        .eq("id", id);
    }

    // Email the requester when an admin replies (skip self-reply edge case).
    if (isAdmin && message && request.created_by !== auth.user.id) {
      try { await emailRequesterOnReply({
        requestId: id,
        subject: request.subject,
        body: message,
        recipientEmail: request.submitter_email,
        recipientName: request.submitter_name,
        replierName: clean(prof?.full_name) || "Anchor Support",
      }); } catch (e) {
        console.warn("support reply email failed", (e as Error)?.message);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error)?.message || "Failed." }, { status: 500 });
  }
}

async function emailRequesterOnReply(args: {
  requestId: string;
  subject: string;
  body: string;
  recipientEmail: string | null;
  recipientName: string | null;
  replierName: string;
}) {
  const resendKey = clean(process.env.RESEND_API_KEY);
  if (!resendKey) return;
  if (!args.recipientEmail) return;
  const from = clean(process.env.LEAD_NOTIFICATIONS_FROM) || "Anchor Co-Pilot <reports@anchorp.com>";
  const resend = new Resend(resendKey);

  const text = [
    `Hi ${args.recipientName || "there"},`,
    "",
    `${args.replierName} replied to your support request:`,
    "",
    args.body,
    "",
    `Subject: ${args.subject}`,
    `Open the thread in the app to reply: /dashboard/support/${args.requestId}`,
  ].join("\n");

  await resend.emails.send({
    from,
    to: [args.recipientEmail],
    subject: `Re: ${args.subject}`,
    text,
  });
}
