// src/app/api/marketing-orders/reminders/route.ts
//
// Daily cron: "this order is needed by tomorrow — move it."
//
//   GET /api/marketing-orders/reminders?secret=<CRON_SECRET>
//     → { checked, notified, skipped }
//
// An order carries a needed-by date, and the person it's assigned to is the one
// who has to move it before that date lands. Nothing watched the clock, so an
// order sat where it was until someone scrolled past it and the first anyone
// heard of a missed date was the rep asking where their samples were.
//
// Who gets it: the assignee. An unassigned order goes to the marketing-order
// status channel instead — nobody is on the hook for it, so the alternative is
// that nobody hears at all, which is the failure this exists to prevent.
//
// Each order is reminded ONCE, stamped on marketing_orders.needed_by_reminder_at.
// The window is deliberately "due tomorrow or already past" rather than exactly
// tomorrow: a day the cron doesn't run would otherwise skip those orders
// permanently, and an overdue order is precisely the one worth a nudge. A floor
// of 30 days keeps a first run from dredging up ancient stragglers.
//
// Dates: needed_by is a plain calendar date and this runs on UTC, so "tomorrow"
// is tomorrow's UTC date. Scheduled at 13:00 UTC (9am ET), which puts the nudge
// in someone's morning on the day before it's due.

import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { Resend } from "resend";
import { sendPushToTool, sendPushToUser } from "@/lib/push/send";
import { emailToolUsers } from "@/lib/push/recipients";
import { repAppUrl, internalAppUrl } from "@/lib/appUrl";
import { marketingCategoriesLabel, marketingOrderStatusLabel } from "@/lib/marketingOrders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clean(v: unknown): string {
  return String(v ?? "").trim();
}

// How far back to look. An order two months overdue has been dealt with by other
// means; reminding about it now is noise, not help.
const MAX_OVERDUE_DAYS = 30;

function isoDate(offsetDays: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

// A calendar date as "tomorrow" / "today" / "3 days ago", which is what the
// reader actually needs — the date itself is in the body for the record.
function dueWording(neededBy: string, tomorrow: string, today: string): string {
  if (neededBy === tomorrow) return "tomorrow";
  if (neededBy === today) return "today";
  return "already past";
}

type DueOrder = {
  id: string;
  items: string;
  categories: string[] | null;
  status: string | null;
  needed_by: string;
  assigned_to: string | null;
};

async function emailAssignee(params: {
  to: string;
  order: DueOrder;
  due: string;
  repRole: string | null;
}) {
  const resendKey = clean(process.env.RESEND_API_KEY);
  if (!resendKey) return;

  const resend = new Resend(resendKey);
  const from = clean(process.env.LEAD_NOTIFICATIONS_FROM) || "Anchor Co-Pilot <reports@anchorp.com>";
  const shortId = params.order.id.slice(0, 8);
  const categoryLabel = marketingCategoriesLabel(params.order.categories || []);
  const statusLabel = marketingOrderStatusLabel(params.order.status || "new");
  const orderUrl = repAppUrl("/admin/marketing-orders", params.repRole);

  const lines: string[] = [];
  lines.push(`A marketing order assigned to you is needed ${params.due} (${params.order.needed_by}).`);
  lines.push("");
  lines.push(`Order: #${shortId}`);
  lines.push(`Status: ${statusLabel}`);
  lines.push(`Categories: ${categoryLabel}`);
  lines.push(`Item(s): ${params.order.items}`);
  lines.push("");
  lines.push("If it's moved on, update the order so the rep can see where it stands.");
  lines.push("");
  lines.push(`Open it: ${orderUrl}`);

  const result = await resend.emails.send({
    from,
    to: [params.to],
    subject: `Needed ${params.due} — marketing order #${shortId} (${categoryLabel})`,
    text: lines.join("\n"),
  });
  const maybeError = (result as any)?.error;
  if (maybeError) throw new Error(clean(maybeError?.message) || "Resend error");
}

export async function GET(req: Request) {
  try {
    const secret = clean(process.env.CRON_SECRET);
    if (!secret) return NextResponse.json({ error: "Missing CRON_SECRET" }, { status: 500 });
    const provided = new URL(req.url).searchParams.get("secret") || "";
    if (provided !== secret) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const today = isoDate(0);
    const tomorrow = isoDate(1);
    const floor = isoDate(-MAX_OVERDUE_DAYS);

    // Still-open orders coming due (or overdue) that haven't been reminded on.
    // Fulfilled and cancelled orders are done — there's nothing left to move.
    const { data, error } = await supabaseAdmin
      .from("marketing_orders")
      .select("id,items,categories,status,needed_by,assigned_to")
      .is("needed_by_reminder_at", null)
      .not("needed_by", "is", null)
      .lte("needed_by", tomorrow)
      .gte("needed_by", floor)
      .not("status", "in", '("fulfilled","cancelled")')
      .order("needed_by", { ascending: true })
      .limit(200);

    // 42703 = column does not exist: the run is live before its migration. Say
    // which one, so a red cron log points straight at the fix instead of reading
    // as a broken endpoint.
    if (error) {
      if (error.code === "42703" || /needed_by_reminder_at/.test(error.message || "")) {
        return NextResponse.json(
          { error: "Due-date reminders need migration 20260831_000002 (needed_by_reminder_at)." },
          { status: 503 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const orders = (data || []) as unknown as DueOrder[];
    let notified = 0;
    let unassigned = 0;

    for (const order of orders) {
      const due = dueWording(order.needed_by, tomorrow, today);
      const shortId = order.id.slice(0, 8);
      const categoryLabel = marketingCategoriesLabel(order.categories || []);
      const body = `#${shortId} (${categoryLabel}) is needed ${due} — ${order.needed_by}. Update it if it's moved on.`;

      const assigneeId = clean(order.assigned_to);
      if (assigneeId) {
        const { data: assignee } = await supabaseAdmin
          .from("profiles")
          .select("email,role")
          .eq("id", assigneeId)
          .maybeSingle();

        void sendPushToUser(assigneeId, {
          title: `Marketing order needed ${due}`,
          body,
          url: "/admin/marketing-orders",
          tag: `mo-due-${order.id}`,
        }).catch((e: any) => console.warn("due reminder push failed", e?.message || e));

        const email = clean((assignee as any)?.email);
        if (email) {
          try {
            await emailAssignee({
              to: email,
              order,
              due,
              repRole: clean((assignee as any)?.role) || null,
            });
          } catch (e: any) {
            console.warn("due reminder email failed", e?.message || e);
          }
        }
      } else {
        // Nobody owns it, so the team hears instead of no one.
        unassigned += 1;
        void sendPushToTool("marketing_order_status", {
          title: `Unassigned order needed ${due}`,
          body,
          url: "/admin/marketing-orders",
          tag: `mo-due-${order.id}`,
        });
        void emailToolUsers("marketing_order_status", {
          subject: `Needed ${due} and unassigned — marketing order #${shortId}`,
          text:
            `${body}\n\nNobody is assigned to this one.\n\n` +
            `Open it: ${internalAppUrl("/admin/marketing-orders")}`,
        });
      }

      // Stamp it whether the send succeeded or not: a failed mail is logged, and
      // repeating the same nudge every morning until one lands is worse than
      // missing it once.
      const { error: stampErr } = await supabaseAdmin
        .from("marketing_orders")
        .update({ needed_by_reminder_at: new Date().toISOString() })
        .eq("id", order.id);
      if (stampErr) console.warn("due reminder stamp failed", stampErr.message);

      notified += 1;
    }

    return NextResponse.json({ ok: true, checked: orders.length, notified, unassigned });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Reminder run failed." }, { status: 500 });
  }
}
