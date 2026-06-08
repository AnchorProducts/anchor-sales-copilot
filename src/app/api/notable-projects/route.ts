import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { Resend } from "resend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function clean(v: any) {
  return String(v || "").trim();
}

function sanitizeFilename(name: string) {
  const base = clean(name).replace(/\s+/g, "-");
  return base.replace(/[^a-zA-Z0-9._-]/g, "");
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

async function sendNotableProjectEmail(params: {
  projectId: string;
  name: string;
  location: string | null;
  description: string | null;
  contact: string | null;
  submitterName: string | null;
  submitterCompany: string | null;
  submitterPhone: string | null;
  submitterEmail: string | null;
  photoCount: number;
}) {
  const resendKey = clean(process.env.RESEND_API_KEY);
  if (!resendKey) return;

  const resend = new Resend(resendKey);
  const to = clean(
    process.env.NOTABLE_PROJECT_NOTIFICATIONS_EMAIL ||
      process.env.LEAD_NOTIFICATIONS_FROM ||
      "reports@anchorp.com"
  );
  const from = clean(process.env.LEAD_NOTIFICATIONS_FROM) || "Anchor Co-Pilot <reports@anchorp.com>";

  const lines: string[] = [];
  lines.push(`New Notable Project submitted (ID: ${params.projectId.slice(0, 8)})`);
  lines.push("");
  lines.push(`Submitter: ${params.submitterName || "—"} | ${params.submitterCompany || "—"} | ${params.submitterPhone || "—"} | ${params.submitterEmail || "—"}`);
  lines.push("");
  lines.push(`Project: ${params.name}`);
  lines.push(`Location: ${params.location || "—"}`);
  lines.push(`Contact: ${params.contact || "—"}`);
  lines.push(`Photos attached: ${params.photoCount}`);
  lines.push("");
  lines.push("Description:");
  lines.push(params.description || "(none)");

  const subject = `Notable Project - ${params.name} (${params.projectId.slice(0, 8)})`;

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
    // Notable projects are open to internal (anchor_rep) + external sales, and
    // admins previewing a sales role. Matches the page-level access gate.
    if (
      !profile ||
      (profile.role !== "external_rep" &&
        profile.role !== "anchor_rep" &&
        profile.role !== "admin")
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const form = await req.formData();
    const name = clean(form.get("name"));
    const location = clean(form.get("location")) || null;
    const description = clean(form.get("description")) || null;
    const contact = clean(form.get("contact")) || null;
    const files = form.getAll("photos").filter((f) => f instanceof File) as File[];

    if (!name) return NextResponse.json({ error: "Project name is required." }, { status: 400 });
    if (!location) return NextResponse.json({ error: "Location is required." }, { status: 400 });
    if (!description) return NextResponse.json({ error: "Description is required." }, { status: 400 });

    const submitter_name = clean(profile.full_name) || null;
    const submitter_company = clean(profile.company) || null;
    const submitter_phone = clean(profile.phone) || null;
    const submitter_email = clean(profile.email) || clean(user.email) || null;

    const { data: row, error: insErr } = await supabaseAdmin
      .from("notable_projects")
      .insert({
        created_by: user.id,
        submitter_name,
        submitter_company,
        submitter_email,
        submitter_phone,
        name,
        location,
        description,
        contact,
        photos: [],
      })
      .select("id")
      .single();

    if (insErr || !row?.id) {
      return NextResponse.json({ error: insErr?.message || "Failed to create project." }, { status: 500 });
    }

    const projectId = row.id as string;

    const uploaded: Array<{
      path: string;
      filename: string;
      contentType: string;
      size: number;
      uploadedAt: string;
    }> = [];

    for (const file of files) {
      const timestamp = Date.now();
      const safeName = sanitizeFilename(file.name || "photo");
      const path = `notable-projects/${projectId}/${timestamp}-${safeName}`;
      const contentType = file.type || "application/octet-stream";
      const buf = Buffer.from(await file.arrayBuffer());

      const { error: upErr } = await supabaseAdmin.storage
        .from("lead-uploads")
        .upload(path, buf, { contentType, upsert: false });

      if (upErr) {
        return NextResponse.json({ error: upErr.message || "Failed to upload photo." }, { status: 500 });
      }

      uploaded.push({
        path,
        filename: file.name || safeName,
        contentType,
        size: file.size || buf.length,
        uploadedAt: new Date().toISOString(),
      });
    }

    if (uploaded.length > 0) {
      const { error: updErr } = await supabaseAdmin
        .from("notable_projects")
        .update({ photos: uploaded, updated_at: new Date().toISOString() })
        .eq("id", projectId);
      if (updErr) {
        return NextResponse.json({ error: updErr.message || "Failed to attach photos." }, { status: 500 });
      }
    }

    try {
      await sendNotableProjectEmail({
        projectId,
        name,
        location,
        description,
        contact,
        submitterName: submitter_name,
        submitterCompany: submitter_company,
        submitterPhone: submitter_phone,
        submitterEmail: submitter_email,
        photoCount: uploaded.length,
      });
    } catch (emailErr: any) {
      console.warn("notable project email failed", emailErr?.message || emailErr);
    }

    return NextResponse.json({ ok: true, id: projectId, photos: uploaded.length }, { status: 201 });
  } catch (e: any) {
    console.error("notable project route error", e);
    return NextResponse.json({ error: e?.message || "Failed to submit project." }, { status: 500 });
  }
}

export async function GET() {
  try {
    const supabase = await supabaseRoute();
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr || !auth?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const profile = await getProfile(auth.user.id);
    const role = clean(profile?.role);
    if (role !== "admin" && role !== "anchor_rep") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { data, error } = await supabaseAdmin
      .from("notable_projects")
      .select("id,name,location,description,contact,photos,submitter_name,submitter_company,submitter_email,submitter_phone,created_at,status")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const items = await Promise.all(
      (data || []).map(async (row: any) => {
        const photos: Array<{ path: string; filename: string; contentType: string; url: string | null }> = [];
        for (const p of (row.photos || []) as Array<any>) {
          const path = clean(p?.path);
          if (!path) continue;
          const { data: signed } = await supabaseAdmin.storage
            .from("lead-uploads")
            .createSignedUrl(path, 60 * 60);
          photos.push({
            path,
            filename: clean(p?.filename) || path.split("/").pop() || "photo",
            contentType: clean(p?.contentType) || "image/jpeg",
            url: signed?.signedUrl || null,
          });
        }
        return { ...row, photos };
      })
    );

    return NextResponse.json({ items });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to load projects." }, { status: 500 });
  }
}
