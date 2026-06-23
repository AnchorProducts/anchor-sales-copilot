import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { Resend } from "resend";
import { internalAppUrl } from "@/lib/appUrl";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const clean = (v: unknown) => String(v ?? "").trim();

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
function notifyRecipients(): string[] {
  const raw =
    clean(process.env.FM_INTAKE_NOTIFICATIONS_EMAIL) ||
    clean(process.env.LEAD_NOTIFICATIONS_FROM) ||
    "reports@anchorp.com";
  return raw
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

async function sendIntakeEmail(opts: {
  id: string;
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
    to: notifyRecipients(),
    subject: `Rooftop Equipment Intake — ${name} (${opts.id.slice(0, 8)})`,
    text: lines.join("\n"),
  });
  const maybeError = (result as any)?.error;
  if (maybeError) throw new Error(clean(maybeError?.message) || "Resend error");
}

// Admin-only: submit a Universal Rooftop Equipment Intake. Multipart body with a
// JSON `payload` field (the full nested form) plus `files` (photos / data sheets).
export async function POST(req: Request) {
  try {
    const supabase = await supabaseRoute();
    const { data: auth } = await supabase.auth.getUser();
    if (!auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if ((await getRole(auth.user.id)) !== "admin") {
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

    const { data: row, error: insErr } = await supabaseAdmin
      .from("fm_intake_submissions")
      .insert({
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
      })
      .select("id")
      .single();
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

    try {
      await sendIntakeEmail({ id, p: payload, equipment, fileCount: files.length });
    } catch (e: any) {
      console.warn("fm intake email failed", e?.message || e);
    }

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
