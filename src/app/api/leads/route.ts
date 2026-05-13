import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { Resend } from "resend";
import { resolveRegionalAssignment, resolveStatesForUser } from "@/lib/sales/regions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const STATUS_SET = new Set([
  "new",
  "assigned",
  "contacted",
  "qualified",
  "closed_won",
  "closed_lost",
]);

const CONTACT_METHODS = new Set(["email", "phone_call", "phone_text"]);

const CONTACT_METHOD_LABELS: Record<string, string> = {
  email: "Email",
  phone_call: "Phone (call)",
  phone_text: "Phone (text)",
};

const PROJECT_TIMELINE_LABELS: Record<string, string> = {
  immediate: "Immediate",
  "2_4_weeks": "2-4 weeks",
  "2_3_months": "2-3 months",
  "3_6_months": "3-6 months",
  "6_12_months": "6-12 months",
  over_1_year: "Over 1 year",
};

function formatProjectTimeline(value: string | null | undefined): string {
  if (!value) return "—";
  return PROJECT_TIMELINE_LABELS[value] ?? value;
}

function isInternalRole(role: string) {
  return role === "admin" || role === "anchor_rep";
}

function isExternalRole(role: string) {
  return role === "external_rep";
}

function clean(v: any) {
  return String(v || "").trim();
}

function upper(v: any) {
  return clean(v).toUpperCase();
}

function sanitizeFilename(name: string) {
  const base = clean(name).replace(/\s+/g, "-");
  return base.replace(/[^a-zA-Z0-9._-]/g, "");
}

function sanitizePathSegment(input: string) {
  return clean(input)
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function buildLocation(projectAddress: string, city: string, state: string, zip: string, country: string) {
  const parts = [clean(projectAddress), clean(city), upper(state), clean(zip), upper(country)].filter(Boolean);
  return parts.join(", ");
}

function toInt(input: string) {
  const n = Number.parseInt(clean(input), 10);
  return Number.isFinite(n) ? n : null;
}

function deriveRegionCode(country: string, state: string) {
  const c = upper(country);
  const s = upper(state);
  if (c === "US") return s;
  return [c, s || "NA"].filter(Boolean).join(":");
}

function isMediaFile(file: File) {
  const type = clean(file.type).toLowerCase();
  return type.startsWith("image/") || type.startsWith("video/");
}


type ParsedSolution = {
  solution_key: string;
  solution_label: string;
  comment: string;
  files: File[];
};

function parseSolutionSubmissions(form: FormData): ParsedSolution[] {
  const meta = new Map<number, { solution_key: string; solution_label: string; comment: string }>();

  for (const [key, value] of form.entries()) {
    if (typeof value !== "string") continue;
    const match = /^solution_(\d+)_(key|label|comment)$/.exec(key);
    if (!match) continue;

    const idx = Number.parseInt(match[1], 10);
    if (!Number.isFinite(idx)) continue;

    const field = match[2];
    const existing = meta.get(idx) || { solution_key: "", solution_label: "", comment: "" };

    if (field === "key") existing.solution_key = clean(value);
    if (field === "label") existing.solution_label = clean(value);
    if (field === "comment") existing.comment = clean(value);

    meta.set(idx, existing);
  }

  return Array.from(meta.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([idx, m]) => {
      const files = form.getAll(`solution_${idx}_files`).filter((f) => f instanceof File) as File[];
      return {
        solution_key: m.solution_key,
        solution_label: m.solution_label,
        comment: m.comment,
        files,
      };
    })
    .filter((s) => s.solution_key && s.solution_label);
}

async function getRole(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return String((data as any)?.role || "");
}

async function assignRep(regionCode: string) {
  if (!regionCode) return null;
  const { data, error } = await supabaseAdmin
    .from("sales_regions")
    .select("rep_user_id")
    .eq("region_code", regionCode)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as any)?.rep_user_id ?? null;
}

async function findUserIdByEmail(email: string) {
  const normalized = clean(email).toLowerCase();
  if (!normalized) return null;

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("id,email")
    .ilike("email", normalized)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return (data as any)?.id ?? null;
}

function buildLeadDashboardUrl(req: Request, leadId: string) {
  const configuredBase =
    clean(process.env.NEXT_PUBLIC_APP_URL) ||
    clean(process.env.NEXT_PUBLIC_SITE_URL) ||
    clean(process.env.VERCEL_URL);

  const base = configuredBase
    ? configuredBase.startsWith("http")
      ? configuredBase
      : `https://${configuredBase}`
    : new URL(req.url).origin;

  return `${base}/dashboard/opportunities/${encodeURIComponent(leadId)}`;
}

async function sendInsideSalesLeadEmail(params: {
  req: Request;
  leadId: string;
  toEmail: string;
  insideSalesName: string | null;
  outsideSalesName: string | null;
  customerCompany: string;
  details: string;
  locationText: string;
  roofType: string;
  roofBrand: string;
  projectTimeline: string;
  preferredContactMethod: string;
  preferredContactValue: string;
  createdByEmail: string | null;
  submitterName: string | null;
  submitterCompany: string | null;
  submitterPhone: string | null;
  assignmentNote: string | null;
  selectedSolutions: Array<{ label: string; filesCount: number; comment: string | null }>;
}) {
  const resendKey = clean(process.env.RESEND_API_KEY);
  if (!resendKey) throw new Error("RESEND_API_KEY is missing");

  const resend = new Resend(resendKey);
  const to = clean(params.toEmail);
  if (!to) return;

  const from = clean(process.env.LEAD_NOTIFICATIONS_FROM) || "Anchor Co-Pilot <reports@anchorp.com>";
  const contactMethodLabel = CONTACT_METHOD_LABELS[params.preferredContactMethod] || params.preferredContactMethod;

  const dashboardUrl = buildLeadDashboardUrl(params.req, params.leadId);
  const solutionsSummary = params.selectedSolutions
    .map((s) => `- ${s.label}: ${s.filesCount} file(s)${s.comment ? ` | Comment: ${s.comment}` : ""}`)
    .join("\n");

  const subject = `New Opportunity Assigned - ${params.customerCompany} (${params.leadId.slice(0, 8)})`;

  const lines: string[] = [];
  lines.push(`New job opportunity submitted and assigned.`);
  lines.push("");
  lines.push(`Inside Sales: ${params.insideSalesName || "Unspecified"} <${params.toEmail}>`);
  lines.push(`Outside Sales: ${params.outsideSalesName || "Not set"}`);
  if (params.assignmentNote) lines.push(`Assignment Note: ${params.assignmentNote}`);
  lines.push("");
  lines.push(`Customer Company: ${params.customerCompany}`);
  const submitterParts = [params.submitterName, params.submitterCompany, params.submitterPhone, params.createdByEmail].filter(Boolean);
  lines.push(`Submitted By: ${submitterParts.join(" | ") || "Unknown"}`);
  lines.push(`Location: ${params.locationText}`);
  lines.push(`Roof: ${params.roofType} / ${params.roofBrand}`);
  lines.push(`Project Timeline: ${formatProjectTimeline(params.projectTimeline)}`);
  lines.push(`Best Contact: ${contactMethodLabel} - ${params.preferredContactValue}`);
  lines.push("");
  lines.push("Opportunity Details:");
  lines.push(params.details || "(none)");
  lines.push("");
  lines.push("Selected Solutions and Upload Counts:");
  lines.push(solutionsSummary || "- None");
  lines.push("");
  lines.push(`Review Opportunity: ${dashboardUrl}`);

  const result = await resend.emails.send({
    from,
    to: [to],
    subject,
    text: lines.join("\n"),
  });

  const maybeError = (result as any)?.error;
  if (maybeError) {
    throw new Error(clean(maybeError?.message) || "Resend returned an error");
  }

  return { emailId: clean((result as any)?.data?.id) || null };
}

export async function POST(req: Request) {
  try {
    const supabase = await supabaseRoute();
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr || !auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const user = auth.user;
    const role = await getRole(user.id);
    if (!isExternalRole(role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const form = await req.formData();

    const customer_company = clean(form.get("customer_company"));
    const details = clean(form.get("details"));
    const project_address = clean(form.get("project_address"));
    const city = clean(form.get("city"));
    const state = clean(form.get("state"));
    const zip = clean(form.get("zip"));
    const country = upper(form.get("country"));
    const roof_type = clean(form.get("roof_type"));
    const roof_brand = clean(form.get("roof_brand"));
    const project_timeline = clean(form.get("project_timeline"));

    const preferred_contact_method = clean(form.get("preferred_contact_method"));

    const submitter_name = clean(form.get("submitter_name")) || null;
    const submitter_company = clean(form.get("submitter_company")) || null;
    const submitter_phone = clean(form.get("submitter_phone")) || null;

    const parsedSolutions = parseSolutionSubmissions(form);

    // Backward compatibility with existing single "photos" form submissions.
    if (parsedSolutions.length === 0) {
      const legacyFiles = form.getAll("photos").filter((f) => f instanceof File) as File[];
      if (legacyFiles.length > 0) {
        parsedSolutions.push({
          solution_key: "general",
          solution_label: "General",
          comment: "",
          files: legacyFiles,
        });
      }
    }

    if (!customer_company) return NextResponse.json({ error: "Customer company is required." }, { status: 400 });
    if (!details) return NextResponse.json({ error: "Opportunity details are required." }, { status: 400 });
    if (!project_address) return NextResponse.json({ error: "Project address is required." }, { status: 400 });
    if (!city || !state || !zip || !country) {
      return NextResponse.json({ error: "Project city, state, zip, and country are required." }, { status: 400 });
    }
    if (!roof_type) return NextResponse.json({ error: "Roof type is required." }, { status: 400 });
    if (!roof_brand) return NextResponse.json({ error: "Brand is required." }, { status: 400 });
    if (!project_timeline || !PROJECT_TIMELINE_LABELS[project_timeline]) {
      return NextResponse.json({ error: "Valid project timeline is required." }, { status: 400 });
    }
    if (parsedSolutions.length === 0) {
      return NextResponse.json({ error: "Select at least one solution type and add media." }, { status: 400 });
    }

    for (const solution of parsedSolutions) {
      if (!solution.files.length) {
        return NextResponse.json(
          { error: `Add at least one photo or video for ${solution.solution_label}.` },
          { status: 400 }
        );
      }
      for (const file of solution.files) {
        if (!isMediaFile(file)) {
          return NextResponse.json(
            { error: `Only image/video files are allowed for ${solution.solution_label}.` },
            { status: 400 }
          );
        }
      }
    }

    if (!CONTACT_METHODS.has(preferred_contact_method)) {
      return NextResponse.json({ error: "Valid contact method is required." }, { status: 400 });
    }

    const { data: profileRow } = await supabaseAdmin
      .from("profiles")
      .select("email,phone")
      .eq("id", user.id)
      .maybeSingle();

    const profileEmail = clean((profileRow as any)?.email) || clean(user.email || "");
    const profilePhone = clean((profileRow as any)?.phone);

    let preferred_contact_value: string;
    if (preferred_contact_method === "email") {
      if (!profileEmail) {
        return NextResponse.json({ error: "Your profile is missing an email address." }, { status: 400 });
      }
      preferred_contact_value = profileEmail;
    } else {
      if (!profilePhone) {
        return NextResponse.json({ error: "Add a phone number to your profile to use a phone contact method." }, { status: 400 });
      }
      preferred_contact_value = profilePhone;
    }

    const region_code = deriveRegionCode(country, state);
    const location_text = buildLocation(project_address, city, state, zip, country);
    const regionalAssignment = await resolveRegionalAssignment(country, state);
    const assignment_note = regionalAssignment
      ? `Outside sales assignment: ${regionalAssignment.outside_sales_name}`
      : null;
    const outside_sales_name = regionalAssignment?.outside_sales_name || null;
    const outside_sales_email = regionalAssignment?.outside_sales_email || null;
    const notification_email = outside_sales_email;
    const notification_name = outside_sales_name;
    // Legacy leads-table columns are now mirrored from the outside rep.
    const inside_sales_name = outside_sales_name;
    const inside_sales_email = outside_sales_email;

    const { data: leadRow, error: insErr } = await supabaseAdmin
      .from("leads")
      .insert({
        customer_company,
        details,
        project_address,
        location_text,
        region_code,
        state: upper(state),
        country,
        inside_sales_name,
        inside_sales_email,
        outside_sales_name,
        assignment_note,
        roof_type,
        roof_brand,
        project_timeline,
        preferred_contact_method,
        preferred_contact_value,
        created_by: user.id,
        created_by_email: user.email || null,
        submitter_name,
        submitter_company,
        submitter_phone,
        attachments: [],
        solution_requests: [],
        status: "new",
        hubspot_sync_status: "pending",
        hubspot_sync_error: null,
      })
      .select("id")
      .single();

    if (insErr || !leadRow?.id) {
      return NextResponse.json({ error: insErr?.message || "Failed to create opportunity." }, { status: 500 });
    }

    const leadId = leadRow.id as string;
    const flatAttachments: Array<{
      path: string;
      filename: string;
      contentType: string;
      size: number;
      uploadedAt: string;
      solution_key: string;
      solution_label: string;
    }> = [];

    const solutionRequests: Array<{
      solution_key: string;
      solution_label: string;
      comment: string | null;
      attachments: Array<{
        path: string;
        filename: string;
        contentType: string;
        size: number;
        uploadedAt: string;
      }>;
    }> = [];

    for (const solution of parsedSolutions) {
      const solutionSlug = sanitizePathSegment(solution.solution_key) || "solution";
      const solutionAttachments: Array<{
        path: string;
        filename: string;
        contentType: string;
        size: number;
        uploadedAt: string;
      }> = [];

      for (const file of solution.files) {
        const timestamp = Date.now();
        const safeName = sanitizeFilename(file.name || "upload");
        const path = `leads/${leadId}/${solutionSlug}/${timestamp}-${safeName}`;
        const contentType = file.type || "application/octet-stream";
        const buf = Buffer.from(await file.arrayBuffer());

        const { error: upErr } = await supabaseAdmin.storage
          .from("lead-uploads")
          .upload(path, buf, { contentType, upsert: false });

        if (upErr) {
          return NextResponse.json({ error: upErr.message || "Failed to upload file." }, { status: 500 });
        }

        const uploadedAt = new Date().toISOString();
        const attachment = {
          path,
          filename: file.name || safeName,
          contentType,
          size: file.size || buf.length,
          uploadedAt,
        };

        solutionAttachments.push(attachment);
        flatAttachments.push({
          ...attachment,
          solution_key: solution.solution_key,
          solution_label: solution.solution_label,
        });
      }

      solutionRequests.push({
        solution_key: solution.solution_key,
        solution_label: solution.solution_label,
        comment: clean(solution.comment) || null,
        attachments: solutionAttachments,
      });
    }

    let assigned_rep_user_id: string | null = null;
    try {
      if (notification_email) {
        assigned_rep_user_id = await findUserIdByEmail(notification_email);
      }
      if (!assigned_rep_user_id) {
        assigned_rep_user_id = await assignRep(region_code);
      }
    } catch (e: any) {
      console.warn("assignRep failed", e?.message || e);
    }

    const nextStatus = assigned_rep_user_id ? "assigned" : "new";
    if (!STATUS_SET.has(nextStatus)) {
      return NextResponse.json({ error: "Invalid status." }, { status: 500 });
    }

    const { error: updErr } = await supabaseAdmin
      .from("leads")
      .update({
        attachments: flatAttachments,
        solution_requests: solutionRequests,
        assigned_rep_user_id,
        status: nextStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", leadId);

    if (updErr) {
      return NextResponse.json({ error: updErr.message || "Failed to update opportunity." }, { status: 500 });
    }

    // Fire-and-forget HubSpot sync
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (supabaseUrl && serviceKey) {
      void fetch(`${supabaseUrl}/functions/v1/hubspot-lead-sync`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ lead_id: leadId }),
      }).catch((e) => console.warn("HubSpot sync failed", e?.message || e));
    }

    let emailNotification:
      | { attempted: boolean; sent: boolean; emailId: string | null; error: string | null; to: string | null }
      | null = null;

    if (notification_email) {
      emailNotification = {
        attempted: true,
        sent: false,
        emailId: null,
        error: null,
        to: notification_email,
      };

      try {
        const result = await sendInsideSalesLeadEmail({
          req,
          leadId,
          toEmail: notification_email,
          insideSalesName: notification_name,
          outsideSalesName: outside_sales_name,
          customerCompany: customer_company,
          details,
          locationText: location_text,
          roofType: roof_type,
          roofBrand: roof_brand,
          projectTimeline: project_timeline,
          preferredContactMethod: preferred_contact_method,
          preferredContactValue: preferred_contact_value,
          createdByEmail: user.email || null,
          submitterName: submitter_name,
          submitterCompany: submitter_company,
          submitterPhone: submitter_phone,
          assignmentNote: assignment_note,
          selectedSolutions: solutionRequests.map((s) => ({
            label: s.solution_label,
            filesCount: s.attachments.length,
            comment: s.comment,
          })),
        });

        emailNotification.sent = true;
        emailNotification.emailId = result?.emailId || null;
      } catch (e: any) {
        const msg = clean(e?.message) || "Failed to send inside sales email";
        emailNotification.error = msg;
        console.warn("inside sales email failed", msg);
      }
    }

    return NextResponse.json({
      ok: true,
      id: leadId,
      email_notification: emailNotification,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to submit opportunity." }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const supabase = await supabaseRoute();
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr || !auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const role = await getRole(auth.user.id);
    if (!isInternalRole(role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const status = clean(searchParams.get("status"));
    const region = clean(searchParams.get("region"));

    // anchor_rep is auto-scoped to their assigned states. admin sees all.
    let repStates: string[] = [];
    if (role === "anchor_rep") {
      repStates = await resolveStatesForUser(auth.user.id);
      if (repStates.length === 0) {
        // Rep is internal but not assigned any states yet — return empty so
        // they see a clear "ask admin to assign states" empty state.
        return NextResponse.json({ leads: [], scopedStates: [] });
      }
    }

    let query = supabaseAdmin
      .from("leads")
      .select("*")
      .order("created_at", { ascending: false });

    if (status && STATUS_SET.has(status)) query = query.eq("status", status);
    if (region) {
      query = query.eq("region_code", upper(region));
    } else if (repStates.length > 0) {
      query = query.in("region_code", repStates);
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ leads: data || [], scopedStates: repStates });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to load opportunities." }, { status: 500 });
  }
}
