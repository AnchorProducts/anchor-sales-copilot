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

// Categories whose filenames should be fully replaced (not prefixed) so each
// product has exactly one canonical file per sheet type. Combined with the
// `upsert: true` storage upload below, re-uploading replaces the existing one.
// Extension is preserved from the source file.
const CATEGORY_FIXED_BASENAME: Record<string, string> = {
  sales_sheet: "Sales-Sheet",
  data_sheet: "Data-Sheet",
  install_sheet: "Install-Sheet",
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

// asset_categories enforces an FK on assets.category_key, and not every
// long-form key (e.g. "data_sheet") exists in that table. Build a candidate
// list — preferred → short form → "other" — and pick the first one that's
// actually a row in asset_categories.
function categoryKeyCandidates(category: string): string[] {
  switch (category) {
    case "sales_sheet": return ["sales_sheet", "sales", "other"];
    case "data_sheet": return ["data_sheet", "data", "other"];
    case "install_sheet": return ["install_sheet", "install_manual", "install", "other"];
    case "spec_document": return ["spec_document", "spec", "other"];
    case "intake_forms": return ["intake_forms", "intake", "other"];
    case "test_reports": return ["test_reports", "test", "other"];
    case "pricebook": return ["pricebook", "pricing", "other"];
    case "approval_letters": return ["approval_letters", "approval", "other"];
    case "presentation": return ["presentation", "presentations", "other"];
    case "case_studies": return ["case_studies", "case_study", "case", "other"];
    default: return ["other"];
  }
}

async function resolveValidCategoryKey(candidates: string[]): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("asset_categories")
    .select("key")
    .in("key", candidates);
  if (error || !Array.isArray(data)) return null;
  const valid = new Set(data.map((r: any) => String(r.key)));
  for (const c of candidates) if (valid.has(c)) return c;
  return null;
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

    // Two-phase JSON flow. The browser uploads the file bytes straight to
    // Supabase Storage via a signed upload URL ("sign" phase), then calls back
    // so we can record the assets row and kick off ingestion ("commit" phase).
    // Keeping bytes off this serverless function dodges Vercel's ~4.5MB
    // request-body cap that large docs/photos exceed.
    const body = await req.json().catch(() => null);
    const phase = String(body?.phase || "").trim();
    const prefix = normalizePrefix(String(body?.prefix || ""));
    const category = String(body?.category || "other").trim();
    const visibility = String(body?.visibility || "public").trim();

    if (!prefix) {
      return NextResponse.json({ error: "Missing prefix" }, { status: 400 });
    }

    // ── Phase 1: mint a signed upload URL ─────────────────────────────────
    if (phase === "sign") {
      const fileName = String(body?.fileName || "").trim();
      if (!fileName) {
        return NextResponse.json({ error: "Missing file" }, { status: 400 });
      }

      const baseName = sanitizeFilename(fileName);

      let finalName: string;
      const fixedBase = CATEGORY_FIXED_BASENAME[category];
      if (fixedBase) {
        const dot = baseName.lastIndexOf(".");
        const ext = dot > 0 ? baseName.slice(dot) : "";
        finalName = `${fixedBase}${ext}`;
      } else {
        const categoryPrefix = CATEGORY_FILENAME_PREFIX[category] ?? "";
        const alreadyTagged =
          categoryPrefix &&
          baseName.toLowerCase().includes(categoryPrefix.replace(/-$/, ""));
        finalName = alreadyTagged ? baseName : `${categoryPrefix}${baseName}`;
      }

      const folder = visibility === "internal" ? `${prefix}/internal` : prefix;
      const path = `${folder}/${finalName}`;

      const { data, error } = await supabaseAdmin.storage
        .from("knowledge")
        .createSignedUploadUrl(path, { upsert: true });

      if (error || !data) {
        return NextResponse.json(
          { error: error?.message || "Could not create upload URL" },
          { status: 500 }
        );
      }

      return NextResponse.json({
        path,
        name: finalName,
        token: data.token,
        signedUrl: data.signedUrl,
      });
    }

    // ── Phase 2: record the assets row + ingest the uploaded file ─────────
    const productId = String(body?.productId || "").trim() || null;
    const userTitle = String(body?.title || "").trim();
    const assetType = String(body?.type || "document").trim();
    const path = String(body?.path || "").trim();
    const finalName = String(body?.name || "").trim() || (path.split("/").pop() || "");

    if (!path) {
      return NextResponse.json({ error: "Missing path" }, { status: 400 });
    }
    // Guard: the committed path must live under the prefix we'd sign for.
    const folder = visibility === "internal" ? `${prefix}/internal` : prefix;
    if (!path.startsWith(`${folder}/`)) {
      return NextResponse.json({ error: "Invalid storage path" }, { status: 400 });
    }

    // Insert the assets-table row server-side so the FK to asset_categories
    // can be satisfied with a value we *know* exists. Done via supabaseAdmin
    // so RLS doesn't block. Non-fatal: if it fails, the storage file is
    // already in place and the library will still surface it via folder
    // listing.
    let rowResult: { ok: boolean; error?: string; id?: string; category_key?: string } = { ok: false };
    if (productId) {
      const candidates = categoryKeyCandidates(category);
      const resolvedKey = await resolveValidCategoryKey(candidates);
      if (!resolvedKey) {
        rowResult = {
          ok: false,
          error: `No matching asset_categories row. Tried: ${candidates.join(", ")}`,
        };
      } else {
        const { data: ins, error: insErr } = await supabaseAdmin
          .from("assets")
          .insert({
            product_id: productId,
            title: userTitle || finalName,
            type: assetType,
            category_key: resolvedKey,
            path,
            visibility,
          })
          .select("id")
          .single();
        if (insErr) {
          console.error("[admin/assets/upload] assets row insert failed:", insErr);
          rowResult = { ok: false, error: insErr.message };
        } else {
          rowResult = { ok: true, id: ins?.id, category_key: resolvedKey };
        }
      }
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

    return NextResponse.json({
      path,
      name: finalName,
      row: rowResult,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Upload failed" }, { status: 500 });
  }
}
