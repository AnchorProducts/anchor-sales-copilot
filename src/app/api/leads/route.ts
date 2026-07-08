import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { Resend } from "resend";
import { resolveRepsByKind, resolveStatesForUser } from "@/lib/sales/regions";
import { sendPushToTool, sendPushToEmails } from "@/lib/push/send";
import { emailToolUsers } from "@/lib/push/recipients";
import { appUrl } from "@/lib/appUrl";
import { randomUUID } from "crypto";

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

function isMediaContentType(contentType: string) {
  const type = clean(contentType).toLowerCase();
  return type.startsWith("image/") || type.startsWith("video/");
}

// A file the browser has already uploaded straight to Storage via a signed
// upload URL. We only receive its metadata here — never the bytes.
type UploadedFile = {
  path: string;
  filename: string;
  contentType: string;
  size: number;
};

type ParsedSolution = {
  solution_key: string;
  solution_label: string;
  comment: string;
  files: UploadedFile[];
};

function parseSolutionsJson(input: unknown): ParsedSolution[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((s: any) => ({
      solution_key: clean(s?.key ?? s?.solution_key),
      solution_label: clean(s?.label ?? s?.solution_label),
      comment: clean(s?.comment),
      files: Array.isArray(s?.files)
        ? (s.files as any[])
            .map((f) => ({
              path: clean(f?.path),
              filename: clean(f?.filename) || clean(f?.name) || "upload",
              contentType: clean(f?.contentType) || "application/octet-stream",
              size: Number(f?.size) || 0,
            }))
            .filter((f) => f.path)
        : [],
    }))
    .filter((s) => s.solution_key && s.solution_label);
}

// Guard a client-supplied storage path so a caller can only attach files that
// live in the leads upload space (and can't traverse out of it).
function isSafeLeadPath(path: string) {
  return path.startsWith("leads/") && !path.includes("..");
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
  return appUrl(`/dashboard/opportunities/${encodeURIComponent(leadId)}`, req);
}

async function sendInsideSalesLeadEmail(params: {
  req: Request;
  leadId: string;
  toEmail: string;
  toEmails?: string[];
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
  // Silently skip sending if no key is configured. Lets us turn off
  // notifications globally (e.g. while waiting on domain verification)
  // by clearing RESEND_API_KEY in Vercel without breaking submissions.
  if (!resendKey) return;

  const resend = new Resend(resendKey);
  const to = clean(params.toEmail);
  // De-duped recipient list — every internal rep for the state (falls back to
  // the single primary contact when an explicit list isn't supplied).
  const recipients = Array.from(
    new Set((params.toEmails && params.toEmails.length ? params.toEmails : [to]).map((e) => clean(e)).filter(Boolean))
  );
  if (recipients.length === 0) return;

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
    to: recipients,
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
    // Who may submit a REC must match who may OPEN the form (useFormAccess
    // "sales"): internal (anchor_rep) AND external sales, plus admins. Outside
    // reps are configured as anchor_rep, so restricting to external_rep here 403'd
    // them even though the form let them fill it out.
    if (!isExternalRole(role) && !isInternalRole(role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
    }

    // ── Phase 1: mint signed upload URLs ──────────────────────────────────
    // The browser uploads photo/video bytes straight to Supabase Storage using
    // these URLs, then reports the resulting paths back in the create phase.
    // Keeping the bytes off this serverless function sidesteps Vercel's ~4.5MB
    // request-body cap, which a batch of phone photos (or any video) blows past.
    if (clean((body as any).phase) === "sign") {
      const files = Array.isArray((body as any).files) ? (body as any).files : [];
      if (!files.length) {
        return NextResponse.json({ error: "No files provided." }, { status: 400 });
      }
      if (files.length > 60) {
        return NextResponse.json({ error: "Too many files in one submission." }, { status: 400 });
      }
      const uploadId = randomUUID();
      const uploads: Array<{ solutionIndex: number; path: string; token?: string; signedUrl?: string; error?: string }> = [];
      for (const f of files as any[]) {
        const name = clean(f?.name);
        const si = Number.isFinite(Number(f?.solutionIndex)) ? Number(f.solutionIndex) : 0;
        if (!name) {
          uploads.push({ solutionIndex: si, path: "", error: "Missing filename" });
          continue;
        }
        const safe = sanitizeFilename(name) || "upload";
        const path = `leads/${uploadId}/${si}/${Date.now()}-${safe}`;
        const { data, error } = await supabaseAdmin.storage
          .from("lead-uploads")
          .createSignedUploadUrl(path);
        if (error || !data) {
          uploads.push({ solutionIndex: si, path, error: error?.message || "Could not create upload URL" });
          continue;
        }
        uploads.push({ solutionIndex: si, path, token: data.token, signedUrl: data.signedUrl });
      }
      return NextResponse.json({ uploads });
    }

    // ── Phase 2: create the lead from already-uploaded file metadata ──────
    const customer_company = clean((body as any).customer_company);
    const details = clean((body as any).details);
    const project_address = clean((body as any).project_address);
    const city = clean((body as any).city);
    const state = clean((body as any).state);
    const zip = clean((body as any).zip);
    const country = upper((body as any).country);
    const roof_type = clean((body as any).roof_type);
    const roof_brand = clean((body as any).roof_brand);
    const project_timeline = clean((body as any).project_timeline);

    const preferred_contact_method = clean((body as any).preferred_contact_method);

    const submitter_name = clean((body as any).submitter_name) || null;
    const submitter_company = clean((body as any).submitter_company) || null;
    const submitter_phone = clean((body as any).submitter_phone) || null;

    const parsedSolutions = parseSolutionsJson((body as any).solutions);

    if (!customer_company) return NextResponse.json({ error: "Project name is required." }, { status: 400 });
    // details now holds the optional Project Follow Up note; no longer required.
    if (!project_address) return NextResponse.json({ error: "Project address is required." }, { status: 400 });
    if (!city || !state || !zip || !country) {
      return NextResponse.json({ error: "Project city, state, zip, and country are required." }, { status: 400 });
    }
    if (!roof_type) return NextResponse.json({ error: "Roof type is required." }, { status: 400 });
    if (!roof_brand) return NextResponse.json({ error: "Brand is required." }, { status: 400 });
    if (!project_timeline || !PROJECT_TIMELINE_LABELS[project_timeline]) {
      return NextResponse.json({ error: "Valid project timeline is required." }, { status: 400 });
    }
    // Solution type is optional — a REC may be submitted with no solutions.
    // Any solution that IS provided must still include media (checked below).
    for (const solution of parsedSolutions) {
      if (!solution.files.length) {
        return NextResponse.json(
          { error: `Add at least one photo or video for ${solution.solution_label}.` },
          { status: 400 }
        );
      }
      for (const file of solution.files) {
        if (!isMediaContentType(file.contentType)) {
          return NextResponse.json(
            { error: `Only image/video files are allowed for ${solution.solution_label}.` },
            { status: 400 }
          );
        }
        if (!isSafeLeadPath(file.path)) {
          return NextResponse.json(
            { error: `Invalid file reference for ${solution.solution_label}.` },
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
    // Pass the project ZIP so ZIP-split territories resolve to one rep, e.g. a
    // TX lead routes to Daymon (Houston/Gulf) or Robert (rest of TX), not both.
    const { internal: internalReps, external: externalReps } = await resolveRepsByKind(country, state, zip);
    // Notify BOTH the internal (inside) and external (outside) reps configured
    // for the project's state — internal first — deduped by email.
    const notifyReps = [...internalReps, ...externalReps].filter((r) => clean(r.email));
    const notify_emails = Array.from(
      new Set(notifyReps.map((r) => clean(r.email).toLowerCase()).filter(Boolean))
    );
    // Snapshot a primary contact onto the lead row for display/back-compat.
    const primaryExternal = externalReps[0] || null;
    const outside_sales_name = primaryExternal?.name || null;
    const outside_sales_email = primaryExternal?.email || null;
    const inside_sales_name = internalReps[0]?.name || outside_sales_name;
    const inside_sales_email = (internalReps[0]?.email || "").toLowerCase() || outside_sales_email;
    const notification_email = inside_sales_email;
    const notification_name = inside_sales_name;
    const hasAssignment = internalReps.length > 0 || externalReps.length > 0;
    const assignment_note = hasAssignment
      ? [
          internalReps.length > 0
            ? `Inside sales: ${internalReps.map((r) => r.name).filter(Boolean).join(", ")}`
            : null,
          externalReps.length > 0
            ? `Outside sales: ${externalReps.map((r) => r.name).filter(Boolean).join(", ")}`
            : null,
        ]
          .filter(Boolean)
          .join(" | ") || null
      : null;

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
        netsuite_sync_status: "pending",
        netsuite_sync_error: null,
      })
      .select("id")
      .single();

    if (insErr || !leadRow?.id) {
      return NextResponse.json({ error: insErr?.message || "Failed to create opportunity." }, { status: 500 });
    }

    const leadId = leadRow.id as string;

    // Notify assigned users of a new consult — both push and email (fire-and-forget).
    void sendPushToTool("new_consult", {
      title: "New consult submitted",
      body: customer_company || "A new consult was submitted.",
      url: `/dashboard/opportunities/${leadId}`,
      tag: `consult-${leadId}`,
    });
    void emailToolUsers("new_consult", {
      subject: `New consult — ${customer_company || leadId.slice(0, 8)}`,
      text: `A new consult was submitted${customer_company ? ` for ${customer_company}` : ""}.\n\nView: ${buildLeadDashboardUrl(req, leadId)}`,
    });

    // Regional routing: push the internal sales rep(s) for the submitter's state
    // (they already get the email below). Same tag as above so a rep who is also
    // a new_consult assignee sees one notification, not two.
    void sendPushToEmails(notify_emails, {
      title: "New consult in your region",
      body: `${customer_company || "A new consult"} — ${upper(state)}`,
      url: `/dashboard/opportunities/${leadId}`,
      tag: `consult-${leadId}`,
    });

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
      const solutionAttachments: Array<{
        path: string;
        filename: string;
        contentType: string;
        size: number;
        uploadedAt: string;
      }> = [];

      // Bytes were already uploaded to Storage by the browser (signed-URL flow);
      // here we just record the metadata the client reported back.
      for (const file of solution.files) {
        const uploadedAt = new Date().toISOString();
        const attachment = {
          path: file.path,
          filename: file.filename || "upload",
          contentType: file.contentType || "application/octet-stream",
          size: file.size || 0,
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

    // Fire-and-forget NetSuite sync
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (supabaseUrl && serviceKey) {
      void fetch(`${supabaseUrl}/functions/v1/netsuite-lead-sync`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${serviceKey}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({ lead_id: leadId }),
      }).catch((e) => console.warn("NetSuite sync failed", e?.message || e));
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
        to: notify_emails.join(", ") || notification_email,
      };

      try {
        const result = await sendInsideSalesLeadEmail({
          req,
          leadId,
          toEmail: notification_email,
          toEmails: notify_emails,
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

    // anchor_rep is auto-scoped to their assigned states (null = admin,
    // [] = anchor_rep with no states yet, ["TX",…] = scoped).
    let repStates: string[] | null = null;
    if (role === "anchor_rep") {
      repStates = await resolveStatesForUser(auth.user.id);
      if (repStates.length === 0) {
        // Surface a distinct "unassigned" state instead of silently
        // returning an empty list that looks like "no consults yet".
        return NextResponse.json({ leads: [], scopedStates: [] });
      }
    }

    let query = supabaseAdmin
      .from("leads")
      .select("*")
      .order("created_at", { ascending: false });

    if (status && STATUS_SET.has(status)) query = query.eq("status", status);
    if (region && !repStates) {
      query = query.eq("region_code", upper(region));
    } else if (repStates && repStates.length > 0) {
      query = query.in("region_code", repStates);
    }

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ leads: data || [], scopedStates: repStates });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to load opportunities." }, { status: 500 });
  }
}
