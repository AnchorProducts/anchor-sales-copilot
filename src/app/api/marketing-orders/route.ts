import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { Resend } from "resend";
import {
  isMarketingCategory,
  isMarketingOrderStatus,
  marketingCategoriesLabel,
  marketingOrderStatusLabel,
} from "@/lib/marketingOrders";
import { sendPushToTool, sendPushToUser } from "@/lib/push/send";
import { getToolRecipientEmails, mergeEmails, emailToolUsers } from "@/lib/push/recipients";
import { marketingRegionToolKey } from "@/lib/push/topics";
import { internalAppUrl } from "@/lib/appUrl";
import { loadAllSalesReps } from "@/lib/sales/regions";
import {
  submitterStates,
  insideRepEmailsFor,
  insideRepCanAccessOrder,
  resolveInsideRepsFor,
} from "@/lib/marketing/territory";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clean(v: any) {
  return String(v || "").trim();
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Friendly calendar-date label for emails (input is YYYY-MM-DD).
function emailDate(s: string | null) {
  if (!s) return null;
  try {
    return new Date(`${s}T00:00:00`).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return s;
  }
}

// Per-status badge colors for the HTML email.
function statusBadgeStyle(status: string): { bg: string; fg: string } {
  switch (status) {
    case "delayed":
      return { bg: "#fef3c7", fg: "#92400e" };
    case "cancelled":
      return { bg: "#fee2e2", fg: "#991b1b" };
    case "fulfilled":
      return { bg: "#9CE2BB", fg: "#11500F" };
    case "shipped":
    case "processing":
      return { bg: "#dcfce7", fg: "#047835" };
    default: // new
      return { bg: "#eef2f5", fg: "#76777B" };
  }
}

// Branded HTML for the "order status updated" email.
function renderStatusEmail(opts: {
  label: string;
  status: string;
  shortId: string;
  orderUrl: string;
  projectedShipDate: string | null;
  delayNotes: string | null;
}): string {
  const badge = statusBadgeStyle(opts.status);
  const projected = emailDate(opts.projectedShipDate);

  const delayBlock =
    opts.status === "delayed" && (projected || opts.delayNotes)
      ? `
      <tr><td style="padding:0 32px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fffbeb;border:1px solid #fcd34d;border-radius:12px;">
          <tr><td style="padding:16px 18px;font-family:Helvetica,Arial,sans-serif;color:#92400e;">
            <div style="font-size:13px;font-weight:700;letter-spacing:.02em;">⏳ This order is delayed</div>
            ${projected ? `<div style="margin-top:8px;font-size:14px;"><strong>Projected ship date:</strong> ${escapeHtml(projected)}</div>` : ""}
            ${opts.delayNotes ? `<div style="margin-top:6px;font-size:14px;line-height:1.5;">${escapeHtml(opts.delayNotes)}</div>` : ""}
          </td></tr>
        </table>
      </td></tr>`
      : "";

  return `<!DOCTYPE html>
<html><body style="margin:0;padding:0;background:#f3f5f4;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f5f4;padding:24px 0;">
    <tr><td align="center">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" style="width:480px;max-width:92vw;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.08);">
        <!-- header -->
        <tr><td style="background:#11500F;padding:20px 32px;font-family:Helvetica,Arial,sans-serif;">
          <div style="color:#9CE2BB;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;">Anchor Co-Pilot</div>
          <div style="color:#ffffff;font-size:13px;margin-top:2px;">Marketing Orders</div>
        </td></tr>
        <!-- title -->
        <tr><td style="padding:28px 32px 8px;font-family:Helvetica,Arial,sans-serif;">
          <span style="display:inline-block;background:${badge.bg};color:${badge.fg};font-size:12px;font-weight:700;padding:5px 12px;border-radius:999px;text-transform:uppercase;letter-spacing:.04em;">${escapeHtml(opts.label)}</span>
          <h1 style="margin:14px 0 0;font-size:20px;line-height:1.3;color:#1a1a1a;">Order #${escapeHtml(opts.shortId)} was updated</h1>
          <p style="margin:6px 0 0;font-size:14px;color:#76777B;">This order's status is now <strong style="color:#11500F;">${escapeHtml(opts.label)}</strong>.</p>
        </td></tr>
        <tr><td style="height:20px;"></td></tr>
        ${delayBlock}
        <!-- cta -->
        <tr><td style="padding:24px 32px 8px;font-family:Helvetica,Arial,sans-serif;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="border-radius:10px;background:#047835;">
            <a href="${opts.orderUrl}" style="display:inline-block;padding:12px 22px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">View order in the app →</a>
          </td></tr></table>
        </td></tr>
        <!-- footer -->
        <tr><td style="padding:24px 32px 28px;font-family:Helvetica,Arial,sans-serif;border-top:1px solid #eef2f5;margin-top:12px;">
          <p style="margin:16px 0 0;font-size:12px;color:#9aa0a6;line-height:1.5;">You're receiving this because you manage marketing orders in Anchor Co-Pilot.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

async function getProfile(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("role,full_name,company,phone,email,service_states,service_state,service_zip")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as any;
}

// Recipients = the marketing_order tool's assigned users + raw emails, with an
// env fallback so an order never goes nowhere.
async function resolveRecipients(): Promise<string[]> {
  const configured = await getToolRecipientEmails("marketing_order");
  if (configured.length > 0) return configured;
  return mergeEmails(
    process.env.MARKETING_ORDERS_NOTIFICATIONS_EMAIL ||
      process.env.LEAD_NOTIFICATIONS_FROM ||
      "reports@anchorp.com"
  );
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

// Confirmation email to the rep who submitted the order, acknowledging receipt
// and pointing them at their order-history view to track status.
async function sendMarketingOrderCreatorEmail(params: {
  orderId: string;
  to: string;
  categories: string[];
  items: string;
  quantity: string | null;
  neededBy: string | null;
  shipTo: string | null;
  notes: string | null;
}) {
  const resendKey = clean(process.env.RESEND_API_KEY);
  if (!resendKey) return;

  const resend = new Resend(resendKey);
  const from = clean(process.env.LEAD_NOTIFICATIONS_FROM) || "Anchor Co-Pilot <reports@anchorp.com>";
  const categoryLabel = marketingCategoriesLabel(params.categories);

  const lines: string[] = [];
  lines.push(`We received your marketing order (ID: ${params.orderId.slice(0, 8)}).`);
  lines.push("");
  lines.push(`Categories: ${categoryLabel}`);
  lines.push(`Item(s): ${params.items}`);
  lines.push(`Quantity: ${params.quantity || "—"}`);
  lines.push(`Needed by: ${params.neededBy || "—"}`);
  lines.push("");
  lines.push("Ship to:");
  lines.push(params.shipTo || "(none)");
  lines.push("");
  lines.push("Notes:");
  lines.push(params.notes || "(none)");
  lines.push("");
  lines.push("You can track its status from the Marketing Orders tab in Anchor Co-Pilot.");

  const subject = `We got your marketing order - ${categoryLabel} (${params.orderId.slice(0, 8)})`;

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
      const to = await resolveRecipients();
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

    // Notify the creator too: a confirmation email + a push to their devices, in
    // addition to the admin notifications above. Best-effort — failures here must
    // never block the successful order submission.
    if (submitter_email) {
      try {
        await sendMarketingOrderCreatorEmail({
          orderId,
          to: submitter_email,
          categories,
          items,
          quantity,
          neededBy: needed_by,
          shipTo: ship_to,
          notes,
        });
      } catch (creatorEmailErr: any) {
        console.warn("marketing order creator email failed", creatorEmailErr?.message || creatorEmailErr);
      }
    }

    // sendPushToUser (unlike sendPushToTool) has no internal try/catch, so guard
    // the fire-and-forget call to avoid an unhandled rejection after the 201.
    void sendPushToUser(user.id, {
      title: "Marketing order received",
      body: `${marketingCategoriesLabel(categories)} — we got your order and it's being processed.`,
      url: "/marketing-orders",
      tag: `mo-creator-${orderId}`,
    }).catch((pushErr) => {
      console.warn("marketing order creator push failed", pushErr?.message || pushErr);
    });

    // Route the order to its REGION'S MANAGER — not the inside rep directly. Per
    // the inside sales manager, marketing orders must not go straight to the
    // inside salespeople. So we resolve the submitter's territory to its inside
    // rep(s) (existing routing), then notify each inside rep's per-region tool —
    // whose recipients are the manager(s) an admin assigned in settings. If a
    // region has no one assigned, nothing routes there and the marketing_order
    // tool above (admins) is the safety net. Only outside-rep submissions route
    // this way; internal/admin submissions already reach the team via that tool.
    // Inside reps still SEE and work their orders via the GET/PATCH scoping below.
    // All best-effort — never block the successful submission.
    if (profile.role === "external_rep") {
      try {
        const insideReps = await resolveInsideRepsFor(profile);
        const regionKeys = Array.from(
          new Set(
            insideReps.map((r) => clean(r.id)).filter(Boolean).map((id) => marketingRegionToolKey(id))
          )
        );
        if (regionKeys.length === 0) {
          console.warn("marketing order: no region resolved for submitter", submitter_email || orderId);
        }

        const who = submitter_name || submitter_company || "an outside rep";
        const categoryLabel = marketingCategoriesLabel(categories);
        const fulfillUrl = internalAppUrl("/admin/marketing-orders");
        const text = [
          `${who} submitted a marketing order (ID: ${orderId.slice(0, 8)}).`,
          "",
          `Submitted by: ${submitter_name || "—"}${submitter_company ? ` (${submitter_company})` : ""}`,
          `Categories: ${categoryLabel}`,
          `Item(s): ${items}`,
          `Quantity: ${quantity || "—"}`,
          `Needed by: ${needed_by || "—"}`,
          "",
          "Ship to:",
          ship_to || "(none)",
          "",
          "Notes:",
          notes || "(none)",
          "",
          `Fulfill this order: ${fulfillUrl}`,
        ].join("\n");

        for (const regionKey of regionKeys) {
          void sendPushToTool(regionKey, {
            title: "Marketing order in your region",
            body: `${who} ordered ${categoryLabel}.`,
            url: "/admin/marketing-orders",
            tag: `mo-${orderId}`,
          });
          void emailToolUsers(regionKey, {
            subject: `Marketing order from ${who} — ${categoryLabel} (${orderId.slice(0, 8)})`,
            text,
          });
        }
      } catch (regionErr: any) {
        console.warn("marketing order region notify failed", regionErr?.message || regionErr);
      }
    }

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
    // Admins and inside (anchor) reps fulfill orders, so they see the full queue
    // and the coordination log. External reps only ever see their own orders.
    const isFulfiller = role === "admin" || role === "anchor_rep";

    let query = supabaseAdmin
      .from("marketing_orders")
      .select(
        "id,created_by,categories,items,quantity,needed_by,ship_to,notes,status,projected_ship_date,delay_notes,submitter_name,submitter_company,submitter_email,submitter_phone,created_at,updated_at,updated_by"
      )
      .order("created_at", { ascending: false })
      .limit(500);

    if (!isFulfiller) {
      query = query.eq("created_by", auth.user.id);
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    let orders = (data || []) as any[];

    // Inside (anchor) reps see ONLY orders submitted by an outside rep in their
    // own territory — the same outside-rep→inside-rep routing used to notify them
    // on submit ("who gets notified" == "who can see it"). Admins see everything.
    if (role === "anchor_rep") {
      const meEmail = clean(profile?.email).toLowerCase();
      if (!meEmail) {
        orders = [];
      } else {
        const allReps = await loadAllSalesReps();
        const submitterIds = Array.from(
          new Set(orders.map((o) => o.created_by).filter((v): v is string => !!v))
        );
        const subMap = new Map<string, { role: string; states: string[]; zip: string | null }>();
        if (submitterIds.length) {
          const { data: subs } = await supabaseAdmin
            .from("profiles")
            .select("id,role,service_states,service_state,service_zip")
            .in("id", submitterIds);
          for (const s of (subs || []) as any[]) {
            subMap.set(s.id, {
              role: clean(s.role),
              states: submitterStates(s),
              zip: clean(s.service_zip) || null,
            });
          }
        }
        // Cache the territory test per submitter so shared submitters resolve once.
        const mineBySubmitter = new Map<string, boolean>();
        orders = orders.filter((o) => {
          const sub = o.created_by ? subMap.get(o.created_by) : undefined;
          // Only outside reps' orders are routed to an inside rep's territory.
          if (!sub || sub.role !== "external_rep") return false;
          let mine = mineBySubmitter.get(o.created_by);
          if (mine === undefined) {
            mine = insideRepEmailsFor(allReps, sub.states, sub.zip).has(meEmail);
            mineBySubmitter.set(o.created_by, mine);
          }
          return mine;
        });
      }
    }

    // Fulfillers (admins + inside reps) get the latest activity-log entry per
    // order, so the "who's on it" line is visible at a glance and nobody redoes
    // work already underway. External reps never see the internal coordination
    // log. One batched, ordered lookup; first row per order is the most recent.
    const latestActivity = new Map<
      string,
      { note: string; to_status: string | null; admin_id: string | null; created_at: string }
    >();
    if (isFulfiller && orders.length) {
      const { data: acts } = await supabaseAdmin
        .from("marketing_order_activity")
        .select("order_id,note,to_status,admin_id,created_at")
        .in("order_id", orders.map((o) => o.id))
        .order("created_at", { ascending: false });
      for (const a of (acts || []) as any[]) {
        if (!latestActivity.has(a.order_id)) {
          latestActivity.set(a.order_id, {
            note: a.note,
            to_status: a.to_status,
            admin_id: a.admin_id,
            created_at: a.created_at,
          });
        }
      }
    }

    // Resolve who last updated each order's status (also the person who set any
    // delay), so the submitting rep knows which admin to contact — plus the admins
    // behind the latest activity entries. One batched lookup; mapped onto orders.
    const profileIds = new Set<string>();
    for (const o of orders) if (o.updated_by) profileIds.add(o.updated_by);
    for (const a of latestActivity.values()) if (a.admin_id) profileIds.add(a.admin_id);
    const nameMap = new Map<string, { name: string | null; email: string | null }>();
    if (profileIds.size) {
      const { data: people } = await supabaseAdmin
        .from("profiles")
        .select("id,full_name,email")
        .in("id", Array.from(profileIds));
      for (const u of (people || []) as any[]) {
        nameMap.set(u.id, { name: clean(u.full_name) || null, email: clean(u.email) || null });
      }
    }

    const items = orders.map((o) => {
      const updater = o.updated_by ? nameMap.get(o.updated_by) : undefined;
      const act = latestActivity.get(o.id);
      const actor = act?.admin_id ? nameMap.get(act.admin_id) : undefined;
      const { updated_by, created_by, ...rest } = o;
      return {
        ...rest,
        updated_by_name: updater?.name ?? null,
        updated_by_email: updater?.email ?? null,
        last_activity: act
          ? {
              note: act.note,
              to_status: act.to_status,
              created_at: act.created_at,
              admin_name: actor?.name ?? null,
              admin_email: actor?.email ?? null,
            }
          : null,
      };
    });

    return NextResponse.json({ items, role });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to load orders." }, { status: 500 });
  }
}

// Fulfiller-only (admins + inside reps): update an order's status (the tracker's
// source of truth) and log what was done.
export async function PATCH(req: Request) {
  try {
    const supabase = await supabaseRoute();
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr || !auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const profile = await getProfile(auth.user.id);
    const role = clean(profile?.role);
    if (role !== "admin" && role !== "anchor_rep") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const id = clean(body?.id);
    if (!id) return NextResponse.json({ error: "Missing order id." }, { status: 400 });

    // Current state, so we can tell a real phase move from a no-op and record the
    // "from" status in the activity log.
    const { data: current, error: curErr } = await supabaseAdmin
      .from("marketing_orders")
      .select("status,created_by")
      .eq("id", id)
      .maybeSingle();
    if (curErr) return NextResponse.json({ error: curErr.message }, { status: 500 });
    if (!current) return NextResponse.json({ error: "Order not found." }, { status: 404 });
    const fromStatus = clean((current as { status: string | null }).status) || "new";

    // Inside reps may only update orders in their own territory (admins: any).
    if (
      role === "anchor_rep" &&
      !(await insideRepCanAccessOrder(clean(profile?.email), (current as any).created_by))
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const now = new Date().toISOString();
    const updates: Record<string, unknown> = { updated_by: auth.user.id, updated_at: now };

    // A PATCH may change the status and/or the delay details (projected ship date
    // + reason). Each is optional; at least one real change must be present.
    const hasStatus = body?.status !== undefined;
    const hasProjected = body?.projected_ship_date !== undefined;
    const hasDelayNotes = body?.delay_notes !== undefined;

    // The accountability note: what the admin did. Required to move an order to a
    // new phase, so every admin can see who handled what and no two people redo
    // the same work.
    const note = clean(body?.note);

    let status = "";
    if (hasStatus) {
      status = clean(body?.status);
      if (!status || !isMarketingOrderStatus(status)) {
        return NextResponse.json({ error: "Invalid status." }, { status: 400 });
      }
      updates.status = status;
    }

    // A real phase move = status provided and actually different from the current
    // one. That's the action we gate behind a required note.
    const isPhaseMove = hasStatus && status !== fromStatus;
    if (isPhaseMove && !note) {
      return NextResponse.json(
        { error: "Describe what you did before moving this order to a new phase." },
        { status: 400 }
      );
    }

    // Projected ship date: empty clears it; otherwise must be a YYYY-MM-DD date.
    const projectedShipDate = hasProjected ? clean(body?.projected_ship_date) || null : undefined;
    if (projectedShipDate) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(projectedShipDate) || Number.isNaN(Date.parse(projectedShipDate))) {
        return NextResponse.json({ error: "Projected ship date is invalid." }, { status: 400 });
      }
    }
    const delayNotes = hasDelayNotes ? clean(body?.delay_notes) || null : undefined;

    if (hasStatus && status !== "delayed") {
      // Leaving the delayed state clears its details, so stale info never lingers.
      updates.projected_ship_date = null;
      updates.delay_notes = null;
    } else {
      if (hasProjected) updates.projected_ship_date = projectedShipDate;
      if (hasDelayNotes) updates.delay_notes = delayNotes;
    }

    if (!hasStatus && !hasProjected && !hasDelayNotes) {
      return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("marketing_orders")
      .update(updates)
      .eq("id", id)
      .select("id,status,projected_ship_date,delay_notes,updated_at")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data) return NextResponse.json({ error: "Order not found." }, { status: 404 });

    // Log the action so every admin shares one attributed history of the order.
    // A phase move always logs (note is required above). A note with no phase
    // change logs too — that's an admin claiming/commenting on the order.
    let loggedActivity: any = null;
    if (isPhaseMove || note) {
      const { data: act } = await supabaseAdmin
        .from("marketing_order_activity")
        .insert({
          order_id: id,
          admin_id: auth.user.id,
          from_status: isPhaseMove ? fromStatus : (hasStatus ? status : fromStatus),
          to_status: hasStatus ? status : fromStatus,
          note: note || `Moved to ${marketingOrderStatusLabel(status || fromStatus)}.`,
        })
        .select("id,from_status,to_status,note,created_at")
        .single();
      loggedActivity = act
        ? {
            ...act,
            admin_name: clean(profile?.full_name) || null,
            admin_email: clean(profile?.email) || null,
          }
        : null;
    }

    const shortId = String(id).slice(0, 8);

    if (hasStatus) {
      const label = marketingOrderStatusLabel(status);
      const finalProjected = (data as any).projected_ship_date as string | null;
      const finalNotes = (data as any).delay_notes as string | null;

      let detail = `Order ${shortId} is now ${label}.`;
      if (status === "delayed") {
        if (finalProjected) detail += ` Projected ship date: ${finalProjected}.`;
        if (finalNotes) detail += ` Reason: ${finalNotes}`;
      }
      // Carry the admin's "what I did" note so other admins see it without opening
      // the order — the whole point of requiring it.
      if (note) detail += ` — ${clean(profile?.full_name) || "Admin"}: ${note}`;

      // Status-update notifications go to the marketing-order managers, who work
      // in the internal app — pin the link there regardless of sending deployment.
      const orderUrl = internalAppUrl("/admin/marketing-orders");

      void sendPushToTool("marketing_order_status", {
        title: "Marketing order updated",
        body: detail,
        url: "/admin/marketing-orders",
        tag: `mo-status-${id}`,
      });
      void emailToolUsers("marketing_order_status", {
        subject: `Marketing order updated — ${label}`,
        text: `${detail}\n\nView the order: ${orderUrl}`,
        html: renderStatusEmail({
          label,
          status,
          shortId,
          orderUrl,
          projectedShipDate: finalProjected,
          delayNotes: finalNotes,
        }),
      });
    }

    return NextResponse.json({ ok: true, order: data, activity: loggedActivity });
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
