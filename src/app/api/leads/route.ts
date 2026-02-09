import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

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

function buildLocation(city: string, state: string, zip: string) {
  const c = clean(city);
  const s = upper(state);
  const z = clean(zip);
  return `${c}, ${s} ${z}`.trim();
}

function parsePreferredTimes(input: string) {
  const lines = String(input || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  return lines.length ? lines : null;
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
    const city = clean(form.get("city"));
    const state = clean(form.get("state"));
    const zip = clean(form.get("zip"));
    const wants_video_call = String(form.get("wants_video_call")) === "true";
    const preferred_times_raw = clean(form.get("preferred_times"));
    const preferred_times = wants_video_call ? parsePreferredTimes(preferred_times_raw) : null;
    const video_call_phone = clean(form.get("video_call_phone"));

    const files = form.getAll("photos").filter((f) => f instanceof File) as File[];

    if (!customer_company) return NextResponse.json({ error: "Customer company is required." }, { status: 400 });
    if (!details) return NextResponse.json({ error: "Lead details are required." }, { status: 400 });
    if (!city || !state || !zip) return NextResponse.json({ error: "City, state, and zip are required." }, { status: 400 });
    if (!files.length) return NextResponse.json({ error: "At least one photo is required." }, { status: 400 });
    if (wants_video_call && !video_call_phone) {
      return NextResponse.json({ error: "Phone number is required for video call requests." }, { status: 400 });
    }

    const region_code = upper(state);
    const location_text = buildLocation(city, state, zip);

    const { data: leadRow, error: insErr } = await supabaseAdmin
      .from("leads")
      .insert({
        customer_company,
        details,
        location_text,
        region_code,
        created_by: user.id,
        created_by_email: user.email || null,
        attachments: [],
        status: "new",
        wants_video_call,
        preferred_times,
        video_call_phone: wants_video_call ? video_call_phone : null,
        hubspot_sync_status: "pending",
        hubspot_sync_error: null,
      })
      .select("id")
      .single();

    if (insErr || !leadRow?.id) {
      return NextResponse.json({ error: insErr?.message || "Failed to create lead." }, { status: 500 });
    }

    const leadId = leadRow.id as string;
    const attachments: Array<{
      path: string;
      filename: string;
      contentType: string;
      size: number;
      uploadedAt: string;
    }> = [];

    for (const file of files) {
      const timestamp = Date.now();
      const safeName = sanitizeFilename(file.name || "upload");
      const path = `leads/${leadId}/${timestamp}-${safeName}`;
      const contentType = file.type || "application/octet-stream";
      const buf = Buffer.from(await file.arrayBuffer());

      const { error: upErr } = await supabaseAdmin.storage
        .from("lead-uploads")
        .upload(path, buf, { contentType, upsert: false });

      if (upErr) {
        return NextResponse.json({ error: upErr.message || "Failed to upload file." }, { status: 500 });
      }

      attachments.push({
        path,
        filename: file.name || safeName,
        contentType,
        size: file.size || buf.length,
        uploadedAt: new Date().toISOString(),
      });
    }

    let assigned_rep_user_id: string | null = null;
    try {
      assigned_rep_user_id = await assignRep(region_code);
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
        attachments,
        assigned_rep_user_id,
        status: nextStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", leadId);

    if (updErr) {
      return NextResponse.json({ error: updErr.message || "Failed to update lead." }, { status: 500 });
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

    return NextResponse.json({ ok: true, id: leadId });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to submit lead." }, { status: 500 });
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

    let query = supabaseAdmin
      .from("leads")
      .select("*")
      .order("created_at", { ascending: false });

    if (status && STATUS_SET.has(status)) query = query.eq("status", status);
    if (region) query = query.eq("region_code", upper(region));

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ leads: data || [] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Failed to load leads." }, { status: 500 });
  }
}
