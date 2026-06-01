// src/lib/assets/storagePrefixes.ts
//
// Single source of truth for mapping a product (solution / anchor / internal)
// to the knowledge-bucket folder prefixes that hold its files.
//
// Both the tackle box (ProductTackleBox) and the asset library browse page
// (AssetsBrowser, for the per-card file-count badge) import from here so the
// number shown on a card always matches what opens inside the tackle box.
// When you connect a product to a new folder, edit SPECIAL_PREFIXES_BY_NAME
// here and both places update together.

export const GLOBAL_SPEC_PATH = "spec/anchor-products-spec-v1.docx";

export const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "webp", "svg", "gif"]);

export type ProductLike = {
  name: string;
  series?: string | null;
  section?: string | null;
};

export function normalizePrefix(p: string) {
  return String(p || "").trim().replace(/^\/+|\/+$/g, "");
}

export function slugifyName(name: string) {
  return String(name || "")
    .toLowerCase()
    .trim()
    .replace(/&/g, "and")
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export function basename(path: string) {
  const clean = String(path || "").split("?")[0];
  return clean.split("/").pop() || clean;
}

export function extOf(pathOrName: string) {
  const n = basename(pathOrName).toLowerCase();
  const m = n.match(/\.([a-z0-9]+)$/);
  return m ? m[1] : "";
}

// A path with no file extension (or trailing slash) is a folder, not a file.
export function isFolderLike(path: string) {
  const p = String(path || "").trim();
  if (!p) return true;
  if (p.endsWith("/")) return true;
  return !basename(p).includes(".");
}

// Mirrors the /api/knowledge-list server filter: internal/pricebook/test
// content is non-public. (knowledge-list already strips these, so for browse
// counts everything returned is public — this stays for parity / reuse.)
export function visibilityFromPath(path: string): "public" | "internal" {
  const p = String(path || "").toLowerCase();
  if (p.includes("/internal/") || p.startsWith("internal/")) return "internal";
  if (p.includes("/pricebook/") || p.includes("/test/") || p.includes("/test-reports/")) return "internal";
  return "public";
}

/* ---------------------------------------------
   Routing rules
   Exact-name overrides win (best for anchors and any product whose folder
   doesn't match its slug). Otherwise fall back to series roots, then the
   generic section/<slug> layout, then bare-slug fallbacks.
--------------------------------------------- */

export const SPECIAL_PREFIXES_BY_NAME: Record<string, string[]> = {
  // Solutions
  "2-Pipe Snow Fence": ["solutions/snow-retention/2-pipe-snow-fence"],
  "Unitized Snow Fence": ["2pipe/snow-fence", "solutions/snow-retention/unitized-snow-fence"],
  "Existing Mechanical Tie-Down": ["solutions/existing-mechanical-tie-down"],
  "Camera w/ Mounting Plate": ["solutions/camera-mount"],
  "Roof Mount & Wall Mount Light w/o Mounting Plate": ["solutions/light-mount"],
  "Roof-Mounted Elevated Stack Securement": ["solutions/elevated-stack/roof-stack"],
  "Wall-Mounted Elevated Stack Securement": ["solutions/elevated-stack/wall-stack"],
  "Tower/Stack Securement - 2000 Series U-Anchor": ["solutions/elevated-stack/Tower"],
  "Tower Securement, Non Penetrating Base - 2000 Series U-Anchor": ["solutions/elevated-stack/wall-stack"],
  "Roof Mounted Box": ["solutions/roof-box"],
  "Attached Pipe Frame": ["pipe-frame/attached", "solutions/pipe-frame/attached", "attached"],
  "Existing Pipe Frame": ["solutions/pipe-frame/exisiting"],
  "Roof Mounted Guardrail": ["solutions/roof-guardrail"],
  "Wall Mounted Guardrail": ["solutions/wall-guardrail"],
  "Wall Mounted Box": ["solutions/wall-box"],
  "Weather Stations": ["solutions/weather-station"],

  // Anchors
  "U2000 KEE": ["anchor/u-anchors/u2000/kee"],
  "U2000 PVC": ["anchor/u-anchors/u2000/pvc"],
  "U2000 TPO": ["anchor/u-anchors/u2000/tpo"],
  "U2200 Plate": ["anchor/u-anchors/u2200/plate"],
  "U2400 EDPM": ["anchor/u-anchors/u2400/epdm"],
  "U2400 KEE": ["anchor/u-anchors/u2400/kee"],
  "U2400 PVC": ["anchor/u-anchors/u2400/pvc"],
  "U2400 TPO": ["anchor/u-anchors/u2400/tpo"],
  "U2600 APP": ["anchor/u-anchors/u2600/app"],
  "U2600 SBS": ["anchor/u-anchors/u2600/sbs"],
  "U2600 SBS Torch": ["anchor/u-anchors/u2600/sbs-torch"],
  "U2800 Coatings": ["anchor/u-anchors/u2800/coatings"],
  "U3200 Plate": ["anchor/u-anchors/u3200/plate"],
  "U3400 EDPM": ["anchor/u-anchors/u3400/epdm"],
  "U3400 KEE": ["anchor/u-anchors/u3400/kee"],
  "U3400 PVC": ["anchor/u-anchors/u3400/pvc"],
  "U3400 TPO": ["anchor/u-anchors/u3400/tpo"],
  "U3600 APP": ["anchor/u-anchors/u3600/app"],
  "U3600 SBS": ["anchor/u-anchors/u3600/sbs"],
  "U3600 SBS Torch": ["anchor/u-anchors/u3600/sbs-torch"],
  "U3800 Coatings": ["anchor/u-anchors/u3800/coatings"],
};

export const SERIES_ROOTS_BY_SERIES: Record<string, string[]> = {
  // Solutions
  HVAC: ["solutions/hvac"],
  "HVAC Solutions": ["solutions/hvac"],
  "Snow Retention": ["2pipe", "solutions/snow-retention", "solutions/2pipe"],
  "Snow Retention Solutions": ["2pipe", "solutions/snow-retention", "solutions/2pipe"],
  "2 Pipe": ["2pipe", "solutions/snow-retention", "solutions/2pipe"],

  // Anchors
  "U-Anchors": ["anchor/u-anchors"],
  "U Anchors": ["anchor/u-anchors"],
  Anchors: ["anchor"],
};

export function prefixCandidatesForProduct(p: ProductLike): string[] {
  const out: string[] = [];
  const push = (x: string) => {
    const clean = normalizePrefix(x);
    if (clean) out.push(clean);
  };

  // 1) Exact overrides (best for anchors)
  const specials = SPECIAL_PREFIXES_BY_NAME[p.name];
  if (specials?.length) return Array.from(new Set(specials.map(normalizePrefix)));

  const slug = slugifyName(p.name);
  const seriesKey = String(p.series || "").trim();
  const section = String(p.section || "").toLowerCase().trim();

  // 2) Series roots
  const roots = SERIES_ROOTS_BY_SERIES[seriesKey] || [];
  for (const root of roots) {
    push(`${root}/${slug}`);
    push(`${root}/${slug}/${slug}`);
  }

  // 3) Generic layouts
  if (section === "solution" || section === "solutions") {
    push(`solutions/${slug}`);
    push(`solutions/${slug}/${slug}`);
  }

  if (section === "anchor" || section === "anchors") {
    // NOTE: bucket uses "anchor/..." not "anchors/..."
    push(`anchor/${slug}`);
    push(`anchor/${slug}/${slug}`);
  }

  if (section === "internal" || section === "internal_assets") {
    push(`internal/${slug}`);
    push(`internal/${slug}/${slug}`);
  }

  // 4) Extra fallbacks
  push(`${slug}`);
  push(`${slug}/${slug}`);

  return Array.from(new Set(out));
}
