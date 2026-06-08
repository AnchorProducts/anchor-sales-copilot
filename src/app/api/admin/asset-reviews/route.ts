import { NextRequest, NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireAdmin() {
  const supabase = await supabaseRoute();
  const { data: auth, error } = await supabase.auth.getUser();
  if (error || !auth?.user) return { error: "Unauthorized", status: 401 as const };

  const { data: prof } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("id", auth.user.id)
    .maybeSingle();

  const role = String((prof as any)?.role || "");
  if (role !== "admin") return { error: "Forbidden", status: 403 as const };

  return { user: auth.user };
}

function slugifyName(input: string) {
  return String(input || "")
    .toLowerCase()
    .trim()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function sanitizeFilename(name: string) {
  return String(name || "")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function GET(req: NextRequest) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });
  }
  const gate = await requireAdmin();
  if ("error" in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const url = new URL(req.url);
  const status = url.searchParams.get("status") || "pending";

  const { data, error } = await supabaseAdmin
    .from("pending_uploads")
    .select(
      "id,product_id,product_name,uploaded_by,uploaded_by_name,uploaded_by_company,uploaded_by_email,filename,storage_path,content_type,size_bytes,note,status,created_at,reviewed_at,approved_path,reject_reason"
    )
    .eq("status", status)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Generate short-lived signed URLs so admin can preview the images. For
  // approved rows the original storage_path was deleted on approval, so sign the
  // live copy at approved_path instead (falling back to storage_path).
  const items = await Promise.all(
    (data || []).map(async (row: any) => {
      // Approved rows have their original storage_path deleted, so sign the live
      // approved_path. If an (older/partial) approved row has no approved_path,
      // return null rather than signing the deleted original (a broken image).
      const previewPath = row.status === "approved" ? row.approved_path : row.storage_path;
      if (!previewPath) return { ...row, preview_url: null };
      const { data: signed } = await supabaseAdmin.storage
        .from("knowledge")
        .createSignedUrl(previewPath, 60 * 10);
      return { ...row, preview_url: signed?.signedUrl || null };
    })
  );

  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Server is missing SUPABASE_SERVICE_ROLE_KEY." }, { status: 500 });
  }
  const gate = await requireAdmin();
  if ("error" in gate) {
    return NextResponse.json({ error: gate.error }, { status: gate.status });
  }

  const body = await req.json().catch(() => ({}));
  const id: string | undefined = body.id;
  const action: "approve" | "reject" | undefined = body.action;
  const reason: string | undefined = body.reason;

  if (!id || !action) {
    return NextResponse.json({ error: "id and action are required" }, { status: 400 });
  }

  const { data: row, error: rowErr } = await supabaseAdmin
    .from("pending_uploads")
    .select("id,product_id,product_name,filename,storage_path,content_type,status")
    .eq("id", id)
    .maybeSingle();

  if (rowErr) return NextResponse.json({ error: rowErr.message }, { status: 500 });
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if ((row as any).status !== "pending") {
    return NextResponse.json({ error: `Already ${(row as any).status}` }, { status: 400 });
  }

  if (action === "reject") {
    // Remove the file and mark rejected.
    await supabaseAdmin.storage.from("knowledge").remove([(row as any).storage_path]);
    const { error: updErr } = await supabaseAdmin
      .from("pending_uploads")
      .update({
        status: "rejected",
        reviewed_by: gate.user.id,
        reviewed_at: new Date().toISOString(),
        reject_reason: reason || null,
      })
      .eq("id", id);
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
    return NextResponse.json({ ok: true, status: "rejected" });
  }

  // approve: copy storage object to the product's live folder, then mark approved.
  const productName = String((row as any).product_name || "");
  const slug = productName ? slugifyName(productName) : (row as any).product_id;
  const safeName = sanitizeFilename((row as any).filename);
  const destination = `solutions/${slug}/${Date.now()}-${safeName}`;

  const { error: copyErr } = await supabaseAdmin.storage
    .from("knowledge")
    .copy((row as any).storage_path, destination);

  if (copyErr) return NextResponse.json({ error: `Copy: ${copyErr.message}` }, { status: 500 });

  // Best-effort: delete the pending file so it doesn't double-list.
  await supabaseAdmin.storage.from("knowledge").remove([(row as any).storage_path]);

  const { error: updErr } = await supabaseAdmin
    .from("pending_uploads")
    .update({
      status: "approved",
      reviewed_by: gate.user.id,
      reviewed_at: new Date().toISOString(),
      approved_path: destination,
    })
    .eq("id", id);

  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, status: "approved", approved_path: destination });
}
