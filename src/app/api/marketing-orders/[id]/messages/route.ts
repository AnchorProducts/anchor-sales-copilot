import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { Resend } from "resend";
import {
  imagesFromForm,
  uploadImages,
  signSupportAttachments,
  type SupportAttachment,
} from "@/lib/support/attachments";
import { sendPushToTool, sendPushToUser } from "@/lib/push/send";
import { emailToolUsers } from "@/lib/push/recipients";
import { marketingCategoriesLabel } from "@/lib/marketingOrders";
import { internalAppUrl, repAppUrl } from "@/lib/appUrl";
import { insideRepCanAccessOrder } from "@/lib/marketing/territory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const clean = (v: unknown) => String(v || "").trim();

async function getProfile(userId: string) {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("role,full_name,email")
    .eq("id", userId)
    .maybeSingle();
  return data as { role: string | null; full_name: string | null; email: string | null } | null;
}

async function loadOrder(id: string) {
  const { data, error } = await supabaseAdmin
    .from("marketing_orders")
    .select("id,created_by,categories,items,submitter_name,submitter_email,status")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as
    | {
        id: string;
        created_by: string | null;
        categories: string[] | null;
        items: string;
        submitter_name: string | null;
        submitter_email: string | null;
        status: string | null;
      }
    | null;
}

// Who may read/post in an order's thread: admins and the order's own rep always;
// inside (anchor) reps only when the order falls in their territory.
async function canAccessThread(
  role: string | null | undefined,
  email: string | null | undefined,
  userId: string,
  orderCreatedBy: string | null
): Promise<boolean> {
  const r = clean(role);
  if (r === "admin") return true;
  if (orderCreatedBy === userId) return true;
  if (r === "anchor_rep") return insideRepCanAccessOrder(clean(email), orderCreatedBy);
  return false;
}

// GET = the order's chat thread. Readable by an admin, the rep who created the
// order, or an inside rep whose territory the order falls in. Attachment URLs are
// signed for display.
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const supabase = await supabaseRoute();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const prof = await getProfile(auth.user.id);
    const role = clean(prof?.role);

    const order = await loadOrder(id);
    if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });
    // Admins and the order's own rep always have access. Inside reps additionally
    // need the order to fall in their territory.
    if (!(await canAccessThread(role, prof?.email, auth.user.id, order.created_by))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data: rows, error: mErr } = await supabaseAdmin
      .from("marketing_order_messages")
      .select("id,author_id,author_role,body,attachments,created_at")
      .eq("order_id", id)
      .order("created_at", { ascending: true });
    if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });

    const messages = rows ?? [];

    // Resolve author display names in one batched lookup.
    const authorIds = Array.from(new Set(messages.map((m) => m.author_id).filter(Boolean)));
    const nameMap = new Map<string, string | null>();
    if (authorIds.length) {
      const { data: people } = await supabaseAdmin
        .from("profiles")
        .select("id,full_name")
        .in("id", authorIds);
      for (const p of (people ?? []) as Array<{ id: string; full_name: string | null }>) {
        nameMap.set(p.id, clean(p.full_name) || null);
      }
    }

    const withAttachments = await Promise.all(
      messages.map(async (m) => ({
        id: m.id,
        author_id: m.author_id,
        author_role: m.author_role,
        author_name: nameMap.get(m.author_id) ?? null,
        body: m.body,
        created_at: m.created_at,
        attachments: await signSupportAttachments(
          ((m as { attachments?: unknown }).attachments as SupportAttachment[]) ?? []
        ),
      }))
    );

    return NextResponse.json({
      me: auth.user.id,
      role,
      order: { id: order.id, items: order.items, categories: order.categories, status: order.status },
      messages: withAttachments,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error)?.message || "Failed." }, { status: 500 });
  }
}

// POST = post a message to the order's thread (text and/or photos). The other
// party is notified: a rep's message pings whoever manages marketing orders; an
// admin's message pings the order's creator.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const supabase = await supabaseRoute();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const prof = await getProfile(auth.user.id);
    const role = clean(prof?.role);

    const order = await loadOrder(id);
    if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!(await canAccessThread(role, prof?.email, auth.user.id, order.created_by))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    // A fulfiller (admin or inside rep) posting notifies the order's rep; the rep
    // posting notifies the fulfillment team.
    const isTeam = role === "admin" || role === "anchor_rep";

    // Accept multipart (message + image attachments) or plain JSON.
    const contentType = req.headers.get("content-type") || "";
    let message = "";
    let images: File[] = [];
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      message = clean(form.get("message"));
      images = imagesFromForm(form);
    } else {
      const body = await req.json().catch(() => ({}));
      message = clean((body as { message?: string }).message);
    }

    if (!message && images.length === 0) {
      return NextResponse.json({ error: "Message is required." }, { status: 400 });
    }
    if (message.length > 5000) {
      return NextResponse.json({ error: "Message is too long." }, { status: 400 });
    }

    const { data: msgRow, error: insErr } = await supabaseAdmin
      .from("marketing_order_messages")
      .insert({
        order_id: id,
        author_id: auth.user.id,
        author_role: role || null,
        body: message,
      })
      .select("id")
      .single();
    if (insErr || !msgRow?.id) {
      return NextResponse.json({ error: insErr?.message || "Failed to send." }, { status: 500 });
    }

    if (images.length > 0) {
      const { attachments, error: upErr } = await uploadImages(`marketing-orders/${id}`, images);
      if (attachments.length > 0) {
        await supabaseAdmin
          .from("marketing_order_messages")
          .update({ attachments })
          .eq("id", msgRow.id);
      }
      if (upErr) console.warn("marketing order message attachment upload:", upErr);
    }

    // Notify the other party. Best-effort — a failed notification must never
    // fail the message that was already saved.
    const authorName = clean(prof?.full_name) || (isTeam ? "Anchor" : "A rep");
    const shortId = String(id).slice(0, 8);
    const label = marketingCategoriesLabel(order.categories);
    const preview = message ? message.slice(0, 140) : `📎 Sent ${images.length} photo(s)`;

    if (isTeam) {
      // Anchor team (admin or inside rep) → the rep who placed the order.
      if (order.created_by) {
        void sendPushToUser(order.created_by, {
          title: `New message about your order`,
          body: `${authorName}: ${preview}`,
          url: "/marketing-orders",
          tag: `mo-chat-${id}`,
        }).catch((e) => console.warn("marketing order chat push (rep) failed", (e as Error)?.message));
      }
      if (order.submitter_email) {
        try {
          // Link the rep to THEIR app (external reps → external app; internal
          // reps → internal app), not whichever app the admin replied from.
          const repProfile = order.created_by ? await getProfile(order.created_by) : null;
          await emailRepOnMessage({
            orderUrl: repAppUrl("/marketing-orders", repProfile?.role),
            shortId,
            label,
            body: preview,
            recipientEmail: order.submitter_email,
            recipientName: order.submitter_name,
            authorName,
          });
        } catch (e) {
          console.warn("marketing order chat email (rep) failed", (e as Error)?.message);
        }
      }
    } else {
      // Rep → whoever manages marketing orders. Admins use the internal app.
      const orderUrl = internalAppUrl("/admin/marketing-orders");
      void sendPushToTool("marketing_order", {
        title: `New message on order ${shortId}`,
        body: `${authorName} (${label}): ${preview}`,
        url: "/admin/marketing-orders",
        tag: `mo-chat-${id}`,
      });
      void emailToolUsers("marketing_order", {
        subject: `New message on marketing order ${shortId}`,
        text: `${authorName} sent a message about order ${shortId} (${label}):\n\n${preview}\n\nView the order: ${orderUrl}`,
      });
    }

    return NextResponse.json({ ok: true, id: msgRow.id });
  } catch (e) {
    return NextResponse.json({ error: (e as Error)?.message || "Failed." }, { status: 500 });
  }
}

// PATCH = mark this order's thread read for the current viewer (clears their
// unread badge). Upserts last_read_at = now() for (order, viewer).
export async function PATCH(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const supabase = await supabaseRoute();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const prof = await getProfile(auth.user.id);
    const role = clean(prof?.role);

    const order = await loadOrder(id);
    if (!order) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (!(await canAccessThread(role, prof?.email, auth.user.id, order.created_by))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { error } = await supabaseAdmin
      .from("marketing_order_reads")
      .upsert(
        { order_id: id, user_id: auth.user.id, last_read_at: new Date().toISOString() },
        { onConflict: "order_id,user_id" }
      );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error)?.message || "Failed." }, { status: 500 });
  }
}

async function emailRepOnMessage(args: {
  orderUrl: string;
  shortId: string;
  label: string;
  body: string;
  recipientEmail: string;
  recipientName: string | null;
  authorName: string;
}) {
  const resendKey = clean(process.env.RESEND_API_KEY);
  if (!resendKey) return;
  const from = clean(process.env.LEAD_NOTIFICATIONS_FROM) || "Anchor Co-Pilot <reports@anchorp.com>";
  const resend = new Resend(resendKey);

  const text = [
    `Hi ${args.recipientName || "there"},`,
    "",
    `${args.authorName} sent a message about your marketing order (${args.label}, #${args.shortId}):`,
    "",
    args.body,
    "",
    `Open the order to reply: ${args.orderUrl}`,
  ].join("\n");

  const result = await resend.emails.send({
    from,
    to: [args.recipientEmail],
    subject: `New message about your marketing order (${args.shortId})`,
    text,
  });
  const maybeError = (result as { error?: { message?: string } } | null)?.error;
  if (maybeError) throw new Error(clean(maybeError.message) || "Resend error");
}
