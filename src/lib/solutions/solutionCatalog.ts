// Categorized solution catalog — single source of truth for what the
// Asset Library, Lead Form, Commission Form, and chatbot display.
//
// Items flagged `comingSoon: true` are shown grayed-out / non-clickable in
// the UI, and the chatbot replies with high-level "coming soon" info only.

export type SolutionCategoryKey =
  | "mechanical"
  | "box-frames"
  | "pipe-conduit-supports"
  | "snow-retention"
  | "elevated-structure-securement"
  | "h-frame-supports"
  | "rooftop-solar"
  | "equipment-screen"
  | "safety-access"
  | "lightning-protection"
  | "security-monitoring-communication";

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

export const SOLUTION_CATEGORIES: SolutionCategory[] = [
  { key: "mechanical", label: "Mechanical" },
  { key: "box-frames", label: "Box Frames" },
  { key: "pipe-conduit-supports", label: "Pipe & Conduit Supports" },
  { key: "snow-retention", label: "Snow Retention" },
  { key: "elevated-structure-securement", label: "Elevated Structure Securement" },
  { key: "h-frame-supports", label: "H-Frame Supports" },
  { key: "rooftop-solar", label: "Rooftop Solar" },
  { key: "equipment-screen", label: "Equipment Screen" },
  { key: "safety-access", label: "Safety & Access" },
  { key: "lightning-protection", label: "Lightning Protection" },
  { key: "security-monitoring-communication", label: "Security, Monitoring, & Communication" },
];

export const SOLUTION_CATALOG: CatalogSolution[] = [
  // Mechanical
  { key: "existing-mechanical-tie-down-2000", label: "Existing Mechanical Tie Down - 2000 Series U-Anchor", category: "mechanical", legacyName: "Existing Mechanical Tie Down", legacyFolder: "solutions/hvac" },
  { key: "mechanical-support-u-anchor", label: "Mechanical Support - U-Anchor", category: "mechanical", comingSoon: true },

  // Box Frames
  { key: "small-electrical-box-frame-3000", label: "Small Electrical Box Frame - w/ 3000 Series U-Anchor", category: "box-frames" },
  // Medium ← old "Electrical Disconnect" tackle box (assets live there)
  { key: "medium-electrical-box-frame-3000", label: "Medium Electrical Box Frame - w/ 3000 Series U-Anchor", category: "box-frames", legacyName: "Electrical Disconnect", legacyFolder: "solutions/electrical-disconnect" },
  // Large ← old "Roof Mounted Box" tackle box
  { key: "large-electrical-box-frame-3000", label: "Large Electrical Box Frame - w/ 3000 Series U-Anchor", category: "box-frames", legacyName: "Roof Mounted Box", legacyFolder: "solutions/roof-box" },

  // Pipe & Conduit Supports (legacy: Roof Pipe Support family)
  { key: "pss-0320-roller-assembly", label: "PSS 0320 - Pipe Support Securement - Roller Assembly", category: "pipe-conduit-supports", legacyName: "Roller Pipe Support", legacyFolder: "solutions/roof-pipe/roller" },
  { key: "pss-0310-strut-assembly", label: "PSS 0310 - Pipe Support Securement - Strut Assembly", category: "pipe-conduit-supports", legacyName: "Roof Pipe Support", legacyFolder: "solutions/roof-pipe" },
  { key: "pss-0305-6in-base", label: "PSS 0305 - Pipe Securement - 6\" Base", category: "pipe-conduit-supports", legacyName: "Single Pipe Support", legacyFolder: "solutions/roof-pipe/single" },
  { key: "pss-0300-12in-base", label: "PSS 0300 - Pipe Securement - 12\" Base", category: "pipe-conduit-supports", legacyName: "Double Pipe Support", legacyFolder: "solutions/roof-pipe/double" },
  { key: "pipe-securement-utility-corridor", label: "Pipe Securement - Utility Corridor", category: "pipe-conduit-supports", comingSoon: true },

  // Snow Retention
  { key: "snow-retention-system", label: "Snow Retention System", category: "snow-retention", comingSoon: true, legacyFolder: "solutions/snow-retention" },
  { key: "snow-retention-8ft-kit", label: "8' Snow Retention Kit", category: "snow-retention", legacyName: "2-Pipe Snow Fence", legacyFolder: "solutions/snow-retention/2-pipe-snow-fence" },
  { key: "snow-cleat-kit", label: "Snow Cleat Kit", category: "snow-retention", comingSoon: true, legacyFolder: "solutions/snow-retention" },

  // Elevated Structure Securement (legacy: Roof-Mounted Elevated Stack)
  { key: "tower-stack-securement-2000", label: "Tower/Stack Securement - 2000 Series U-Anchor", category: "elevated-structure-securement", legacyName: "Roof-Mounted Elevated Stack", legacyFolder: "solutions/elevated-stack/roof-stack" },
  { key: "weather-stand-equipment-2000", label: "Weather/Stand Equipment - 2000 Series U-Anchor", category: "elevated-structure-securement", comingSoon: true, legacyFolder: "solutions/weather-station" },
  { key: "tower-securement-non-penetrating-base-2000", label: "Tower Securement, Non Penetrating Base - 2000 Series U-Anchor", category: "elevated-structure-securement", comingSoon: true, legacyFolder: "solutions/elevated-stack/roof-stack" },

  // H-Frame Supports (legacy: Attached / Existing Pipe-Frame & Duct Securement)
  { key: "h-frame-corridor-support", label: "H-Frame Corridor Support", category: "h-frame-supports", comingSoon: true, legacyFolder: "solutions/pipe-frame/attached" },
  { key: "existing-h-frame-exterior-bracing-2000", label: "Existing H-Frame Securement - Exterior Bracing w/ 2000 Series U-Anchor", category: "h-frame-supports", legacyName: "Existing Pipe-Frame", legacyFolder: "solutions/pipe-frame/existing" },
  { key: "existing-h-frame-interior-bracing-3000", label: "Existing H-Frame Securement - Interior Bracing w/ 3000 Series U-Anchor", category: "h-frame-supports", legacyName: "Existing Pipe-Frame", legacyFolder: "solutions/pipe-frame/existing" },
  { key: "existing-h-frame-rigid-knee-bracing", label: "Existing H-Frame Securement - Rigid Knee Bracing", category: "h-frame-supports", comingSoon: true, legacyFolder: "solutions/pipe-frame/existing" },
  { key: "pipe-hanger-frame-3000", label: "Pipe Hanger Frame - 3000 Series U-Anchor", category: "h-frame-supports", legacyName: "Attached Pipe-Frame", legacyFolder: "solutions/pipe-frame/attached" },
  { key: "pipe-hanger-frame-roller-3000", label: "Pipe Hanger Frame, Roller - 3000 Series U-Anchor", category: "h-frame-supports", legacyName: "Attached Pipe-Frame", legacyFolder: "solutions/pipe-frame/attached" },
  { key: "strut-frame-exterior-bracing-u-anchor", label: "Strut Frame Securement - Exterior Bracing w/ U-Anchor", category: "h-frame-supports", legacyName: "Attached Pipe-Frame", legacyFolder: "solutions/pipe-frame/attached" },
  { key: "duct-frame-3000", label: "Duct Frame - 3000 Series U-Anchor", category: "h-frame-supports", legacyName: "Duct Securement", legacyFolder: "solutions/duct-securement" },
  { key: "existing-duct-frame-securement", label: "Existing Duct Frame Securement", category: "h-frame-supports", legacyName: "Duct Securement", legacyFolder: "solutions/duct-securement" },
  { key: "existing-duct-securement", label: "Existing Duct Securement", category: "h-frame-supports", legacyName: "Duct Securement", legacyFolder: "solutions/duct-securement" },
  { key: "std-h-frame-24x24-300", label: "24\" x 24\" Standard H-Frame - w/ 300 Series U-Anchor", category: "h-frame-supports", legacyName: "Attached Pipe-Frame", legacyFolder: "solutions/pipe-frame/attached" },
  { key: "std-h-frame-36x36-300", label: "36\" x 36\" Standard H-Frame - w/ 300 Series U-Anchor", category: "h-frame-supports", legacyName: "Attached Pipe-Frame", legacyFolder: "solutions/pipe-frame/attached" },
  { key: "std-h-frame-36x48-300", label: "36\" x 48\" Standard H-Frame - w/ 300 Series U-Anchor", category: "h-frame-supports", legacyName: "Attached Pipe-Frame", legacyFolder: "solutions/pipe-frame/attached" },

  // Rooftop Solar (all coming soon — legacyFolder points at existing solar docs for chatbot context)
  { key: "solar-panel-claw-hibred", label: "Solar Mount Panel Claw HiBred", category: "rooftop-solar", comingSoon: true, legacyFolder: "solutions/solar" },
  { key: "solar-panel-claw-fully-attached", label: "Solar Mount Panel Claw Fully Attached", category: "rooftop-solar", comingSoon: true, legacyFolder: "solutions/solar" },
  { key: "solar-unirac-hibred", label: "Solar Mount Unirac HiBred", category: "rooftop-solar", comingSoon: true, legacyFolder: "solutions/solar" },
  { key: "solar-unirac-fully-attached", label: "Solar Mount Unirac Fully Attached", category: "rooftop-solar", comingSoon: true, legacyFolder: "solutions/solar" },
  { key: "solar-kb-racking", label: "Solar Mount KB Racking", category: "rooftop-solar", comingSoon: true, legacyFolder: "solutions/solar" },
  { key: "solar-aerocompact-hibred", label: "Solar Mount AeroCompact HiBred", category: "rooftop-solar", comingSoon: true, legacyFolder: "solutions/solar" },
  { key: "solar-aerocompact-fully-attached", label: "Solar Mount AeroCompact Fully Attached", category: "rooftop-solar", comingSoon: true, legacyFolder: "solutions/solar" },
  { key: "solar-pegasus-hibred", label: "Solar Mount Pegasus HiBred", category: "rooftop-solar", comingSoon: true, legacyFolder: "solutions/solar" },
  { key: "solar-pegasus-fully-attached", label: "Solar Mount Pegasus Fully Attached", category: "rooftop-solar", comingSoon: true, legacyFolder: "solutions/solar" },
  { key: "solar-sollega-hibred", label: "Solar Mount Sollega HiBred", category: "rooftop-solar", comingSoon: true, legacyFolder: "solutions/solar" },
  { key: "solar-sollega-fully-attached", label: "Solar Mount Sollega Fully Attached", category: "rooftop-solar", comingSoon: true, legacyFolder: "solutions/solar" },
  { key: "solar-iron-ridge-rail-fully-attached", label: "Solar Mount Iron Ridge Rail System Fully Attached", category: "rooftop-solar", comingSoon: true, legacyFolder: "solutions/solar" },
  { key: "solar-unirac-rail-fully-attached", label: "Solar Mount Unirac Rail Fully Attached", category: "rooftop-solar", comingSoon: true, legacyFolder: "solutions/solar" },
  { key: "solar-skyrack-rail", label: "Solar Mount Solar SkyRack Rail", category: "rooftop-solar", comingSoon: true, legacyFolder: "solutions/solar" },
  { key: "solar-slip-sheets", label: "Slip Sheets", category: "rooftop-solar", comingSoon: true, legacyFolder: "solutions/solar" },

  // Equipment Screen (all coming soon, legacy: Equipment Screen)
  { key: "u-screen-6ft-metal-panel-louver", label: "6' U-Screen Support Frame - Metal Panel & Louver", category: "equipment-screen", comingSoon: true, legacyFolder: "solutions/equipment-screen" },
  { key: "u-screen-6ft-narrow", label: "6' U-Screen Support Frame - Narrow", category: "equipment-screen", comingSoon: true, legacyFolder: "solutions/equipment-screen" },

  // Safety & Access
  { key: "travel-restraint-anchorage", label: "Travel Restraint Anchorage", category: "safety-access", comingSoon: true, legacyFolder: "solutions/roof-guardrail" },
  { key: "guardrail-panel-base-anchorage", label: "Guardrail Panel Base Anchorage", category: "safety-access", comingSoon: true, legacyFolder: "solutions/roof-guardrail" },
  { key: "fixfast-guardrail", label: "FixFast Guardrail", category: "safety-access", comingSoon: true, legacyFolder: "solutions/roof-guardrail" },
  { key: "wall-mounted-guardrail", label: "Wall Mounted Guardrail", category: "safety-access", legacyName: "Wall Guardrail", legacyFolder: "solutions/wall-guardrail" },
  { key: "stairs", label: "Stairs", category: "safety-access", comingSoon: true },
  { key: "crossover", label: "Crossover", category: "safety-access", comingSoon: true },

  // Lightning Protection (all coming soon, legacy: Lightning Protection)
  { key: "lightning-arrester-securement", label: "Lightning Arrester Securement", category: "lightning-protection", comingSoon: true, legacyFolder: "solutions/lightning" },
  { key: "lightning-cable-securement", label: "Lightning Cable Securement", category: "lightning-protection", comingSoon: true, legacyFolder: "solutions/lightning" },

  // Security, Monitoring, & Communication (all coming soon)
  { key: "camera-mounting-plate", label: "Camera w/ Mounting Plate", category: "security-monitoring-communication", legacyFolder: "solutions/camera-mount" },
  { key: "roof-wall-mount-light-no-plate", label: "Roof Mount & Wall Mount Light w/o Mounting Plate", category: "security-monitoring-communication", comingSoon: true, legacyFolder: "solutions/light-mount" },
  { key: "satellite-dish-mount-roof-wall", label: "Satellite Dish Mount - Roof or Wall", category: "security-monitoring-communication", comingSoon: true, legacyFolder: "solutions/satellite-dish" },
  { key: "radio-tower-securement", label: "Radio Tower Securement", category: "security-monitoring-communication", comingSoon: true, legacyFolder: "solutions/antenna" },
  { key: "weather-station", label: "Weather Station", category: "security-monitoring-communication", comingSoon: true, legacyFolder: "solutions/weather-station" },
  { key: "antenna-securement-w-base", label: "Antenna Securement w/ Base", category: "security-monitoring-communication", comingSoon: true, legacyFolder: "solutions/antenna" },
  { key: "antenna-guy-wire-securement", label: "Antenna Guy Wire Securement", category: "security-monitoring-communication", comingSoon: true, legacyFolder: "solutions/antenna" },
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
