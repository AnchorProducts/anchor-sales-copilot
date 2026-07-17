import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { Resend } from "resend";
import { internalAppUrl } from "@/lib/appUrl";
import { sendPushToTool } from "@/lib/push/send";
import { getToolRecipientEmails, mergeEmails } from "@/lib/push/recipients";
import { resolveStatesForUser } from "@/lib/sales/regions";
import { deriveUsState } from "@/lib/sales/deriveState";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const clean = (v: unknown) => String(v ?? "").trim();

// Who may SUBMIT a project intake / quote request: internal + external sales,
// plus admins (who can also submit from the back-office "New intake" tab).
// Reviewing (GET list + PATCH decision) stays admin-only below.
const SUBMIT_ROLES = new Set(["admin", "anchor_rep", "external_rep"]);

// Photos + product data sheets for an intake. Bytes live in the private
// "knowledge" bucket under fm-intake/<id>/; metadata is stored on the row.
const BUCKET = "knowledge";
const MAX_FILES = 25;
const MAX_BYTES = 20 * 1024 * 1024; // 20 MB each (data sheets can be large)
const ALLOWED = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
  "image/heic",
  "application/pdf",
]);

type IntakeAttachment = { path: string; filename: string; content_type: string; size: number };

async function getRole(userId: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  return clean((data as { role?: string } | null)?.role);
}

async function uploadFiles(
  id: string,
  files: File[]
): Promise<{ attachments: IntakeAttachment[]; error?: string }> {
  const attachments: IntakeAttachment[] = [];
  for (const file of files.slice(0, MAX_FILES)) {
    const ct = (file.type || "").toLowerCase();
    if (!ALLOWED.has(ct)) return { attachments, error: `Unsupported file type: ${file.name}` };
    if (file.size > MAX_BYTES) return { attachments, error: `${file.name} is too large (max 20 MB).` };
    const safeName = (file.name || "file").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80) || "file";
    const path = `fm-intake/${id}/${crypto.randomUUID()}-${safeName}`;
    const buf = Buffer.from(await file.arrayBuffer());
    const { error } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, buf, { contentType: ct, upsert: false });
    if (error) return { attachments, error: error.message };
    attachments.push({ path, filename: safeName, content_type: ct, size: file.size });
  }
  return { attachments };
}

// Recipients for the intake notification: a configured address, falling back so a
// submission never goes nowhere.
// Recipients = the fm_intake tool's assigned users + raw emails, with an env
// fallback so a submission never goes nowhere.
async function resolveFmRecipients(): Promise<string[]> {
  const configured = await getToolRecipientEmails("fm_intake");
  if (configured.length > 0) return configured;
  return mergeEmails(
    process.env.FM_INTAKE_NOTIFICATIONS_EMAIL ||
      process.env.LEAD_NOTIFICATIONS_FROM ||
      "reports@anchorp.com"
  );
}

async function sendIntakeEmail(opts: {
  id: string;
  to: string[];
  p: Record<string, any>;
  equipment: string[];
  fileCount: number;
}) {
  const resendKey = clean(process.env.RESEND_API_KEY);
  if (!resendKey) return;
  const resend = new Resend(resendKey);
  const from = clean(process.env.LEAD_NOTIFICATIONS_FROM) || "Anchor Co-Pilot <reports@anchorp.com>";
  const c = opts.p.customer || {};
  const name = [clean(c.firstName), clean(c.lastName)].filter(Boolean).join(" ") || "—";

  const lines: string[] = [];
  lines.push(`New Rooftop Equipment Intake (FM Form) — ID ${opts.id.slice(0, 8)}`);
  lines.push("");
  lines.push(`Customer: ${name}${clean(c.companyName) ? ` (${clean(c.companyName)})` : ""}`);
  lines.push(`Contact: ${clean(c.email) || "—"} | ${clean(c.phone) || "—"}`);
  lines.push(`Project: ${clean(c.projectName) || "—"}`);
  lines.push(`Address: ${clean(c.projectAddress) || "—"}`);
  lines.push(`Equipment scope: ${opts.equipment.length ? opts.equipment.join(", ") : "—"}`);
  lines.push(`Attachments: ${opts.fileCount}`);
  lines.push("");
  lines.push(`Review the submission: ${internalAppUrl("/admin/fm-intake")}`);

  const result = await resend.emails.send({
    from,
    to: opts.to,
    subject: `Rooftop Equipment Intake — ${name} (${opts.id.slice(0, 8)})`,
    text: lines.join("\n"),
  });
  const maybeError = (result as any)?.error;
  if (maybeError) throw new Error(clean(maybeError?.message) || "Resend error");
}

// Submit a Project Intake / quote request. Open to internal + external sales
// (and admins). Multipart body with a JSON `payload` field (the full nested
// form) plus `files` (photos / data sheets).
export async function POST(req: Request) {
  try {
    const supabase = await supabaseRoute();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!SUBMIT_ROLES.has(await getRole(auth.user.id))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const form = await req.formData();
    let payload: Record<string, any>;
    try {
      payload = JSON.parse(clean(form.get("payload")) || "{}");
    } catch {
      return NextResponse.json({ error: "Invalid form payload." }, { status: 400 });
    }
    const files = form.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);

    const customer = payload.customer || {};
    if (!clean(customer.firstName) || !clean(customer.lastName)) {
      return NextResponse.json({ error: "First and last name are required." }, { status: 400 });
    }
    if (!clean(customer.email) && !clean(customer.phone)) {
      return NextResponse.json({ error: "An email or phone number is required." }, { status: 400 });
    }

    const equipment: string[] = Array.isArray(payload.equipment)
      ? payload.equipment.map((e: unknown) => clean(e)).filter(Boolean)
      : [];

    // Territory routing: derive the US state from the project address (+ optional
    // lat/long) so internal reps see the intake in their region's Active Consults
    // queue. Best-effort — an undetermined state leaves the row admin-only.
    let state: string | null = null;
    try {
      state = await deriveUsState(clean(customer.projectAddress), clean(customer.latLong));
    } catch (e: any) {
      console.warn("fm intake state derivation failed", e?.message || e);
    }

    const baseRow: Record<string, unknown> = {
      created_by: auth.user.id,
      first_name: clean(customer.firstName) || null,
      last_name: clean(customer.lastName) || null,
      email: clean(customer.email) || null,
      phone: clean(customer.phone) || null,
      company_name: clean(customer.companyName) || null,
      project_name: clean(customer.projectName) || null,
      project_address: clean(customer.projectAddress) || null,
      equipment,
      payload,
    };

    // Insert with the territory columns; if the migration hasn't been applied yet
    // (state/region_code missing), retry without them so a customer's quote
    // request never fails — it just stays unscoped until the migration lands.
    let row: { id?: string } | null = null;
    let insErr: { message?: string } | null = null;
    {
      const res = await supabaseAdmin
        .from("fm_intake_submissions")
        .insert({ ...baseRow, state, region_code: state })
        .select("id")
        .single();
      row = res.data;
      insErr = res.error;
      if (insErr && /region_code|['"]?state['"]?\s+column|could not find/i.test(insErr.message || "")) {
        console.warn("fm_intake state columns missing — inserting unscoped. Apply migration 20260717_000001.");
        const retry = await supabaseAdmin
          .from("fm_intake_submissions")
          .insert(baseRow)
          .select("id")
          .single();
        row = retry.data;
        insErr = retry.error;
      }
    }
    if (insErr || !row?.id) {
      return NextResponse.json({ error: insErr?.message || "Failed to save intake." }, { status: 500 });
    }
    const id = row.id as string;

    if (files.length > 0) {
      const { attachments, error: upErr } = await uploadFiles(id, files);
      if (attachments.length > 0) {
        await supabaseAdmin.from("fm_intake_submissions").update({ attachments }).eq("id", id);
      }
      if (upErr) {
        // Keep the submission; surface the upload problem so the admin can retry files.
        return NextResponse.json({ ok: true, id, attachment_error: upErr });
      }
    }

    const who =
      [clean(customer.firstName), clean(customer.lastName)].filter(Boolean).join(" ") ||
      clean(customer.companyName) ||
      "a customer";

    try {
      const to = await resolveFmRecipients();
      await sendIntakeEmail({ id, to, p: payload, equipment, fileCount: files.length });
    } catch (e: any) {
      console.warn("fm intake email failed", e?.message || e);
    }

    void sendPushToTool("fm_intake", {
      title: "New rooftop equipment intake",
      body: `${who}${equipment.length ? ` — ${equipment.join(", ")}` : ""}`,
      url: "/admin/fm-intake",
      tag: `fm-${id}`,
    });

    return NextResponse.json({ ok: true, id });
  } catch (e: any) {
    if (e?.message?.includes("Body exceeded") || e?.name === "PayloadTooLargeError") {
      return NextResponse.json(
        { error: "Upload too large. Remove a few photos/files and try again." },
        { status: 413 }
      );
    }
    console.error("fm intake route error", e);
    return NextResponse.json({ error: e?.message || "Failed to submit intake." }, { status: 500 });
  }
}

// Submissions list. Admin sees everything; an internal (anchor_rep) sees only
// the intakes in their assigned states — the same territory scoping REC consults
// use — so this list can be folded into the internal Active Consults queue.
export async function GET(req: Request) {
  try {
    const supabase = await supabaseRoute();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const role = await getRole(auth.user.id);
    if (role !== "admin" && role !== "anchor_rep") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // anchor_rep is auto-scoped to their assigned states (null = admin/no scope,
    // [] = anchor_rep with no states yet, ["TX",…] = scoped by region_code).
    let repStates: string[] | null = null;
    if (role === "anchor_rep") {
      repStates = await resolveStatesForUser(auth.user.id);
      if (repStates.length === 0) {
        return NextResponse.json({ items: [], scopedStates: [] });
      }
    }

    const region = clean(new URL(req.url).searchParams.get("region")).toUpperCase();
    const BASE_COLS =
      "id,first_name,last_name,email,phone,company_name,project_name,project_address,equipment,attachments,status,review_notes,reviewed_by,reviewed_at,created_at";

    const runList = async (withState: boolean) => {
      let q = supabaseAdmin
        .from("fm_intake_submissions")
        .select(withState ? `${BASE_COLS},state,region_code` : BASE_COLS)
        .order("created_at", { ascending: false })
        .limit(500);
      if (withState) {
        // Admin may narrow by region via ?region=XX; scoped reps are always filtered.
        if (repStates && repStates.length > 0) q = q.in("region_code", repStates);
        else if (region) q = q.eq("region_code", region);
      }
      return q;
    };

    let { data, error } = await runList(true);
    // Migration 20260717_000001 not applied yet? Fall back to the un-scoped list
    // so admins still see submissions. A scoped rep can't be filtered without the
    // column, so they get an empty list until the migration lands.
    if (error && /region_code|['"]?state['"]?\s+column|could not find/i.test(error.message || "")) {
      console.warn("fm_intake state columns missing — listing unscoped. Apply migration 20260717_000001.");
      if (repStates) return NextResponse.json({ items: [], scopedStates: repStates });
      ({ data, error } = await runList(false));
    }
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const rows = (data || []) as any[];
    const reviewerIds = Array.from(new Set(rows.map((r) => r.reviewed_by).filter(Boolean)));
    const names = new Map<string, string>();
    if (reviewerIds.length) {
      const { data: people } = await supabaseAdmin
        .from("profiles")
        .select("id,full_name,email")
        .in("id", reviewerIds);
      for (const p of (people || []) as any[]) {
        names.set(p.id, clean(p.full_name) || clean(p.email) || "");
      }
    }

    const items = rows.map((r) => ({
      id: r.id,
      first_name: r.first_name,
      last_name: r.last_name,
      email: r.email,
      phone: r.phone,
      company_name: r.company_name,
      project_name: r.project_name,
      project_address: r.project_address,
      state: r.state || null,
      region_code: r.region_code || null,
      equipment: r.equipment || [],
      attachment_count: Array.isArray(r.attachments) ? r.attachments.length : 0,
      status: r.status || "new",
      review_notes: r.review_notes || null,
      reviewed_by_name: r.reviewed_by ? names.get(r.reviewed_by) || null : null,
      reviewed_at: r.reviewed_at,
      created_at: r.created_at,
    }));

    return NextResponse.json({ items, scopedStates: repStates });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to load submissions." }, { status: 500 });
  }
}
