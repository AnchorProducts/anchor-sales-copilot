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

async function sendCommissionEmail(params: {
  repName: string | null;
  repCompany: string | null;
  repPhone: string | null;
  repEmail: string | null;
  estimatedOrderDate: string | null;
  companyPlacingOrder: string;
  orderCity: string | null;
  orderState: string | null;
  uAnchorsOrdered: string | null;
  qty: string | null;
  roofBrand: string | null;
  otherItems: string | null;
  shipToAddress: string | null;
  shipCity: string | null;
  shipState: string | null;
  shipZip: string | null;
  projectDescription: string | null;
  certified: boolean;
  unawareOtherSalesperson: string | null;
  specifierAssisted: string | null;
  claimId: string;
}) {
  const resendKey = clean(process.env.RESEND_API_KEY);
  if (!resendKey) return;

  const resend = new Resend(resendKey);
  const to = clean(process.env.COMMISSION_NOTIFICATIONS_EMAIL || process.env.LEAD_NOTIFICATIONS_FROM || "reports@anchorp.com");
  const from = clean(process.env.LEAD_NOTIFICATIONS_FROM) || "Anchor Co-Pilot <reports@anchorp.com>";

  const lines: string[] = [];
  lines.push(`New Commission Claim Form submitted (ID: ${params.claimId.slice(0, 8)})`);
  lines.push("");
  lines.push(`Rep: ${params.repName || "—"} | ${params.repCompany || "—"} | ${params.repPhone || "—"} | ${params.repEmail || "—"}`);
  lines.push(`Certified: ${params.certified ? "Yes" : "No"}`);
  lines.push(`Unaware of other salesperson: ${params.unawareOtherSalesperson || "—"}`);
  lines.push(`Specifier assisted by separate sales efforts: ${params.specifierAssisted || "—"}`);
  lines.push("");
  lines.push(`Company Placing Order: ${params.companyPlacingOrder}`);
  lines.push(`Estimated Order Date: ${params.estimatedOrderDate || "—"}`);
  lines.push(`Order City/State: ${[params.orderCity, params.orderState].filter(Boolean).join(", ") || "—"}`);
  lines.push(`U-Anchor(s) Ordered: ${params.uAnchorsOrdered || "—"}`);
  lines.push(`Qty: ${params.qty || "—"}`);
  lines.push(`Roof Brand: ${params.roofBrand || "—"}`);
  lines.push(`Other Items: ${params.otherItems || "—"}`);
  lines.push("");
  lines.push(`Ship To: ${params.shipToAddress || "—"}`);
  lines.push(`City/State/Zip: ${[params.shipCity, params.shipState, params.shipZip].filter(Boolean).join(", ") || "—"}`);
  lines.push("");
  lines.push(`Project Description: ${params.projectDescription || "—"}`);

  const subject = `Commission Claim - ${params.companyPlacingOrder} (${params.claimId.slice(0, 8)})`;

  const result = await resend.emails.send({ from, to: [to], subject, text: lines.join("\n") });
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
    if (!profile || profile.role !== "external_rep") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();

    const certified = body.certified === true;
    const unaware_other_salesperson = body.unaware_other_salesperson || null;
    const specifier_assisted = body.specifier_assisted || null;
    const estimated_order_date = clean(body.estimated_order_date) || null;
    const company_placing_order = clean(body.company_placing_order);
    const order_city = clean(body.order_city) || null;
    const order_state = clean(body.order_state) || null;
    const u_anchors_ordered = clean(body.u_anchors_ordered) || null;
    const qty = clean(body.qty) || null;
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
        specifier_assisted,
        estimated_order_date: estimated_order_date || null,
        company_placing_order,
        order_city,
        order_state,
        u_anchors_ordered,
        qty,
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
      return NextResponse.json({ error: "Failed to save claim." }, { status: 500 });
    }

    try {
      await sendCommissionEmail({
        repName: rep_name,
        repCompany: rep_company,
        repPhone: rep_phone,
        repEmail: rep_email,
        estimatedOrderDate: estimated_order_date,
        companyPlacingOrder: company_placing_order,
        orderCity: order_city,
        orderState: order_state,
        uAnchorsOrdered: u_anchors_ordered,
        qty,
        roofBrand: roof_brand,
        otherItems: other_items,
        shipToAddress: ship_to_address,
        shipCity: ship_city,
        shipState: ship_state,
        shipZip: ship_zip,
        projectDescription: project_description,
        certified,
        unawareOtherSalesperson: unaware_other_salesperson,
        specifierAssisted: specifier_assisted,
        claimId: (claim as any).id,
      });
    } catch (emailErr) {
      console.error("commission email error", emailErr);
    }

    return NextResponse.json({ id: (claim as any).id }, { status: 201 });
  } catch (err: any) {
    console.error("commission route error", err);
    return NextResponse.json({ error: "Internal server error." }, { status: 500 });
  }
}
