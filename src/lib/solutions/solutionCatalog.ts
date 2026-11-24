// Categorized solution catalog — single source of truth for what the
// Asset Library, Lead Form, Commission Form, and chatbot display.
//
// Items flagged `comingSoon: true` are shown grayed-out / non-clickable in
// the UI, and the chatbot replies with high-level "coming soon" info only.

export type SolutionCategoryKey =
  | "solar"
  | "snow"
  | "mep"
  | "safety"
  | "communications"
  | "accessories";

export type CatalogSolution = {
  key: string;
  label: string;
  category: SolutionCategoryKey;
  comingSoon?: boolean;

  // Previous-system mapping (so existing tackle boxes / docs surface for
  // launched solutions that were renamed under the new CEO catalog).
  legacyName?: string;    // matches public.products.name (case-insensitive)
  legacyFolder?: string;  // canonical storageFolder for chatbot doc retrieval
};

export type SolutionCategory = {
  key: SolutionCategoryKey;
  label: string;
};

// Mirrors anchorp.com's solutions catalog (site_catalog_group / site_catalog_item,
// kind = 'solution', in the shared Supabase project): same groups, same order,
// same names, and the same knowledge-bucket folders the website reads
// (anchorp-website src/lib/literatureLinks.ts SOLUTION_PREFIXES). Category keys
// are the website's group slugs and item keys its item slugs.
//
// Where one website page covers several tackle boxes here, the boxes stay
// separate: the five Pipe Support Securement boxes each hold their own data
// sheet, install sheet and fab sheet under identical file names, so merging
// them into one box would list five indistinguishable "Data Sheet"s.
//
// `legacyName` is the shared `products.name` that backs the card when it
// differs from the label (the website renamed some rows, not others).
// `legacyFolder` is the folder the website reads for that page.
export const SOLUTION_CATEGORIES: SolutionCategory[] = [
  { key: "solar", label: "Solar Solutions" },
  { key: "snow", label: "Snow Retention" },
  { key: "mep", label: "Mechanical, Electrical & Plumbing" },
  { key: "safety", label: "Safety, Access & Egress" },
  { key: "communications", label: "Communications" },
  { key: "accessories", label: "Rooftop Accessories" },
];

export const SOLUTION_CATALOG: CatalogSolution[] = [
  // Solar Solutions
  { key: "solar", label: "Solar Securement", category: "solar", comingSoon: true, legacyFolder: "solutions/rooftop-solar" },

  // Snow Retention
  { key: "snow", label: "Snow Retention", category: "snow", legacyName: "2 Pipe Snow Retention", legacyFolder: "solutions/snow-retention-system" },

  // Mechanical, Electrical & Plumbing
  { key: "roof-mounted-h-frame", label: "Roof Mounted H-Frame", category: "mep", legacyFolder: "solutions/pipe-frame/attached" },
  { key: "existing-mechanical-tie-down", label: "Existing Mechanical Tie Down", category: "mep", legacyName: "Existing Mechanical Tie-Down", legacyFolder: "solutions/existing-mechanical-tie-down" },
  { key: "duct-frame", label: "Duct Frame", category: "mep", legacyFolder: "solutions/duct-securement" },
  { key: "large-electrical-box-frame", label: "Large Electrical Box Frame", category: "mep", legacyName: "Large Electrical Box Frame - w/ 3000 Series U-Anchor", legacyFolder: "solutions/large-electrical-box-frame-w-3000-series-u-anchor" },
  { key: "medium-electrical-box-frame", label: "Medium Electrical Box Frame", category: "mep", legacyName: "Medium Electrical Box Frame - w/ 3000 Series U-Anchor", legacyFolder: "solutions/medium-electrical-box-frame-w-3000-series-u-anchor" },
  // Pipe Support Securement (one page on the website)
  { key: "pss-0300-12in-base", label: "PSS 0300 - Pipe Securement - 12\" Base", category: "mep", legacyFolder: "solutions/pss-0300-pipe-securement-12-base" },
  { key: "pss-0305-6in-base", label: "PSS 0305 - Pipe Securement - 6\" Base", category: "mep", legacyFolder: "solutions/pss-0305-pipe-securement-6-base" },
  { key: "pss-0310-strut-assembly", label: "PSS 0310 - Pipe Support Securement - Strut Assembly", category: "mep", legacyFolder: "solutions/pss-0310-pipe-support-securement-strut-assembly" },
  { key: "pss-0320-roller-assembly", label: "PSS 0320 - Pipe Support Securement - Roller Assembly", category: "mep", legacyFolder: "solutions/pss-0320-pipe-support-securement-roller-assembly" },
  { key: "pipe-securement-utility-corridor", label: "Pipe Securement - Utility Corridor", category: "mep", legacyFolder: "solutions/pipe-securement-utility-corridor" },
  { key: "small-electrical-box-frame", label: "Small Electrical Box Frame", category: "mep", legacyName: "Small Electrical Box Frame - w/ 3000 Series U-Anchor", legacyFolder: "solutions/small-electrical-box-frame-w-3000-series-u-anchor" },
  { key: "wall-electrical-box", label: "Wall Mounted Electrical Box", category: "mep", legacyName: "Wall Mounted Box", legacyFolder: "solutions/wall-box" },
  { key: "wall-tower-stack", label: "Wall Mounted Tower/Stack Securement", category: "mep", legacyName: "Wall-Mounted Elevated Stack Securement", legacyFolder: "solutions/elevated-stack/wall-stack" },
  { key: "roof-tower-stack", label: "Roof Mounted Tower/Stack Securement", category: "mep", legacyName: "Tower/Stack Securement - 2000 Series U-Anchor", legacyFolder: "solutions/elevated-stack/Tower" },
  { key: "mechanical-support", label: "Mechanical Support", category: "mep", legacyName: "Mechanical Support - U-Anchor", legacyFolder: "solutions/mechanical-support-u-anchor" },
  { key: "existing-h-frame", label: "Existing H-Frame", category: "mep", legacyFolder: "solutions/pipe-frame/exisiting" },

  // Safety, Access & Egress
  { key: "roof-mounted-guardrail", label: "Roof Mounted Guardrail", category: "safety", legacyFolder: "solutions/roof-guardrail" },
  { key: "wall-guardrail", label: "Wall Mounted Guardrail", category: "safety", legacyFolder: "solutions/wall-guardrail" },
  { key: "crossover-stair", label: "Crossover & Stair Securements", category: "safety", legacyFolder: "solutions/roof-stairs-walkways" },
  { key: "roof-ladder", label: "Roof Ladder", category: "safety", legacyFolder: "solutions/roof-ladder" },

  // Communications
  { key: "satellite-mount", label: "Satellite Dish Mount", category: "communications", legacyName: "Satellite Dish", legacyFolder: "solutions/satellite-dish" },
  { key: "weather-station", label: "Weather Station", category: "communications", legacyName: "Weather Stations", legacyFolder: "solutions/weather-station" },

  // Rooftop Accessories
  { key: "equipment-screen", label: "Equipment Screen", category: "accessories", legacyName: "6' U-Screen Support Frame - Metal Panel & Louver", legacyFolder: "solutions/6-u-screen-support-frame-metal-panel-and-louver" },
  { key: "camera-mount", label: "Camera & Light Mount", category: "accessories", legacyName: "Roof Mount & Wall Mount Light w/o Mounting Plate", legacyFolder: "solutions/light-mount" },
  { key: "guy-wire-kit", label: "Guy Wire Kit", category: "accessories", legacyFolder: "solutions/guy-wire-kit" },
];

export function getCategoryLabel(key: SolutionCategoryKey): string {
  return SOLUTION_CATEGORIES.find((c) => c.key === key)?.label ?? key;
}

export function getSolutionByKey(key: string): CatalogSolution | undefined {
  return SOLUTION_CATALOG.find((s) => s.key === key);
}

export function getSolutionByLabel(label: string): CatalogSolution | undefined {
  const norm = label.trim().toLowerCase();
  return SOLUTION_CATALOG.find((s) => s.label.toLowerCase() === norm);
}

export function getComingSoonSolutions(): CatalogSolution[] {
  return SOLUTION_CATALOG.filter((s) => s.comingSoon);
}

export function getSolutionsByCategory(category: SolutionCategoryKey): CatalogSolution[] {
  return SOLUTION_CATALOG.filter((s) => s.category === category);
}

export function groupSolutionsByCategory(
  solutions: CatalogSolution[] = SOLUTION_CATALOG
): Array<{ category: SolutionCategory; items: CatalogSolution[] }> {
  return SOLUTION_CATEGORIES.map((category) => ({
    category,
    items: solutions.filter((s) => s.category === category.key),
  })).filter((g) => g.items.length > 0);
}

// ─── Chatbot helpers ──────────────────────────────────────────────────────────

const STOP_TOKENS = new Set([
  "the", "a", "an", "and", "or", "for", "with", "of", "in", "on",
  "to", "from", "by", "at", "is", "as", "be", "u-anchor", "u", "anchor",
  "series", "system", "kit", "frame", "support", "supports", "securement",
  "mount", "assembly", "base", "panel", "rail", "set", "kits", "products",
  "products.",
]);

const TOKEN_RE = /[a-z0-9]+/g;

function tokens(s: string): string[] {
  return (s.toLowerCase().match(TOKEN_RE) || []).filter(
    (t) => t.length > 2 && !STOP_TOKENS.has(t)
  );
}

// Distinctive multi-word phrases (in priority order) that uniquely identify
// a catalog item — kept here so both the resolver and the chatbot can reuse
// them without duplicating heuristics.
function distinctivePhrases(item: CatalogSolution): string[] {
  const phrases: string[] = [];
  const label = item.label.toLowerCase();

  // 1) PSS product codes (e.g. "pss 0320") are unambiguous.
  const pss = label.match(/pss\s*\d{3,4}/);
  if (pss) phrases.push(pss[0].replace(/\s+/g, " ").trim());

  // 2) Standard H-Frame size + series ("24" x 24"", "36 x 48", etc.)
  const dim = label.match(/(\d{1,3})\s*["']?\s*x\s*(\d{1,3})\s*["']?/);
  if (dim) phrases.push(`${dim[1]} x ${dim[2]}`);

  // 3) "8' Snow Retention Kit" → "8 snow retention" or distinctive prefix
  if (/8['′]\s*snow\s*retention/i.test(item.label)) phrases.push("8 snow retention");
  if (/snow\s*cleat/i.test(item.label)) phrases.push("snow cleat");

  // 4) Solar brand mounts — brand alone is distinctive enough
  const solarBrands = [
    "panel claw", "kb racking", "aerocompact", "pegasus", "sollega",
    "iron ridge", "ironridge", "skyrack", "sky rack", "slip sheet",
  ];
  for (const b of solarBrands) {
    if (label.includes(b)) phrases.push(b);
  }
  if (/\bunirac\b/.test(label)) phrases.push("unirac");

  // 5) Categories with distinctive shapes
  if (/\bcamera\b.*mounting\s*plate/i.test(item.label)) phrases.push("camera mounting plate");
  if (/satellite\s*dish/i.test(item.label)) phrases.push("satellite dish");
  if (/radio\s*tower/i.test(item.label)) phrases.push("radio tower");
  if (/weather\s*station/i.test(item.label)) phrases.push("weather station");
  if (/lightning\s*(arrester|arrestor)/i.test(item.label)) phrases.push("lightning arrester");
  if (/lightning\s*cable/i.test(item.label)) phrases.push("lightning cable");
  if (/travel\s*restraint/i.test(item.label)) phrases.push("travel restraint");
  if (/guardrail\s*panel/i.test(item.label)) phrases.push("guardrail panel");
  if (/fixfast/i.test(item.label)) phrases.push("fixfast");
  if (/utility\s*corridor/i.test(item.label)) phrases.push("utility corridor");
  if (/corridor\s*support/i.test(item.label)) phrases.push("corridor support");
  if (/rigid\s*knee/i.test(item.label)) phrases.push("rigid knee");
  if (/pipe\s*hanger/i.test(item.label)) phrases.push("pipe hanger");
  if (/duct\s*frame/i.test(item.label)) phrases.push("duct frame");
  if (/electrical\s*box\s*frame/i.test(item.label)) {
    // small/medium/large
    const m = item.label.match(/^(small|medium|large)/i);
    if (m) phrases.push(`${m[1].toLowerCase()} electrical box`);
  }
  if (/mechanical\s*tie\s*down/i.test(item.label)) phrases.push("mechanical tie down");
  if (/mechanical\s*support/i.test(item.label)) phrases.push("mechanical support");
  if (/u-screen/i.test(item.label)) phrases.push("u-screen");
  if (/wall\s*mounted\s*guardrail/i.test(item.label)) phrases.push("wall mounted guardrail");
  if (/tower.*non\s*penetrating/i.test(item.label)) phrases.push("non penetrating");
  if (/tower\/stack|tower\s*\/\s*stack/i.test(item.label)) phrases.push("tower stack");
  if (/weather\/?stand/i.test(item.label)) phrases.push("weather stand");

  return Array.from(new Set(phrases.map((p) => p.toLowerCase())));
}

// Returns the catalog item that best matches the given user text, or undefined.
// Uses distinctive multi-word phrases first; falls back to scoring overlap of
// remaining tokens against item labels for ambiguous queries.
export function findCatalogMatch(text: string): CatalogSolution | undefined {
  const raw = String(text || "").toLowerCase();
  if (!raw.trim()) return undefined;

  // Phase 1: distinctive-phrase match (highest signal).
  for (const item of SOLUTION_CATALOG) {
    const phrases = distinctivePhrases(item);
    for (const p of phrases) {
      if (raw.includes(p)) return item;
    }
  }

  // Phase 2: token overlap scoring. Only consider items that share >= 2
  // non-stop tokens with the query. Picks the highest-overlap item.
  const queryTokens = new Set(tokens(raw));
  if (queryTokens.size < 2) return undefined;

  let best: { item: CatalogSolution; score: number } | undefined;
  for (const item of SOLUTION_CATALOG) {
    const labelTokens = tokens(item.label);
    if (!labelTokens.length) continue;
    let score = 0;
    for (const t of labelTokens) if (queryTokens.has(t)) score++;
    if (score >= 2 && (!best || score > best.score)) {
      best = { item, score };
    }
  }
  return best?.item;
}

// Produce a slug compatible with the storage layout used by AssetsBrowser:
// solutions/<slugify(product.name)>/ — so the chatbot looks in the same place
// admin uploads land.
function catalogSlug(label: string): string {
  return String(label || "")
    .toLowerCase()
    .trim()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Returns folder candidates (in priority order) the chatbot can scan for docs
// when it identifies the given catalog item: the matching new-style storage
// folder first, then the legacyFolder if one is mapped. Empty array for
// coming-soon items.
export function folderCandidatesForCatalog(item: CatalogSolution): string[] {
  if (item.comingSoon) return [];
  const out: string[] = [];
  out.push(`solutions/${catalogSlug(item.label)}`);
  if (item.legacyName) {
    const legacyNameFolder = `solutions/${catalogSlug(item.legacyName)}`;
    if (!out.includes(legacyNameFolder)) out.push(legacyNameFolder);
  }
  if (item.legacyFolder && !out.includes(item.legacyFolder)) {
    out.push(item.legacyFolder);
  }
  return out;
}
