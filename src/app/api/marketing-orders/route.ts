import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { Resend } from "resend";
import {
  isMarketingCategory,
  marketingCategoryLabel,
  type MarketingRecipients,
} from "@/lib/marketingOrders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clean(v: any) {
  return String(v || "").trim();
}

async function getProfile(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("role,full_name,company,phone,email")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as any;
}

// Resolve the recipient for a category: category-specific mapping → "default"
// mapping → env vars → hard fallback. Mirrors the fallback style used by the
// commission + notable-project routes.
async function resolveRecipient(category: string): Promise<string> {
  let recipients: MarketingRecipients = {};
  try {
    const { data } = await supabaseAdmin
      .from("notification_settings")
      .select("marketing_orders_recipients")
      .eq("id", 1)
      .maybeSingle();
    recipients = (data?.marketing_orders_recipients as MarketingRecipients | null) ?? {};
  } catch {
    recipients = {};
  }

  return clean(
    recipients[category] ||
      recipients.default ||
      process.env.MARKETING_ORDERS_NOTIFICATIONS_EMAIL ||
      process.env.LEAD_NOTIFICATIONS_FROM ||
      "reports@anchorp.com"
  );
}

async function sendMarketingOrderEmail(params: {
  orderId: string;
  to: string;
  category: string;
  items: string;
  quantity: string | null;
  shipTo: string | null;
  notes: string | null;
  submitterName: string | null;
  submitterCompany: string | null;
  submitterPhone: string | null;
  submitterEmail: string | null;
}) {
  const resendKey = clean(process.env.RESEND_API_KEY);
  if (!resendKey) return;

  const resend = new Resend(resendKey);
  const from = clean(process.env.LEAD_NOTIFICATIONS_FROM) || "Anchor Co-Pilot <reports@anchorp.com>";
  const categoryLabel = marketingCategoryLabel(params.category);

  const lines: string[] = [];
  lines.push(`New Marketing Order submitted (ID: ${params.orderId.slice(0, 8)})`);
  lines.push("");
  lines.push(`Category: ${categoryLabel}`);
  lines.push(`Item(s): ${params.items}`);
  lines.push(`Quantity: ${params.quantity || "—"}`);
  lines.push("");
  lines.push(
    `Submitter: ${params.submitterName || "—"} | ${params.submitterCompany || "—"} | ${params.submitterPhone || "—"} | ${params.submitterEmail || "—"}`
  );
  lines.push("");
  lines.push("Ship to:");
  lines.push(params.shipTo || "(none)");
  lines.push("");
  lines.push("Notes:");
  lines.push(params.notes || "(none)");

  const subject = `Marketing Order - ${categoryLabel} (${params.orderId.slice(0, 8)})`;

  const result = await resend.emails.send({ from, to: [params.to], subject, text: lines.join("\n") });
  const maybeError = (result as any)?.error;
  if (maybeError) throw new Error(clean(maybeError?.message) || "Resend error");
}

export async function POST(req: Request) {
  try {
    const supabase = await supabaseRoute();
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr || !auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const user = auth.user;
    const profile = await getProfile(user.id);
    // Internal (anchor_rep) + external sales, and admins previewing a sales role.
    if (
      !profile ||
      (profile.role !== "external_rep" &&
        profile.role !== "anchor_rep" &&
        profile.role !== "admin")
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

    const category = clean(body.category);
    const items = clean(body.items);
    const quantity = clean(body.quantity) || null;
    const ship_to = clean(body.ship_to) || null;
    const notes = clean(body.notes) || null;

    if (!category || !isMarketingCategory(category)) {
      return NextResponse.json({ error: "Pick a valid category." }, { status: 400 });
    }
    if (!items) {
      return NextResponse.json({ error: "Describe the item(s) you need." }, { status: 400 });
    }
    if (!ship_to) {
      return NextResponse.json({ error: "A shipping address is required." }, { status: 400 });
    }

    const submitter_name = clean(profile.full_name) || null;
    const submitter_company = clean(profile.company) || null;
    const submitter_phone = clean(profile.phone) || null;
    const submitter_email = clean(profile.email) || clean(user.email) || null;

    const { data: row, error: insErr } = await supabaseAdmin
      .from("marketing_orders")
      .insert({
        created_by: user.id,
        submitter_name,
        submitter_company,
        submitter_email,
        submitter_phone,
        category,
        items,
        quantity,
        ship_to,
        notes,
        status: "new",
      })
      .select("id")
      .single();

    if (insErr || !row?.id) {
      return NextResponse.json({ error: insErr?.message || "Failed to create order." }, { status: 500 });
    }

    const orderId = row.id as string;

    let emailNotification: {
      attempted: boolean;
      sent: boolean;
      to: string | null;
      error: string | null;
    } = { attempted: true, sent: false, to: null, error: null };

    try {
      const to = await resolveRecipient(category);
      emailNotification.to = to;
      await sendMarketingOrderEmail({
        orderId,
        to,
        category,
        items,
        quantity,
        shipTo: ship_to,
        notes,
        submitterName: submitter_name,
        submitterCompany: submitter_company,
        submitterPhone: submitter_phone,
        submitterEmail: submitter_email,
      });
      emailNotification.sent = true;
    } catch (emailErr: any) {
      emailNotification.error = emailErr?.message || String(emailErr);
      console.warn("marketing order email failed", emailNotification.error);
    }

    return NextResponse.json({ ok: true, id: orderId, email_notification: emailNotification }, { status: 201 });
  } catch (e: any) {
    console.error("marketing order route error", e);
    return NextResponse.json({ error: e?.message || "Failed to submit order." }, { status: 500 });
  }
}
