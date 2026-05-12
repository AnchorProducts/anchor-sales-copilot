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

  // Box Frames — empty placeholders, content to be refilled by Anchor team
  { key: "small-electrical-box-frame-3000", label: "Small Electrical Box Frame - w/ 3000 Series U-Anchor", category: "box-frames" },
  { key: "medium-electrical-box-frame-3000", label: "Medium Electrical Box Frame - w/ 3000 Series U-Anchor", category: "box-frames" },
  { key: "large-electrical-box-frame-3000", label: "Large Electrical Box Frame - w/ 3000 Series U-Anchor", category: "box-frames" },

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
  { key: "camera-mounting-plate", label: "Camera w/ Mounting Plate", category: "security-monitoring-communication", comingSoon: true, legacyFolder: "solutions/camera-mount" },
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
