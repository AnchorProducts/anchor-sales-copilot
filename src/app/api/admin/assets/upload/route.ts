import { NextRequest, NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { ingestStorageFile } from "@/lib/knowledge/ingestStorageFile";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Maps the asset category to the filename token that tabFromPath() recognizes
// in ProductTackleBox. The tab grouping reads filenames, not folders, so we
// prefix uploaded files with the category token to guarantee they land on the
// right tab regardless of how the user named the source file.
const CATEGORY_FILENAME_PREFIX: Record<string, string> = {
  spec_document: "spec-",
  data_sheet: "data-sheet-",
  sales_sheet: "sales-sheet-",
  install_sheet: "install-sheet-",
  intake_forms: "intake-",
  test_reports: "test-report-",
  pricebook: "pricebook-",
  approval_letters: "approval-",
  presentation: "presentation-",
  case_studies: "case-study-",
  other: "",
};

function normalizePrefix(p: string) {
  return String(p || "").trim().replace(/^\/+|\/+$/g, "");
}

function sanitizeFilename(name: string) {
  return String(name || "")
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export async function POST(req: NextRequest) {
  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json(
        { error: "Server is missing SUPABASE_SERVICE_ROLE_KEY — admin uploads cannot bypass RLS." },
        { status: 500 }
      );
    }

    const supabase = await supabaseRoute();
    const { data: { user }, error: authErr } = await supabase.auth.getUser();
    if (authErr || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .maybeSingle();

    const role = String((prof as any)?.role || "");
    if (role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const formData = await req.formData();
    const prefix = normalizePrefix(String(formData.get("prefix") || ""));
    const category = String(formData.get("category") || "other").trim();
    const visibility = String(formData.get("visibility") || "public").trim();
    const file = formData.get("file") as File | null;

    if (!prefix) {
      return NextResponse.json({ error: "Missing prefix" }, { status: 400 });
    }
    if (!file) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }

    const categoryPrefix = CATEGORY_FILENAME_PREFIX[category] ?? "";
    const baseName = sanitizeFilename(file.name);
    const alreadyTagged =
      categoryPrefix &&
      baseName.toLowerCase().includes(categoryPrefix.replace(/-$/, ""));
    const finalName = alreadyTagged ? baseName : `${categoryPrefix}${baseName}`;

    const folder = visibility === "internal" ? `${prefix}/internal` : prefix;
    const path = `${folder}/${finalName}`;

    const buffer = Buffer.from(await file.arrayBuffer());

    const { error: uploadErr } = await supabaseAdmin.storage
      .from("knowledge")
      .upload(path, buffer, {
        contentType: file.type || "application/octet-stream",
        upsert: true,
      });

    if (uploadErr) {
      return NextResponse.json({ error: uploadErr.message }, { status: 500 });
    }

    // Fire-and-forget RAG ingestion: extract text, chunk, embed, and persist
    // to knowledge_documents/knowledge_chunks so the chatbot can quote from
    // newly uploaded docs. Non-text files (images, CAD, PDFs, etc.) short-
    // circuit inside the helper — they don't get embedded. Wrapped in
    // try/catch AND .catch so neither a synchronous throw at call-site nor
    // an async rejection can ever fail the upload response.
    try {
      ingestStorageFile({
        path,
        title: finalName,
        category,
        productTags: [],
        createdBy: user.id,
      }).catch((err) => console.warn("[admin/assets/upload] ingestion failed:", err));
    } catch (err) {
      console.warn("[admin/assets/upload] ingestion threw synchronously:", err);
    }

    return NextResponse.json({ path, name: finalName });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Upload failed" }, { status: 500 });
  }
}
