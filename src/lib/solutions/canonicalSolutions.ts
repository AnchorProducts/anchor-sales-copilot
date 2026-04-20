// src/lib/solutions/canonicalSolutions.ts

export type AnchorType = "2000" | "3000" | "guy-wire" | "unknown";
export type Membrane = "tpo" | "pvc" | "epdm" | "sbs" | "sbs-torch" | "app" | "kee" | "coatings" | null;

export type DocKind =
  | "sales_sheet"
  | "data_sheet"
  | "product_data_sheet"
  | "install_manual"
  | "install_sheet"
  | "install_video"
  | "cad_dwg"
  | "cad_step"
  | "product_drawing"
  | "product_image"
  | "render"
  | "asset"
  | "unknown";

/**
 * Your storage taxonomy is foldered by solution + variant (ex: pipe-frame/attached).
 * So "Securing" should represent a *real* bucket route, not loose words like "attached".
 */
export type Securing =
  | "solar"

  // snow-retention/
  | "snow-retention/2-pipe-snow-fence"
  | "snow-retention/unitized-snow-fence"
  | "snow-retention"

  // boxes/
  | "roof-box"
  | "wall-box"

  // misc solutions/
  | "electrical-disconnect"
  | "hvac"
  | "guy-wire-kit"
  | "equipment-screen"
  | "signage"
  | "lightning"
  | "light-mount"
  | "camera-mount"
  | "antenna"
  | "satellite-dish"
  | "weather-station"

  // pipe-frame/
  | "pipe-frame/attached"
  | "pipe-frame/existing"
  | "duct-securement"

  // elevated-stack/
  | "elevated-stack/roof-stack"
  | "elevated-stack/wall-stack"
  | "elevated-stack"

  // roof-stairs-walkways/
  | "roof-stairs-walkways/double-stair"
  | "roof-stairs-walkways/single-stair"
  | "roof-stairs-walkways/walkways"
  | "roof-stairs-walkways"

  // roof-pipe/
  | "roof-pipe/adjustable"
  | "roof-pipe/double"
  | "roof-pipe/roller"
  | "roof-pipe/single"
  | "roof-pipe"

  // guardrail + ladder (as shown in your storage list)
  | "roof-guardrail"
  | "wall-guardrail"
  | "roof-ladder"

  | "unknown";

/**
 * ChatGPT-like “slot filling”:
 * We infer a securing route, then ask only what’s missing for doc routing.
 */
export type IntakeState = {
  securing?: Securing | null;
  anchorType?: AnchorType | null;
  membrane?: Membrane;
  isExisting?: boolean | null;

  /** helps disambiguate roof vs wall variants where applicable */
  mountSurface?: "roof" | "wall" | "unknown" | null;

  /** lightweight variant for solutions with subfolders */
  variant?:
    | "2-pipe"
    | "unitized"
    | "attached"
    | "existing"
    | "roof-stack"
    | "wall-stack"
    | "double-stair"
    | "single-stair"
    | "walkways"
    | "adjustable"
    | "double"
    | "roller"
    | "single"
    | null;

  wants?: DocKind[];
};

export type AskStep = {
  key:
    | "securing"
    | "isExisting"
    | "membrane"
    | "anchorType"
    | "mountSurface"
    | "variant"
    | "wants";
  question: string;
  options?: string[];
  shouldAsk: (s: IntakeState) => boolean;
  hint?: Partial<IntakeState>;
};

export type CanonicalSolution = {
  key: string;
  match: RegExp;

  summary: string;

  /** normalized intent (aligned to storage) */
  securing: Securing;

  /** best default (can still be overridden by user / future logic) */
  anchorType: AnchorType;

  /** folder prefix inside knowledge bucket (relative path) */
  storageFolder?: string;

  keywords?: string[];
  ask?: AskStep[];
  recommendedDocKinds?: DocKind[];
};

/* ---------------------------------------------
   Default Ask Flow
--------------------------------------------- */

const ASK_MEMBRANE: AskStep = {
  key: "membrane",
  question: "What roof membrane are you on (TPO, PVC, EPDM), or not sure?",
  options: ["TPO", "PVC", "EPDM", "Not sure"],
  shouldAsk: (s) => !s.membrane || s.membrane === null,
};

const ASK_EXISTING: AskStep = {
  key: "isExisting",
  question: "Is this a new install or re-securing existing equipment?",
  options: ["New install", "Existing / re-secure", "Not sure"],
  shouldAsk: (s) => s.isExisting === null || typeof s.isExisting === "undefined",
};

const ASK_ANCHOR_TYPE: AskStep = {
  key: "anchorType",
  question:
    "Do you know the attachment type (2000-series, 3000-series, guy wire kit), or should I infer it?",
  options: ["2000-series", "3000-series", "Guy wire kit", "Infer it"],
  shouldAsk: (s) => !s.anchorType || s.anchorType === null || s.anchorType === "unknown",
};

const ASK_WANTS: AskStep = {
  key: "wants",
  question: "Which sheets do you need?",
  options: [
    "Sales sheet",
    "Data sheet",
    "Install manual",
    "Install sheet",
    "Install video",
    "CAD (DWG/STEP)",
    "Images/renders",
  ],
  shouldAsk: (s) => !Array.isArray(s.wants) || s.wants.length === 0,
};

const ASK_MOUNT_SURFACE: AskStep = {
  key: "mountSurface",
  question: "Is this roof-mounted or wall/parapet-mounted?",
  options: ["Roof-mounted", "Wall/Parapet-mounted", "Not sure"],
  shouldAsk: (s) =>
    (s.securing === "roof-box" ||
      s.securing === "wall-box" ||
      s.securing === "elevated-stack" ||
      s.securing === "roof-guardrail" ||
      s.securing === "wall-guardrail") &&
    (!s.mountSurface || s.mountSurface === null || s.mountSurface === "unknown"),
};

/* ---------------------------------------------
   Helpers
--------------------------------------------- */

export function nextQuestionForSolution(sol: CanonicalSolution, state: IntakeState) {
  const steps = sol.ask ?? [];
  for (const step of steps) {
    if (step.shouldAsk(state)) return step;
  }
  return null;
}

export function formatSheetRecommendations(sol: CanonicalSolution, state: IntakeState) {
  const wants =
    state.wants?.length
      ? state.wants
      : sol.recommendedDocKinds?.length
        ? sol.recommendedDocKinds
        : ["data_sheet", "install_sheet", "sales_sheet"];

  const membrane = state.membrane ? state.membrane.toUpperCase() : "most membranes";
  const anchorType =
    state.anchorType && state.anchorType !== "unknown" ? state.anchorType : sol.anchorType;

  return [
    `Recommended sheets for **${sol.securing}** (${membrane}, ${anchorType}):`,
    wants
      .map((k) => {
        switch (k) {
          case "sales_sheet":
            return "• Sales sheet";
          case "data_sheet":
            return "• Data sheet";
          case "product_data_sheet":
            return "• Product data sheet";
          case "install_manual":
            return "• Install manual";
          case "install_sheet":
            return "• Install sheet";
          case "install_video":
            return "• Install video";
          case "cad_dwg":
            return "• CAD (DWG)";
          case "cad_step":
            return "• CAD (STEP)";
          case "product_drawing":
            return "• Product drawing";
          case "product_image":
            return "• Product images";
          case "render":
            return "• Renders";
          default:
            return "• Specs / assets";
        }
      })
      .join("\n"),
    `Grab these in **Asset Management** (folder: ${sol.storageFolder || sol.securing}).`,
  ].join("\n");
}

/* ---------------------------------------------
   Canonical Solutions
   (includes your new alias: "roof-mounted h-frame" == pipe-frame/attached)
--------------------------------------------- */

export const CANONICAL_SOLUTIONS: CanonicalSolution[] = [
  {
    key: "solar",
    match: /\b(solar|pv|p\.?v\.?|photovoltaic|panel(?:s)?|array(?:s)?|racking|rack(?:s)?|rail(?:s)?)\b/i,
    securing: "solar",
    storageFolder: "solutions/solar",
    anchorType: "2000",
    keywords: ["strut", "rail", "racking", "pv"],
    recommendedDocKinds: ["sales_sheet", "data_sheet", "install_sheet", "install_manual", "cad_dwg", "cad_step"],
    ask: [ASK_MEMBRANE, ASK_ANCHOR_TYPE, ASK_WANTS],
    summary:
      "Solar racking is typically supported using membrane-compatible rooftop attachments that provide stable connection points without compromising the roof system.",
  },

  // ----------------------------
  // Snow retention (foldered)
  // ----------------------------
  {
    key: "2-pipe-snow-fence",
    match: /\b((2|two)\s*[- ]?\s*pipe\b.*\b(snow\s*(retention|fence)|snow\s*guard|avalanche)\b|\b(snow\s*(retention|fence))\b.*\b(2|two)\s*[- ]?\s*pipe\b)\b/i,
    securing: "snow-retention/2-pipe-snow-fence",
    storageFolder: "solutions/snow-retention/2-pipe-snow-fence",
    anchorType: "2000",
    keywords: ["two-pipe", "snow fence", "pipe", "splices"],
    recommendedDocKinds: ["sales_sheet", "data_sheet", "install_sheet"],
    ask: [ASK_MEMBRANE, ASK_WANTS],
    summary:
      "2-pipe snow fence systems are typically supported using 2000-series anchors with piping/splices to create a continuous rooftop attachment approach.",
  },
  {
    key: "unitized-snow-fence",
    match: /\b(unitized|unitised)\b.*\b(snow\s*(retention|fence)|snow\s*guard|avalanche)\b|\b(snow\s*(retention|fence))\b.*\b(unitized|unitised)\b/i,
    securing: "snow-retention/unitized-snow-fence",
    storageFolder: "solutions/snow-retention/unitized-snow-fence",
    anchorType: "3000",
    keywords: ["unitized", "snow fence"],
    recommendedDocKinds: ["sales_sheet", "data_sheet", "install_sheet"],
    ask: [ASK_MEMBRANE, ASK_WANTS],
    summary:
      "Unitized snow fence systems are commonly supported using rigid framing with 3000-series anchors for new installations.",
  },
  {
    key: "snow-retention-general",
    match: /\b(snow\s*retention|snow\s*fence(?:s)?)\b/i,
    securing: "snow-retention",
    storageFolder: "solutions/snow-retention",
    anchorType: "unknown",
    keywords: ["snow retention", "snow fence", "unitized", "2-pipe", "two-pipe"],
    ask: [
      {
        key: "variant",
        question: "Is this a 2-pipe snow fence or a unitized snow fence?",
        options: ["2-pipe", "Unitized", "Not sure"],
        shouldAsk: (s) => !s.variant,
      },
      ASK_MEMBRANE,
      ASK_WANTS,
    ],
    summary:
      "Snow retention solutions vary by configuration (2-pipe vs unitized). The right docs depend on the fence type and roof conditions.",
  },

  // ----------------------------
  // Pipe frame (IMPORTANT ALIAS)
  // ----------------------------
  {
    key: "pipe-frame-attached",
    // ✅ attached pipe-frame is also called roof-mounted H-frame
    match: /\b(attached\s*pipe[-\s]*frame|pipe[-\s]*frame\s*attached|roof[-\s]*mounted\s*h[-\s]*frame|roof\s*mounted\s*hframe|h[-\s]*frame)\b/i,
    securing: "pipe-frame/attached",
    storageFolder: "solutions/pipe-frame/attached",
    anchorType: "3000",
    keywords: ["pipe frame", "attached", "roof-mounted h-frame", "h-frame", "strut"],
    recommendedDocKinds: ["sales_sheet", "data_sheet", "install_sheet", "cad_dwg", "cad_step", "product_drawing"],
    ask: [ASK_MEMBRANE, ASK_WANTS],
    summary:
      "Attached pipe-frame securement (aka roof-mounted H-frame) typically uses rigid framing tied into membrane-compatible rooftop attachments for long-term stability.",
  },
  {
    key: "pipe-frame-existing",
    match: /\b(existing\s*pipe[-\s]*frame|pipe[-\s]*frame\s*existing|existing\s*h[-\s]*frame|retrofit\s*pipe[-\s]*frame)\b/i,
    securing: "pipe-frame/existing",
    storageFolder: "solutions/pipe-frame/existing",
    anchorType: "guy-wire",
    keywords: ["existing frame", "retrofit", "re-secure", "tie-down", "guy wire"],
    recommendedDocKinds: ["sales_sheet", "data_sheet", "install_sheet"],
    ask: [ASK_MEMBRANE, ASK_WANTS],
    summary:
      "Existing pipe-frame securement is typically handled as a re-secure approach (often tie-down style) depending on what’s already installed.",
  },

  // ----------------------------
  // Duct securement (folder)
  // ----------------------------
  {
    key: "duct-securement",
    match: /\b(duct\s*securement|ductwork\s*securement|duct\s*support(?:s)?|ductwork\s*support(?:s)?|rooftop\s*duct(?:s)?|ductwork)\b/i,
    securing: "duct-securement",
    storageFolder: "solutions/duct-securement",
    anchorType: "3000",
    keywords: ["duct", "ductwork", "support", "framing"],
    recommendedDocKinds: ["sales_sheet", "data_sheet", "install_sheet"],
    ask: [ASK_MEMBRANE, ASK_WANTS],
    summary:
      "Rooftop ductwork is typically supported using stable, non-penetrating attachment solutions that preserve the roof membrane while controlling movement over time.",
  },

  // ----------------------------
  // HVAC (existing mechanical tie-down)
  // ----------------------------
  {
    key: "hvac-existing-tie-down",
    match: /\b(hvac|rtu|rooftop\s*unit|air\s*handler|mechanical\s*unit)\b/i,
    securing: "hvac",
    storageFolder: "solutions/hvac",
    anchorType: "guy-wire",
    keywords: ["hvac", "rtu", "mechanical", "tie-down", "existing"],
    recommendedDocKinds: ["sales_sheet", "data_sheet", "install_sheet"],
    ask: [ASK_MEMBRANE, ASK_WANTS],
    summary:
      "HVAC units are typically stabilized using a mechanical tie-down approach with guy wire kits and 2000-series anchors.",
  },

  // ----------------------------
  // Elevated stack (roof vs wall)
  // ----------------------------
  {
    key: "elevated-stack-roof",
    match: /\b(roof\s*stack|roof[-\s]*mounted\s*stack|roof\s*exhaust\s*stack|exhaust\s*stack)\b/i,
    securing: "elevated-stack/roof-stack",
    storageFolder: "solutions/elevated-stack/roof-stack",
    anchorType: "guy-wire",
    keywords: ["stack", "exhaust", "tie-down", "guy wire"],
    recommendedDocKinds: ["sales_sheet", "data_sheet", "install_sheet"],
    ask: [ASK_MEMBRANE, ASK_WANTS],
    summary:
      "Roof-mounted stacks are commonly stabilized using tie-down style securement (not rigid framing), depending on the application.",
  },
  {
    key: "elevated-stack-wall",
    match: /\b(wall\s*stack|wall[-\s]*mounted\s*stack|parapet\s*stack)\b/i,
    securing: "elevated-stack/wall-stack",
    storageFolder: "solutions/elevated-stack/wall-stack",
    anchorType: "2000",
    keywords: ["wall", "parapet", "stack"],
    recommendedDocKinds: ["sales_sheet", "data_sheet", "install_sheet"],
    ask: [ASK_MEMBRANE, ASK_WANTS],
    summary:
      "Wall/parapet stacks are typically supported using attachment solutions that stabilize the assembly while preserving roof performance.",
  },
  
  // ----------------------------
  // Boxes (roof / wall)
  // ----------------------------
  {
    key: "roof-box",
    match: /\b(roof\s*box|roof[-\s]*mounted\s*box|rooftop\s*box|roof\s*mounted\s*enclosure)\b/i,
    securing: "roof-box",
    storageFolder: "solutions/roof-box",
    anchorType: "2000",
    keywords: ["enclosure", "strut", "box"],
    recommendedDocKinds: ["sales_sheet", "data_sheet", "install_sheet", "install_manual"],
    ask: [ASK_MEMBRANE, ASK_WANTS],
    summary:
      "Roof-mounted boxes are typically supported using non-penetrating rooftop attachment points and framing while maintaining membrane compatibility.",
  },
  {
    key: "wall-box",
    match: /\b(wall\s*box|wall[-\s]*mounted\s*box|wall\s*mounted\s*enclosure|parapet\s*box)\b/i,
    securing: "wall-box",
    storageFolder: "solutions/wall-box",
    anchorType: "3000",
    keywords: ["wall", "parapet", "enclosure"],
    recommendedDocKinds: ["sales_sheet", "data_sheet", "install_sheet"],
    ask: [ASK_MEMBRANE, ASK_WANTS],
    summary:
      "Wall/parapet-mounted boxes are typically supported using attachment solutions that stabilize the enclosure at the roof-to-wall interface.",
  },

  // ----------------------------
  // Equipment screen / signage
  // ----------------------------
  {
    key: "equipment-screen",
    match: /\b(equipment\s*screen|rooftop\s*screen|visual\s*screen|wind\s*screen|windscreen)\b/i,
    securing: "equipment-screen",
    storageFolder: "solutions/equipment-screen",
    anchorType: "2000",
    keywords: ["equipment screen", "rooftop screen", "visual screen", "windscreen"],
    recommendedDocKinds: ["sales_sheet", "data_sheet", "install_sheet"],
    ask: [ASK_MEMBRANE, ASK_WANTS],
    summary:
      "Equipment screens are typically secured using 2000-series anchors with strut framing, similar to rooftop signage.",
  },
  {
    key: "signage",
    match: /\b(signage|rooftop\s*sign|roof\s*sign|branded\s*sign)\b/i,
    securing: "signage",
    storageFolder: "solutions/signage",
    anchorType: "2000",
    keywords: ["signage", "rooftop sign", "roof sign"],
    recommendedDocKinds: ["sales_sheet", "data_sheet", "install_sheet"],
    ask: [ASK_MEMBRANE, ASK_WANTS],
    summary:
      "Rooftop signage is commonly secured using 2000-series anchors with strut framing.",
  },

  // ----------------------------
  // Light / camera mounts
  // ----------------------------
  {
    key: "light-mount",
    match: /\b(light\s*mount|lighting\s*mount|area\s*light|flood\s*light)\b/i,
    securing: "light-mount",
    storageFolder: "solutions/light-mount",
    anchorType: "3000",
    keywords: ["light mount", "area light", "flood light"],
    recommendedDocKinds: ["sales_sheet", "data_sheet", "install_sheet"],
    ask: [ASK_MEMBRANE, ASK_WANTS],
    summary:
      "Light mounts typically use 3000-series anchors with strut framing for rooftop lighting equipment.",
  },
  {
    key: "camera-mount",
    match: /\b(camera\s*mount|camera|cctv|surveillance\s*camera|security\s*camera)\b/i,
    securing: "camera-mount",
    storageFolder: "solutions/camera-mount",
    anchorType: "3000",
    keywords: ["camera mount", "security camera", "surveillance camera", "cctv"],
    recommendedDocKinds: ["sales_sheet", "data_sheet", "install_sheet"],
    ask: [ASK_MEMBRANE, ASK_WANTS],
    summary:
      "Camera mounts typically use 3000-series anchors with strut framing for rooftop surveillance equipment.",
  },

  // ----------------------------
  // Antenna
  // ----------------------------
  {
    key: "antenna",
    match: /\b(antenna|rf\s*antenna|communication\s*antenna|radio\s*antenna|telecom\s*antenna)\b/i,
    securing: "antenna",
    storageFolder: "solutions/antenna",
    anchorType: "guy-wire",
    keywords: ["antenna", "rf", "communication", "telecom", "guy wire"],
    recommendedDocKinds: ["sales_sheet", "data_sheet", "install_sheet"],
    ask: [ASK_MEMBRANE, ASK_WANTS],
    summary:
      "Antennas are typically stabilized using a guy wire tie-down kit with 2000-series anchors.",
  },

  // ----------------------------
  // Satellite dish
  // ----------------------------
  {
    key: "satellite-dish",
    match: /\b(satellite\s*dish|satellite\s*antenna|dish\s*antenna|satellite)\b/i,
    securing: "satellite-dish",
    storageFolder: "solutions/satellite-dish",
    anchorType: "2000",
    keywords: ["satellite", "dish", "satellite dish"],
    recommendedDocKinds: ["sales_sheet", "data_sheet", "install_sheet"],
    ask: [ASK_MEMBRANE, ASK_WANTS],
    summary:
      "Satellite dishes are typically secured using 2000-series anchors.",
  },

  // ----------------------------
  // Weather station
  // ----------------------------
  {
    key: "weather-station",
    match: /\b(weather\s*station|weather\s*monitor|rooftop\s*sensor|monitoring\s*station|environmental\s*sensor)\b/i,
    securing: "weather-station",
    storageFolder: "solutions/weather-station",
    anchorType: "guy-wire",
    keywords: ["weather station", "sensor", "monitor", "guy wire"],
    recommendedDocKinds: ["sales_sheet", "data_sheet", "install_sheet"],
    ask: [ASK_MEMBRANE, ASK_WANTS],
    summary:
      "Weather stations are typically stabilized using a guy wire tie-down kit with 2000-series anchors.",
  },

  // ----------------------------
  // Lightning protection
  // ----------------------------
  {
    key: "lightning",
    match: /\b(lightning|lightning\s*protection|lightning\s*arrestor|lightning\s*rod|surge\s*protection\s*mast)\b/i,
    securing: "lightning",
    storageFolder: "solutions/lightning",
    anchorType: "2000",
    keywords: ["lightning", "lightning protection", "lightning rod"],
    recommendedDocKinds: ["sales_sheet", "data_sheet", "install_sheet"],
    ask: [ASK_MEMBRANE, ASK_WANTS],
    summary:
      "Lightning protection systems are typically anchored using 2000-series membrane anchors.",
  },

  // ----------------------------
  // Guardrails
  // ----------------------------
  {
    key: "roof-guardrail",
    match: /\b(roof\s*guardrail|rooftop\s*guardrail|roof\s*railing|roof\s*fall\s*protection|roof[-\s]*mounted\s*guardrail)\b/i,
    securing: "roof-guardrail",
    storageFolder: "solutions/roof-guardrail",
    anchorType: "3000",
    keywords: ["guardrail", "railing", "fall protection", "roof-mounted"],
    recommendedDocKinds: ["sales_sheet", "data_sheet", "install_sheet"],
    ask: [ASK_MEMBRANE, ASK_WANTS],
    summary:
      "Roof-mounted guardrails typically use 3000-series anchors for non-penetrating edge protection.",
  },
  {
    key: "wall-guardrail",
    match: /\b(wall\s*guardrail|parapet\s*guardrail|wall\s*railing|parapet\s*railing|wall[-\s]*mounted\s*guardrail)\b/i,
    securing: "wall-guardrail",
    storageFolder: "solutions/wall-guardrail",
    anchorType: "3000",
    keywords: ["wall guardrail", "parapet guardrail", "wall railing"],
    recommendedDocKinds: ["sales_sheet", "data_sheet", "install_sheet"],
    ask: [ASK_MEMBRANE, ASK_WANTS],
    summary:
      "Wall/parapet-mounted guardrails typically use 3000-series anchors at the roof-to-wall interface.",
  },
  {
    key: "guardrail-general",
    match: /\b(guardrail|guard\s*rail|handrail|railing)\b/i,
    securing: "roof-guardrail",
    storageFolder: "solutions/roof-guardrail",
    anchorType: "3000",
    keywords: ["guardrail", "handrail", "railing"],
    recommendedDocKinds: ["sales_sheet", "data_sheet", "install_sheet"],
    ask: [ASK_MOUNT_SURFACE, ASK_MEMBRANE, ASK_WANTS],
    summary:
      "Guardrail systems use 3000-series anchors for non-penetrating rooftop edge protection.",
  },

  // ----------------------------
  // Roof ladder
  // ----------------------------
  {
    key: "roof-ladder",
    match: /\b(roof\s*ladder|rooftop\s*ladder|access\s*ladder|ladder\s*mount)\b/i,
    securing: "roof-ladder",
    storageFolder: "solutions/roof-ladder",
    anchorType: "3000",
    keywords: ["roof ladder", "access ladder", "rooftop ladder"],
    recommendedDocKinds: ["sales_sheet", "data_sheet", "install_sheet"],
    ask: [ASK_MEMBRANE, ASK_WANTS],
    summary:
      "Roof ladders are typically secured using 3000-series anchors with an adjustable strut bracket.",
  },

  // ----------------------------
  // Roof pipe support (horizontal pipe runs)
  // ----------------------------
  {
    key: "roof-pipe-adjustable",
    match: /\b(adjustable\s*pipe\s*support|adjustable\s*roof\s*pipe|adjustable\s*pipe\s*cradle)\b/i,
    securing: "roof-pipe/adjustable",
    storageFolder: "solutions/roof-pipe/adjustable",
    anchorType: "3000",
    keywords: ["adjustable", "pipe support", "cradle"],
    recommendedDocKinds: ["sales_sheet", "data_sheet", "install_sheet"],
    ask: [ASK_MEMBRANE, ASK_WANTS],
    summary:
      "Adjustable pipe supports use 3000-series anchors with a height-adjustable cradle for horizontal rooftop pipe runs.",
  },
  {
    key: "roof-pipe-double",
    match: /\b(double\s*pipe\s*support|dual\s*pipe\s*support|double\s*cradle)\b/i,
    securing: "roof-pipe/double",
    storageFolder: "solutions/roof-pipe/double",
    anchorType: "3000",
    keywords: ["double pipe", "dual pipe", "double cradle"],
    recommendedDocKinds: ["sales_sheet", "data_sheet", "install_sheet"],
    ask: [ASK_MEMBRANE, ASK_WANTS],
    summary:
      "Double pipe supports use 3000-series anchors to carry two parallel horizontal pipe runs.",
  },
  {
    key: "roof-pipe-roller",
    match: /\b(roller\s*pipe\s*support|roller\s*cradle|pipe\s*roller)\b/i,
    securing: "roof-pipe/roller",
    storageFolder: "solutions/roof-pipe/roller",
    anchorType: "3000",
    keywords: ["roller", "pipe roller", "roller cradle"],
    recommendedDocKinds: ["sales_sheet", "data_sheet", "install_sheet"],
    ask: [ASK_MEMBRANE, ASK_WANTS],
    summary:
      "Roller pipe supports use 3000-series anchors with a roller cradle for thermal expansion in horizontal pipe runs.",
  },
  {
    key: "roof-pipe-single",
    match: /\b(single\s*pipe\s*support|single\s*cradle|single\s*pipe\s*cradle)\b/i,
    securing: "roof-pipe/single",
    storageFolder: "solutions/roof-pipe/single",
    anchorType: "3000",
    keywords: ["single pipe", "single cradle"],
    recommendedDocKinds: ["sales_sheet", "data_sheet", "install_sheet"],
    ask: [ASK_MEMBRANE, ASK_WANTS],
    summary:
      "Single pipe supports use 3000-series anchors to carry one horizontal pipe run across the roof.",
  },
  {
    key: "roof-pipe-general",
    match: /\b(roof\s*pipe|rooftop\s*pipe|pipe\s*support|conduit\s*support|refrigerant\s*line|pipe\s*run|piping\s*support)\b/i,
    securing: "roof-pipe",
    storageFolder: "solutions/roof-pipe",
    anchorType: "3000",
    keywords: ["pipe support", "conduit", "refrigerant", "pipe run"],
    recommendedDocKinds: ["sales_sheet", "data_sheet", "install_sheet"],
    ask: [ASK_MEMBRANE, ASK_WANTS],
    summary:
      "Horizontal roof pipe runs are supported using 3000-series pipe support anchors (adjustable, single, double, or roller cradle variants).",
  },

  // ----------------------------
  // Electrical disconnect
  // ----------------------------
  {
    key: "electrical-disconnect",
    match: /\b(electrical\s*disconnect|service\s*disconnect|disconnect\s*switch|electrical\s*panel\s*mount|meter\s*mount)\b/i,
    securing: "electrical-disconnect",
    storageFolder: "solutions/electrical-disconnect",
    anchorType: "2000",
    keywords: ["electrical", "disconnect", "service disconnect"],
    recommendedDocKinds: ["sales_sheet", "data_sheet", "install_sheet"],
    ask: [ASK_MEMBRANE, ASK_WANTS],
    summary:
      "Electrical disconnects are typically supported using 2000-series anchors with strut framing.",
  },

  // Keep adding the rest of your solutions the same way:
  // - securing aligns to storage folder routes
  // - include storageFolder
  // - include aliases in match/keywords when the sales language differs from the folder name
];

/* ---------------------------------------------
   Resolver
--------------------------------------------- */

import type { CanonicalSolution as _CanonicalSolution } from "./canonicalSolutions";

export function resolveCanonicalSolution(text: string): _CanonicalSolution | null {
  const t = (text || "").trim().toLowerCase();
  if (!t) return null;

  for (const s of CANONICAL_SOLUTIONS) {
    // defensive reset in case regex gets a global flag later
    s.match.lastIndex = 0;
    if (s.match.test(t)) return s;
  }

  return null;
}
