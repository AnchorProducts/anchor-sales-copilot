import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { Resend } from "resend";
import {
  isMarketingCategory,
  isMarketingOrderStatus,
  marketingCategoriesLabel,
  marketingOrderStatusLabel,
  normalizeMarketingRecipients,
  normalizeRecipientEmails,
  type MarketingRecipients,
} from "@/lib/marketingOrders";
import { sendPushToTool } from "@/lib/push/send";

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

// Resolve recipients for the selected categories. Each category routes to its
// own mapping → the "default" mapping → env vars → hard fallback; the result is
// deduped so a multi-category order emails every relevant contact once. Mirrors
// the fallback style used by the commission + notable-project routes.
async function resolveRecipients(categories: string[]): Promise<string[]> {
  let recipients: MarketingRecipients = {};
  try {
    const { data } = await supabaseAdmin
      .from("notification_settings")
      .select("marketing_orders_recipients")
      .eq("id", 1)
      .maybeSingle();
    // normalize handles both the new string[] shape and legacy single strings.
    recipients = normalizeMarketingRecipients(
      data?.marketing_orders_recipients as Record<string, unknown> | null
    );
  } catch {
    recipients = {};
  }

  const defaultList =
    recipients.default && recipients.default.length > 0
      ? recipients.default
      : normalizeRecipientEmails(
          process.env.MARKETING_ORDERS_NOTIFICATIONS_EMAIL ||
            process.env.LEAD_NOTIFICATIONS_FROM ||
            "reports@anchorp.com"
        );

  const out: string[] = [];
  for (const category of categories) {
    const list =
      recipients[category] && recipients[category].length > 0
        ? recipients[category]
        : defaultList;
    for (const to of list) {
      const email = clean(to);
      if (email && !out.includes(email)) out.push(email);
    }
  }
  // Always have at least one recipient.
  if (out.length === 0) {
    for (const to of defaultList) {
      const email = clean(to);
      if (email && !out.includes(email)) out.push(email);
    }
  }
  return out;
}

async function sendMarketingOrderEmail(params: {
  orderId: string;
  to: string[];
  categories: string[];
  items: string;
  quantity: string | null;
  neededBy: string | null;
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
  const categoryLabel = marketingCategoriesLabel(params.categories);

  const lines: string[] = [];
  lines.push(`New Marketing Order submitted (ID: ${params.orderId.slice(0, 8)})`);
  lines.push("");
  lines.push(`Categories: ${categoryLabel}`);
  lines.push(`Item(s): ${params.items}`);
  lines.push(`Quantity: ${params.quantity || "—"}`);
  lines.push(`Needed by: ${params.neededBy || "—"}`);
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

  const result = await resend.emails.send({ from, to: params.to, subject, text: lines.join("\n") });
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

    const rawCategories = Array.isArray(body.categories) ? body.categories : [];
    // Normalize: strings only, de-duped, valid keys.
    const categories: string[] = [];
    for (const raw of rawCategories) {
      const key = clean(raw);
      if (key && isMarketingCategory(key) && !categories.includes(key)) categories.push(key);
    }
    const items = clean(body.items);
    const quantity = clean(body.quantity) || null;
    const needed_by = clean(body.needed_by) || null;
    const ship_to = clean(body.ship_to) || null;
    const notes = clean(body.notes) || null;

    if (categories.length === 0) {
      return NextResponse.json({ error: "Pick at least one category." }, { status: 400 });
    }
    if (!items) {
      return NextResponse.json({ error: "Describe the item(s) you need." }, { status: 400 });
    }
    if (!quantity) {
      return NextResponse.json({ error: "Quantity is required." }, { status: 400 });
    }
    if (!ship_to) {
      return NextResponse.json({ error: "A shipping address is required." }, { status: 400 });
    }
    // needed_by is required and must be a YYYY-MM-DD calendar date.
    if (!needed_by) {
      return NextResponse.json({ error: "A needed-by date is required." }, { status: 400 });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(needed_by) || Number.isNaN(Date.parse(needed_by))) {
      return NextResponse.json({ error: "Needed-by date is invalid." }, { status: 400 });
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
        categories,
        items,
        quantity,
        needed_by,
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
      to: string[] | null;
      error: string | null;
    } = { attempted: true, sent: false, to: null, error: null };

    try {
      const to = await resolveRecipients(categories);
      emailNotification.to = to;
      await sendMarketingOrderEmail({
        orderId,
        to,
        categories,
        items,
        quantity,
        neededBy: needed_by,
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

    void sendPushToTool("marketing_order", {
      title: "New marketing order",
      body: `${marketingCategoriesLabel(categories)} — ${submitter_name || submitter_company || "a rep"}`,
      url: "/admin/marketing-orders",
      tag: `mo-${orderId}`,
    });

    return NextResponse.json({ ok: true, id: orderId, email_notification: emailNotification }, { status: 201 });
  } catch (e: any) {
    console.error("marketing order route error", e);
    return NextResponse.json({ error: e?.message || "Failed to submit order." }, { status: 500 });
  }
}

// Order history. Admins see every order; sales reps (internal + external) see
// only their own — that's the rep-facing status tracker / history view.
export async function GET() {
  try {
    const supabase = await supabaseRoute();
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr || !auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const profile = await getProfile(auth.user.id);
    const role = clean(profile?.role);
    if (role !== "admin" && role !== "anchor_rep" && role !== "external_rep") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let query = supabaseAdmin
      .from("marketing_orders")
      .select(
        "id,categories,items,quantity,needed_by,ship_to,notes,status,submitter_name,submitter_company,submitter_email,submitter_phone,created_at,updated_at,updated_by"
      )
      .order("created_at", { ascending: false })
      .limit(500);

    // Non-admins only ever see the orders they themselves submitted.
    if (role !== "admin") {
      query = query.eq("created_by", auth.user.id);
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const orders = (data || []) as any[];

    // Resolve who last updated each order's status, so the submitting rep can
    // see which admin to contact. One batched lookup; mapped onto each order.
    const updaterIds = Array.from(
      new Set(orders.map((o) => o.updated_by).filter((v): v is string => !!v))
    );
    const updaterMap = new Map<string, { name: string | null; email: string | null }>();
    if (updaterIds.length) {
      const { data: updaters } = await supabaseAdmin
        .from("profiles")
        .select("id,full_name,email")
        .in("id", updaterIds);
      for (const u of (updaters || []) as any[]) {
        updaterMap.set(u.id, { name: clean(u.full_name) || null, email: clean(u.email) || null });
      }
    }

    const items = orders.map((o) => {
      const updater = o.updated_by ? updaterMap.get(o.updated_by) : undefined;
      const { updated_by, ...rest } = o;
      return {
        ...rest,
        updated_by_name: updater?.name ?? null,
        updated_by_email: updater?.email ?? null,
      };
    });

    return NextResponse.json({ items, role });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to load orders." }, { status: 500 });
  }
}

// Admin-only: update an order's status (the tracker's source of truth).
export async function PATCH(req: Request) {
  try {
    const supabase = await supabaseRoute();
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr || !auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const profile = await getProfile(auth.user.id);
    if (clean(profile?.role) !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const id = clean(body?.id);
    const status = clean(body?.status);
    if (!id) return NextResponse.json({ error: "Missing order id." }, { status: 400 });
    if (!status || !isMarketingOrderStatus(status)) {
      return NextResponse.json({ error: "Invalid status." }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("marketing_orders")
      .update({ status, updated_by: auth.user.id, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select("id,status,updated_at")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Order not found." }, { status: 404 });

    void sendPushToTool("marketing_order_status", {
      title: "Marketing order updated",
      body: `Order ${String(id).slice(0, 8)} is now ${marketingOrderStatusLabel(status)}.`,
      url: "/admin/marketing-orders",
      tag: `mo-status-${id}`,
    });

    return NextResponse.json({ ok: true, order: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to update order." }, { status: 500 });
  }
}

// Admin-only: permanently delete an order from history. id passed as ?id=.
export async function DELETE(req: Request) {
  try {
    const supabase = await supabaseRoute();
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr || !auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const profile = await getProfile(auth.user.id);
    if (clean(profile?.role) !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const id = clean(new URL(req.url).searchParams.get("id"));
    if (!id) return NextResponse.json({ error: "Missing order id." }, { status: 400 });

    const { error } = await supabaseAdmin.from("marketing_orders").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, id });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to delete order." }, { status: 500 });
  }
}
