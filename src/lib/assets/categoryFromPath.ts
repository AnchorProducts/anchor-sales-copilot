import { basename, extOf, IMAGE_EXTS } from "@/lib/assets/storagePrefixes";

/* ============================================================================
 * Map a knowledge-bucket path to an `asset_categories.key`.
 *
 * The tackle box has always inferred a display tab from the file path
 * (ProductTackleBox.tabFromPath). This is the same rule set, but resolved to
 * the real category keys stored on `assets.category_key`, so a file indexed
 * into the shared table lands in the category the app already showed it in —
 * and the portal, which reads category_key directly, agrees.
 *
 * Order matters: the first rule that matches wins, most specific first.
 * ==========================================================================*/

export type AssetCategoryKey =
  | "spec_document"
  | "data_sheet"
  | "sales_sheet"
  | "install_guide"
  | "intake_form"
  | "test_reports"
  | "pricebook"
  | "manufacturer_approval_letters"
  | "presentations"
  | "case_studies"
  | "pictures";

export function categoryKeyFromPath(path: string): AssetCategoryKey | null {
  const p = String(path || "").toLowerCase();
  const file = basename(p);

  // Spec — uploaded with a "spec-" filename prefix; /spec/ folder is a fallback.
  if (p.includes("/spec/") || p.startsWith("spec/") || file.includes("spec")) return "spec_document";

  if (
    file === "data-sheet.pdf" ||
    file === "product-data-sheet.pdf" ||
    file.includes("data-sheet") ||
    file.includes("datasheet")
  )
    return "data_sheet";

  if (file === "sales-sheet.pdf" || file.includes("sales-sheet") || file.includes("salessheet"))
    return "sales_sheet";

  if (
    file === "install-manual.pdf" ||
    file === "install-sheet.pdf" ||
    file.includes("install") ||
    file.includes("installation")
  )
    return "install_guide";

  if (p.includes("/intake/") || file.includes("intake")) return "intake_form";

  if (
    p.includes("/test/") ||
    p.includes("/test-reports/") ||
    file.includes("test-report") ||
    file.includes("test_report") ||
    file.includes("uplift") ||
    file.includes("astm") ||
    file.includes("fm-")
  )
    return "test_reports";

  if (
    p.includes("/pricebook/") ||
    file.includes("pricebook") ||
    file.includes("pricing") ||
    file.includes("price-book")
  )
    return "pricebook";

  if (
    p.includes("/approval/") ||
    p.includes("/approvals/") ||
    file.includes("approval") ||
    file.includes("letter")
  )
    return "manufacturer_approval_letters";

  if (
    file.endsWith(".ppt") ||
    file.endsWith(".pptx") ||
    p.includes("/presentation/") ||
    file.includes("presentation")
  )
    return "presentations";

  if (p.includes("/case-studies/") || file.includes("case-study") || file.includes("case_study"))
    return "case_studies";

  if (IMAGE_EXTS.has(extOf(file))) return "pictures";

  return null;
}

/** A readable title from a file path, used when indexing a bucket file that has
 *  no `assets` row to take a title from. */
export function titleFromPath(path: string): string {
  const file = basename(String(path || ""));
  if (!file) return "(untitled)";
  const stem = file.replace(/\.[a-z0-9]+$/i, "");
  const spaced = stem.replace(/[-_]+/g, " ").trim();
  if (!spaced) return file;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}
