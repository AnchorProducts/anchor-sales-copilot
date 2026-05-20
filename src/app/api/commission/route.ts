import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { Resend } from "resend";

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

type EmailResult =
  | { status: "sent"; to: string; from: string; messageId: string | null }
  | { status: "skipped"; reason: string }
  | { status: "failed"; reason: string; to: string; from: string };

async function sendCommissionEmail(params: {
  repName: string | null;
  repCompany: string | null;
  repPhone: string | null;
  repEmail: string | null;
  estimatedOrderDate: string | null;
  jobName: string | null;
  companyPlacingOrder: string;
  orderCity: string | null;
  orderState: string | null;
  uAnchorsOrdered: string | null;
  qty: string | null;
  roofType: string | null;
  roofBrand: string | null;
  otherItems: string | null;
  shipToAddress: string | null;
  shipCity: string | null;
  shipState: string | null;
  shipZip: string | null;
  projectDescription: string | null;
  certified: boolean;
  unawareOtherSalesperson: string | null;
  additionalSalespeople: string | null;
  claimId: string;
}): Promise<EmailResult> {
  const resendKey = clean(process.env.RESEND_API_KEY);
  if (!resendKey) {
    return { status: "skipped", reason: "RESEND_API_KEY env var is not set" };
  }

  const resend = new Resend(resendKey);

  // Prefer the recipient from the admin-managed notification_settings table.
  // Fall back to the env var so deployments without a DB row still work.
  let dbRecipient: string | null = null;
  try {
    const { data } = await supabaseAdmin
      .from("notification_settings")
      .select("commission_recipient_email")
      .eq("id", 1)
      .maybeSingle();
    const raw = (data as { commission_recipient_email?: string | null } | null)?.commission_recipient_email;
    if (raw && typeof raw === "string") dbRecipient = raw.trim();
  } catch {
    // Soft-fail to env var if the lookup blows up.
  }

  const to = clean(
    dbRecipient ||
    process.env.COMMISSION_NOTIFICATIONS_EMAIL ||
    process.env.LEAD_NOTIFICATIONS_FROM ||
    "reports@anchorp.com"
  );
  const from = clean(process.env.LEAD_NOTIFICATIONS_FROM) || "Anchor Co-Pilot <reports@anchorp.com>";

  if (!to) {
    return { status: "skipped", reason: "No recipient configured (DB + env both empty)" };
  }

  const lines: string[] = [];
  lines.push(`New Commission Claim Form submitted (ID: ${params.claimId.slice(0, 8)})`);
  lines.push("");
  lines.push(`Rep: ${params.repName || "—"} | ${params.repCompany || "—"} | ${params.repPhone || "—"} | ${params.repEmail || "—"}`);
  lines.push(`Certified: ${params.certified ? "Yes" : "No"}`);
  lines.push(`Unaware of other salesperson: ${params.unawareOtherSalesperson || "—"}`);
  if (params.additionalSalespeople) {
    lines.push(`Additional Salespeople: ${params.additionalSalespeople}`);
  }
  lines.push("");
  lines.push(`Job Name: ${params.jobName || "—"}`);
  lines.push(`Company Placing Order: ${params.companyPlacingOrder}`);
  lines.push(`Estimated Order Date: ${params.estimatedOrderDate || "—"}`);
  lines.push(`Order City/State: ${[params.orderCity, params.orderState].filter(Boolean).join(", ") || "—"}`);
  lines.push(`U-Anchor(s) Ordered: ${params.uAnchorsOrdered || "—"}`);
  lines.push(`Approximate Quantity Ordered: ${params.qty || "—"}`);
  lines.push(`Roof Type: ${params.roofType || "—"}`);
  lines.push(`Roof Brand: ${params.roofBrand || "—"}`);
  lines.push(`Other Items: ${params.otherItems || "—"}`);
  lines.push("");
  lines.push(`Ship To: ${params.shipToAddress || "—"}`);
  lines.push(`City/State/Zip: ${[params.shipCity, params.shipState, params.shipZip].filter(Boolean).join(", ") || "—"}`);
  lines.push("");
  lines.push(`Project Description: ${params.projectDescription || "—"}`);

  const subject = `Commission Claim - ${params.companyPlacingOrder} (${params.claimId.slice(0, 8)})`;

  const result = await resend.emails.send({ from, to: [to], subject, text: lines.join("\n") });
  const maybeError = (result as { error?: { message?: string } | null } | null)?.error;
  if (maybeError) {
    return {
      status: "failed",
      reason: clean(maybeError?.message) || "Resend returned an error",
      to,
      from,
    };
  }
  const messageId = (result as { data?: { id?: string } | null } | null)?.data?.id ?? null;
  return { status: "sent", to, from, messageId };
}

export async function POST(req: Request) {
  try {
    const supabase = await supabaseRoute();
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr || !auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const user = auth.user;
    const profile = await getProfile(user.id);
    if (!profile || profile.role !== "external_rep") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();

    const certified = body.certified === true;
    const unaware_other_salesperson = body.unaware_other_salesperson || null;
    const additional_salespeople = clean(body.additional_salespeople) || null;
    const estimated_order_date = clean(body.estimated_order_date) || null;
    const job_name = clean(body.job_name) || null;
    const company_placing_order = clean(body.company_placing_order);
    const order_city = clean(body.order_city) || null;
    const order_state = clean(body.order_state) || null;
    const u_anchors_ordered = clean(body.u_anchors_ordered) || null;
    const qty = clean(body.qty) || null;
    const roof_type = clean(body.roof_type) || null;
    const roof_brand = clean(body.roof_brand) || null;
    const other_items = clean(body.other_items) || null;
    const ship_to_address = clean(body.ship_to_address) || null;
    const ship_city = clean(body.ship_city) || null;
    const ship_state = clean(body.ship_state) || null;
    const ship_zip = clean(body.ship_zip) || null;
    const project_description = clean(body.project_description) || null;

    if (!company_placing_order) {
      return NextResponse.json({ error: "Company placing order is required." }, { status: 400 });
    }

    const rep_name = clean(profile.full_name) || null;
    const rep_company = clean(profile.company) || null;
    const rep_phone = clean(profile.phone) || null;
    const rep_email = clean(profile.email) || clean(user.email) || null;

    const { data: claim, error: insertErr } = await supabaseAdmin
      .from("commission_claims")
      .insert({
        created_by: user.id,
        rep_name,
        rep_company,
        rep_phone,
        rep_email,
        certified,
        unaware_other_salesperson,
        additional_salespeople,
        estimated_order_date: estimated_order_date || null,
        job_name,
        company_placing_order,
        order_city,
        order_state,
        u_anchors_ordered,
        qty,
        roof_type,
        roof_brand,
        other_items,
        ship_to_address,
        ship_city,
        ship_state,
        ship_zip,
        project_description,
      })
      .select("id")
      .single();

    if (insertErr) {
      console.error("commission insert error", insertErr);
      return NextResponse.json(
        {
          error: "Failed to save claim.",
          // Surface the underlying Postgres message so the admin can diagnose
          // missing-column / RLS issues without digging into server logs.
          details: insertErr.message,
          code: insertErr.code,
          hint: insertErr.hint,
        },
        { status: 500 }
      );
    }

    let emailResult: EmailResult;
    try {
      emailResult = await sendCommissionEmail({
        repName: rep_name,
        repCompany: rep_company,
        repPhone: rep_phone,
        repEmail: rep_email,
        estimatedOrderDate: estimated_order_date,
        jobName: job_name,
        companyPlacingOrder: company_placing_order,
        orderCity: order_city,
        orderState: order_state,
        uAnchorsOrdered: u_anchors_ordered,
        qty,
        roofType: roof_type,
        roofBrand: roof_brand,
        otherItems: other_items,
        shipToAddress: ship_to_address,
        shipCity: ship_city,
        shipState: ship_state,
        shipZip: ship_zip,
        projectDescription: project_description,
        certified,
        unawareOtherSalesperson: unaware_other_salesperson,
        additionalSalespeople: additional_salespeople,
        claimId: (claim as { id: string }).id,
      });
    } catch (emailErr) {
      console.error("commission email error (unexpected throw)", emailErr);
      emailResult = {
        status: "failed",
        reason: emailErr instanceof Error ? emailErr.message : String(emailErr),
        to: "",
        from: "",
      };
    }

    console.log("commission email result", emailResult);

    const emailStatus = emailResult.status;
    const emailError = emailResult.status === "failed" || emailResult.status === "skipped" ? emailResult.reason : null;
    const emailTo = emailResult.status === "sent" || emailResult.status === "failed" ? emailResult.to : null;
    const emailFrom = emailResult.status === "sent" || emailResult.status === "failed" ? emailResult.from : null;

    return NextResponse.json(
      {
        id: (claim as { id: string }).id,
        emailStatus,
        emailError,
        emailTo,
        emailFrom,
      },
      { status: 201 }
    );
  } catch (err: any) {
    console.error("commission route error", err);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
