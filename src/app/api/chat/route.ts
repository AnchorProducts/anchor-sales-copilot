// src/app/api/chat/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { resolveCanonicalSolution } from "@/lib/solutions/resolveCanonicalSolution";
import { CANONICAL_SOLUTIONS, type CanonicalSolution } from "@/lib/solutions/canonicalSolutions";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { retrieveKnowledge } from "@/lib/knowledge/retrieve";
import { maybeExtractKnowledge, maybeSummarizeSession, writeChatMessage } from "@/lib/learning/loops";
import { supabaseRoute } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RecommendedDoc = {
  title: string;
  doc_type: string;
  path: string;
  url: string | null;
  excerpt?: string;
};

type ChatMsg = { role: "user" | "assistant"; content: string };

type ChatResponse = {
  conversationId?: string;
  sessionId?: string;
  answer: string;
  foldersUsed?: string[];
  recommendedDocs?: RecommendedDoc[];
  sourcesUsed?: any[]; // optional if you later add it
  error?: string;
};

const U_ANCHORS_FOLDER = "anchor/u-anchors";
const FALLBACK_SYSTEM_PROMPT = `
You are Anchor Sales Co-Pilot for Anchor Products (commercial rooftop attachment solutions only).
Reply like a confident sales engineer. Lead with a recommendation, then explain briefly.
Ask at most one clarifying question only if it materially changes the solution.
Do NOT provide engineering calculations, spacing, loads, or code guidance.
Do NOT offer to prepare quotes or pricing. If asked, direct them to Anchor Products sales.
`.trim();
const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-5-mini";
const FALLBACK_MODEL = process.env.OPENAI_FALLBACK_MODEL || "gpt-4.1-mini";


function anchorContact() {
  return "Contact Anchor Products at (888) 575-2131 or visit anchorp.com.";
}

// ─── Storage doc fetcher ──────────────────────────────────────────────────────

function titleFromStoragePath(path: string) {
  const base = path.split("/").pop() || path;
  return base
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase())
    .trim();
}

function docTypeFromPath(path: string) {
  const p = path.toLowerCase();
  const file = (p.split("/").pop() || "").toLowerCase();
  if (file.includes("sales-sheet") || file.includes("salessheet")) return "Sales Sheet";
  if (file.includes("data-sheet") || file.includes("datasheet")) return "Data Sheet";
  if (file.includes("install-manual")) return "Install Manual";
  if (file.includes("install-sheet") || file.includes("install")) return "Install Guide";
  if (file.includes("spec")) return "Spec";
  if (file.endsWith(".dwg")) return "CAD (DWG)";
  if (file.endsWith(".stp") || file.endsWith(".step")) return "CAD (STEP)";
  return "Document";
}

function isInternalStoragePath(path: string) {
  const p = path.toLowerCase();
  return (
    p.includes("/internal/") ||
    p.startsWith("internal/") ||
    p.includes("/pricebook/") ||
    p.includes("/test/") ||
    p.includes("/test-reports/")
  );
}

function docSortPriority(path: string): number {
  const p = (path.split("/").pop() || "").toLowerCase();
  if (p.includes("sales-sheet") || p.includes("salessheet")) return 0;
  if (p.includes("install-manual")) return 1;
  if (p.includes("install-sheet") || p.includes("install")) return 2;
  if (p.includes("data-sheet") || p.includes("datasheet")) return 3;
  if (p.endsWith(".dwg") || p.endsWith(".stp") || p.endsWith(".step")) return 4;
  return 5;
}

async function fetchDocsForFolder(folder: string): Promise<RecommendedDoc[]> {
  if (!folder) return [];
  const prefix = folder.replace(/^\/+|\/+$/g, "");
  if (!prefix) return [];

  try {
    const paths = await listStorageRecursive("knowledge", prefix);
    return paths
      .filter((p) => !isInternalStoragePath(p))
      .filter((p) => /\.(pdf|dwg|stp|step|docx?)$/i.test(p))
      .sort((a, b) => docSortPriority(a) - docSortPriority(b))
      .map((path) => ({
        title: titleFromStoragePath(path),
        doc_type: docTypeFromPath(path),
        path,
        url: null,
      }));
  } catch {
    return [];
  }
}

async function listStorageRecursive(bucket: string, prefix: string): Promise<string[]> {
  const PAGE_SIZE = 1000;
  const out: string[] = [];
  const queue: string[] = [prefix];
  const seen = new Set<string>();

  while (queue.length) {
    const dir = queue.shift()!;
    if (seen.has(dir)) continue;
    seen.add(dir);

    let offset = 0;
    for (;;) {
      const { data, error } = await supabaseAdmin.storage.from(bucket).list(dir, {
        limit: PAGE_SIZE,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
      if (error || !data?.length) break;

      for (const item of data) {
        const name = String(item?.name || "").trim();
        if (!name) continue;
        const isFolder = item.id === null || (!name.includes(".") && item.metadata == null);
        const fullPath = `${dir}/${name}`;
        if (isFolder) queue.push(fullPath);
        else out.push(fullPath);
      }

      if (data.length < PAGE_SIZE) break;
      offset += PAGE_SIZE;
    }
  }

  return Array.from(new Set(out)).sort();
}

/**
 * Safer sanitizing:
 * - Remove only sentences that claim to send/email/text docs.
 * - Avoid greedy wipes that can delete the entire answer.
 */
function sanitizeAnswer(answer: string) {
  const original = (answer || "").toString();
  let a = original;

  a = a.replace(
    /[^.?!]*(\b(send|email|text)\b)[^.?!]*(\b(doc|docs|pdf|sheet|sheets)\b)[^.?!]*[.?!]/gi,
    ""
  );

  a = a.replace(/^\s*(yes|sure|absolutely|of course)\b[,\s:-]*/i, "");
  a = a.replace(/\s{2,}/g, " ").trim();

  // If sanitizing wiped the response, fall back to the original to avoid empty replies.
  return a || original.trim();
}

function containsEngineeringOutput(answer: string) {
  // Trigger only on explicit engineering specifics (numbers + units WITH engineering context).
  const text = String(answer || "");
  if (/\b(fastener\s*schedule|fastening\s*schedule|o\.?c\.?|on center)\b/i.test(text)) {
    return true;
  }
  const engineeringKeywords =
    /\b(spacing|layout|pattern|torque|fastener|schedule|design|pressure|uplift|seismic|wind)\b/i;
  const numericUnits =
    /\b\d+(\.\d+)?\s*(psf|kpa|mph|lb|lbs|lbf|ft\.?|feet|in\.?|inch|inches|mm|cm)\b/i;
  return engineeringKeywords.test(text) && numericUnits.test(text);
}

function needsEngineeringEscalation(text: string) {
  const t = String(text || "");

  // Explicit fastening/layout engineering terms
  if (/\b(spacing|layout|pattern|torque|fastener\s+schedule|fastening\s+schedule|o\.?c\.?|on\s+center)\b/i.test(t)) return true;

  // Code references
  if (/\b(ibc|asce|fm\s*\d|ul\s*\d|code\s+compliance|building\s+code)\b/i.test(t)) return true;

  // "How many anchors/fasteners/points" = engineering quantity question
  if (/how many\s+(anchors?|fasteners?|points?|attach\w*|connections?)\b/i.test(t)) return true;

  // Wind/uplift/seismic with calculation intent
  if (/\b(wind|uplift|seismic)\b/i.test(t)) {
    return /\b(calc|calculate|load|rating|psf|kpa|mph|pressure|design|resistance|capacity)\b/i.test(t);
  }

  // Load with structural context
  if (/\b(dead\s+load|live\s+load|design\s+load|uplift\s+load|wind\s+load)\b/i.test(t)) return true;

  return false;
}

function extractMembrane(text: string) {
  const t = String(text || "").toLowerCase();
  if (/\btpo\b/.test(t)) return "tpo";
  if (/\bpvc\b/.test(t)) return "pvc";
  if (/\bepdm\b/.test(t)) return "epdm";
  if (/\bkee\b/.test(t)) return "kee";
  if (/\bsbs\b/.test(t)) return "sbs";
  if (/\bapp\b/.test(t)) return "app";
  if (/\bmod(?:ified)?\s*bit\b|\bmod[-\s]?bit\b/.test(t)) return "modified bitumen";
  if (/\bsilicone\b/.test(t)) return "silicone";
  if (/\bacrylic\b/.test(t)) return "acrylic";
  return null;
}

function extractAnchorSeries(text: string) {
  const t = String(text || "").toLowerCase();
  if (/\b2000\s*series\b|\bseries\s*2000\b|\b2000s\b/.test(t)) return "2000-series";
  if (/\b3000\s*series\b|\bseries\s*3000\b|\b3000s\b/.test(t)) return "3000-series";
  const uMatch = t.match(/\bu\s?\d{3,4}\b/);
  return uMatch ? uMatch[0].replace(/\s+/g, "") : null;
}

function extractMountSurface(text: string) {
  const t = String(text || "").toLowerCase();
  const mentionsWall = /\b(wall|parapet|vertical)\b/.test(t);
  const mentionsRoof = /\b(roof|rooftop)\b/.test(t);
  if (mentionsWall && !mentionsRoof) return "wall";
  if (mentionsRoof) return "roof";
  return null;
}

function extractCondition(text: string) {
  const t = String(text || "").toLowerCase();
  if (/\b(existing|retrofit|re[-\s]?secure|re[-\s]?tie|tie[-\s]?down)\b/.test(t)) return "existing / re-secure";
  if (/\bnew|new install\b/.test(t)) return "new install";
  return null;
}

function buildConversationMemory(userText: string) {
  // Only use explicit user-provided details for memory.
  const membrane = extractMembrane(userText);
  const anchorSeries = extractAnchorSeries(userText);
  const mountSurface = extractMountSurface(userText);
  const condition = extractCondition(userText);

  const mem: Record<string, string> = {};
  if (membrane) mem.membrane = membrane.toUpperCase();
  if (anchorSeries) mem.anchor_series = anchorSeries;
  if (mountSurface) mem.mount_surface = mountSurface;
  if (condition) mem.condition = condition;

  return mem;
}

function findCanonicalSolutionByFolder(folderHint?: string | null): CanonicalSolution | null {
  if (!folderHint) return null;
  const clean = String(folderHint).replace(/^solutions\//, "").trim();
  return (
    CANONICAL_SOLUTIONS.find((s) => s.storageFolder === folderHint) ||
    CANONICAL_SOLUTIONS.find((s) => s.securing === clean) ||
    null
  );
}

function humanizeSolutionLabel(folderHint?: string | null, solution?: CanonicalSolution | null) {
  const key = solution?.securing || String(folderHint || "").replace(/^solutions\//, "");
  const map: Record<string, string> = {
    "hvac": "mechanical tie-down / HVAC securement",
    "guy-wire-kit": "guy wire tie-down",
    "pipe-frame/attached": "attached pipe-frame (roof-mounted H-frame)",
    "pipe-frame/existing": "existing pipe-frame tie-down",
    "duct-securement": "duct securement",
    "roof-box": "roof box",
    "wall-box": "wall box",
    "equipment-screen": "equipment screen / signage",
    "signage": "equipment screen / signage",
    "lightning": "lightning protection attachment",
    "light-mount": "light mount",
    "camera-mount": "camera mount",
    "antenna": "antenna mount",
    "satellite-dish": "satellite dish mount",
    "weather-station": "weather station mount",
    "roof-guardrail": "roof guardrail",
    "wall-guardrail": "wall guardrail",
    "roof-ladder": "roof ladder",
    "roof-pipe": "roof pipe support",
    "roof-pipe/adjustable": "adjustable roof pipe support",
    "roof-pipe/double": "double roof pipe support",
    "roof-pipe/roller": "roller roof pipe support",
    "roof-pipe/single": "single roof pipe support",
    "elevated-stack/roof-stack": "roof stack",
    "elevated-stack/wall-stack": "wall stack",
    "elevated-stack": "elevated stack",
    "snow-retention/2-pipe-snow-fence": "2-pipe snow fence",
    "snow-retention/unitized-snow-fence": "unitized snow fence",
    "snow-retention": "snow retention",
    "solar": "solar racking attachment",
  };

  return map[key] || "rooftop attachment solution";
}

function ensureNonEmptyAnswer(params: {
  answer: string;
  userText: string;
  transcript?: string;
  folderHint?: string | null;
  solution?: CanonicalSolution | null;
}) {
  let a = String(params.answer || "").trim();

  // Minimal non-empty safeguard only; no templated fallback.
  if (!a) {
    return "I’m not getting a response from the model right now. Please try again.";
  }

  return a;
}

function normalizeBulletSpacing(answer: string) {
  let a = String(answer || "");
  // Ensure bullets start on their own line.
  a = a.replace(/([^\n])\s*•\s+/g, "$1\n• ");
  // Normalize common hyphen bullets to "•" and put them on new lines.
  a = a.replace(/([^\n])\s*-\s+/g, "$1\n• ");
  // Ensure a blank line before the first bullet list for readability.
  a = a.replace(/([^\n])\n(•\s+)/g, "$1\n\n$2");
  // Ensure a blank line between recommendation and bullet list when bullets exist.
  a = a.replace(/([^\n])\n\n(•\s+)/g, "$1\n\n$2");
  // Collapse accidental double spaces.
  a = a.replace(/[ \t]{2,}/g, " ");
  return a.trim();
}

/**
 * Robustly extract text from OpenAI Responses API output.
 */
function extractResponsesText(resp: any): string {
  const direct = (resp?.output_text || "").toString().trim();
  if (direct) return direct;

  const pieces: string[] = [];
  const output = Array.isArray(resp?.output) ? resp.output : [];

  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const c of content) {
      // most common: { type: "output_text", text: "..." }
      if (typeof c?.text === "string" && c.text.trim()) pieces.push(c.text.trim());
      else if (typeof c?.value === "string" && c.value.trim()) pieces.push(c.value.trim());
      else if (typeof c?.refusal === "string" && c.refusal.trim()) pieces.push(c.refusal.trim());
    }
  }

  return pieces.join("\n").trim();
}

// ─── Decision Tree system prompt ─────────────────────────────────────────────
const DT_SYSTEM_PROMPT = `
You are the Anchor Products Rooftop Access & Egress Decision Tree assistant.
Your job is to guide commercial roofing contractors through a structured
safety verification process based on OSHA 1910.23 compliance and Anchor
Products' access/egress product line at anchorp.com.

Rules:
- The contractor's name and company are already known from their account registration and will be provided to you. Do not ask for this information.
- Ask ONE question at a time. Do not list all questions upfront.
- Be conversational but precise. Use plain language, not legal jargon.
- When a compliance gap is identified, clearly flag it with ⚠️ and briefly explain the OSHA requirement.
- After the user states their access type (ladder, hatch, or stairwell), work through the appropriate question sequence below.
- When all questions are complete, summarize compliance status, list any ⚠️ flags, and recommend relevant Anchor Products categories from anchorp.com: Safety, Rooftop Accessories, MEP/HVAC, Communications, Solar.
- End with exactly this message: “Your assessment is complete. I am generating your Rooftop Access Report now.”
- Do not discuss anything outside rooftop access safety and Anchor Products.

LADDER QUESTIONS (ask in order):
1. Is the ladder fixed or portable?
2. Is the ladder 24 ft or taller?
3. If yes to #2: Is a Personal Fall Arrest System or ladder safety system (cable or rail) present? Note that cages are no longer acceptable for new installations per OSHA 1910.23.
4. Does the ladder extend at least 3 ft above the roof edge?
5. Is there a secure handhold or grab bar at the roof transition point?
6. Is the parapet at least 42 inches at the transition? If no, flag that a self-retracting lifeline, temporary guardrail, or anchor point may be required.
7. Are any environmental hazards present — ice, bird droppings, rust, heat sources near the ladder?
8. Is a written roof access policy and fall protection plan in place?

HATCH QUESTIONS (ask in order):
1. What is the hatch opening size? Is it at least 30 inches by 36 inches?
2. Does the hatch cover open smoothly and have an automatic hold-open device?
3. Is there a fixed ladder leading to the hatch?
4. If yes to #3: Are rung width at least 16 inches, rung spacing 10 to 14 inches, and the ladder free of corrosion and loose fasteners?
5. Is the ladder 24 ft or taller? If yes, is a ladder safety system or PFAS present? Cages no longer acceptable.
6. Are grab bars present that extend at least 42 inches above the hatch?
7. Is there a hatch guardrail system with a self-closing gate? If no, flag that a temporary guardrail, SRL, or anchor point may be required.
8. Are environmental hazards present — condensation, rust, HVAC exhaust?
9. If a PFAS is in use, is a rescue plan documented?

STAIRWELL QUESTIONS (ask in order):
1. Is the stairwell clear width at least 22 inches?
2. Are riser heights uniform and no more than 9.5 inches?
3. Are tread depths uniform and at least 9.5 inches?
4. Are handrails present on all stairways with 4 or more risers?
5. Is handrail height between 30 and 38 inches?
6. At the roof exit point, is there a guardrail or parapet at least 42 inches?
7. Is the unprotected roof edge within 15 ft of the stairwell exit? If yes, flag that fall protection is required under OSHA §1910.28.
8. Are there any obstructions in the stair path or at the landing?
`.trim();

// “Custom GPT” rules as one system prompt
const SYSTEM_PROMPT = `
You are the Anchor Products Sales Co-Pilot — an expert sales associate for Anchor Products, a commercial rooftop attachment manufacturer.

YOUR ROLE:
You help sales reps and contractors find the right Anchor solution for their job. You speak like a seasoned Anchor sales rep who knows the product line inside and out: confident, direct, and practical. You are a sales expert, not an engineer.

MEMBRANE-ONLY RESTRICTION — CRITICAL:
Anchor Products ONLY manufactures attachment solutions for membrane-covered commercial roofs. Supported membranes: TPO, PVC, EPDM, KEE, APP, SBS, SBS-torch, silicone coatings, acrylic coatings.
- If the user mentions a non-membrane roof type (metal panels, standing seam, asphalt shingles, concrete, tile, gravel/ballasted built-up without a membrane, wood shake, etc.), politely explain that Anchor Products only supports membrane-covered roofs and ask if there is a membrane system over it or if they are working with a different roof type.
- Do NOT try to recommend a solution for a non-membrane roof. Redirect them to contact Anchor Products at (888) 575-2131 or anchorp.com if they need help determining compatibility.

WHAT YOU DO:
- Recommend the correct Anchor attachment solution based on what’s being secured and the roof membrane type.
- Explain Anchor product families (2000-series, 3000-series, guy wire kits) and when each is used.
- Clarify naming conventions — customers describe the same solution in many ways, and you know them all.
- Ask clarifying questions whenever you need more information to give a good recommendation. You can ask more than one question if needed — just ask them naturally, not as a numbered list all at once.

WHAT YOU DO NOT DO — ENGINEERING BOUNDARY:
- Do NOT provide load calculations, uplift ratings, wind pressure values, seismic design, or structural analysis.
- Do NOT provide spacing, layout, patterns, fastening schedules, torque values, or anchor quantities for a given area.
- Do NOT interpret or apply building codes (IBC, ASCE, FM, UL, OSHA structural requirements).
- Do NOT give advice on how many anchors are needed for a specific span or area — that is an engineering question.
- When any engineering question comes up, respond warmly and redirect: “That’s an engineering question — the Anchor Products team can help you there. Give them a call at (888) 575-2131 or visit anchorp.com.” Then briefly explain what you can help with.
- Do NOT offer to prepare quotes, pricing, or submittals. If asked: “For pricing, reach out to Anchor Products at (888) 575-2131 or anchorp.com.”
- Do NOT offer to send, email, or provide documents — direct users to the Asset Management tool in this app.

TONE & STYLE:
- Sound like a knowledgeable sales rep who’s helped thousands of contractors — confident, direct, and genuinely helpful.
- Give people the information they need. Don’t pad responses, don’t hedge, don’t repeat back what they already told you.
- Write naturally. Use a conversational tone, not a rigid template. Use bullet points when listing components or options, but don’t force them into every response — sometimes a clear paragraph is better.

PRODUCT RULES:
- Every Anchor solution is available for every supported membrane type. Identify the solution from what’s being secured first. Do NOT ask about membrane type until after the solution is confirmed and documents have been surfaced. Membrane is only needed to name the specific anchor model.
- Never assume a membrane type. Only reference it if the user explicitly stated it.
- Guy wire kits use ONLY 2000-series anchors. All guy wire applications are tie-down solutions.
- Anchor bases are manufactured from the specified membrane material. Coatings are custom anchor colors.
- Use conversation context — if the user already said “TPO roof,” do not re-ask for it.
- If the user asks for specs, manuals, or CAD files, direct them to the Asset Management tool in this app.
- Treat any “Conversation memory” block as confirmed facts and do not re-ask for those details.

CRITICAL — STACKS vs. PIPES (do not confuse these):
- STACKS are VERTICAL: exhaust stacks, vent pipes, flue pipes, or any pipe rising straight up from the roof. These are secured with a guy wire tie-down kit and 2000-series anchors.
- PIPES are HORIZONTAL: conduit, refrigerant lines, or any pipe running laterally across the roof surface. These are supported with 3000-series pipe support anchors (adjustable, single, double, or roller cradle variants). They are NOT a tie-down application.
- If someone says “rooftop pipe” or “pipe on the roof” without specifying direction, ask whether the pipe runs horizontally across the roof or rises vertically.

--------------------------------------------------
ANCHOR SOLUTION MAPPING & NAMING CONVENTIONS
--------------------------------------------------

Solar
- Common names: solar, PV, photovoltaic, solar panels, racking
- Typical solution: 2000-series anchors with strut framing
- Securing: solar

Snow Retention
- 2-Pipe Snow Fence
  - Also called: two-pipe snow fence
  - 2000-series anchors, piping, splices
  - Securing: snow-retention/2-pipe-snow-fence
- Unitized Snow Fence
  - Also called: snow fence panels, unitized fence
  - 3000-series anchors with rigid fence panels
  - Securing: snow-retention/unitized-snow-fence

Roof-Mounted Box
- Also called: rooftop enclosure, equipment box
- 2000-series anchors with strut framing
- Securing: roof-box

Wall-Mounted Box
- Also called: parapet box, wall enclosure
- 3000-series anchors with strut framing
- Securing: wall-box

Electrical Disconnect
- Also called: electrical box, service disconnect
- 2000-series anchors with strut framing
- Securing: electrical-disconnect

Horizontal Roof Pipe Support (PIPES — runs across the roof laterally)
- Also called: pipe supports, rooftop piping, conduit support, refrigerant line support
- HORIZONTAL pipes only — do NOT use this for vertical stacks
- 3000-series pipe support anchors (adjustable, single, double, or roller cradle variants)
- Securing: roof-pipe

Roof-Mounted H-Frame
- Also called: attached pipe frame, roof-mounted H-frame
- 3000-series anchors with strut framing
- Securing: pipe-frame/attached

Existing Horizontal Pipe Frame or Duct (re-secure)
- Also called: existing frame, re-secure, retrofit
- HORIZONTAL pipe frames or duct runs being re-secured
- Guy wire kit with 2000-series anchors
- Tie-down solution
- Securing: pipe-frame/existing or duct-securement

Existing Mechanical Equipment (HVAC) Tie-Down
- Also called: hvac tie-down, rtu tie-down, mechanical tie-down
- Guy wire kit with 2000-series anchors
- Tie-down solution
- Securing: hvac

Guardrails
- Roof-Mounted Guardrail
  - 3000-series anchors
  - Securing: roof-guardrail
- Wall-Mounted Guardrail
  - 3000-series anchors
  - Securing: wall-guardrail

Roof Ladder
- 3000-series anchors with adjustable strut bracket
- Securing: roof-ladder

Weather Stations
- Also called: rooftop sensors, monitoring stations
- Guy wire kit with 2000-series anchors
- Tie-down solution
- Securing: weather-station

Satellite Dish
- Also called: dish, satellite antenna
- 2000-series anchors
- Securing: satellite-dish

Antenna
- Also called: communication antenna, RF antenna
- Guy wire kit with 2000-series anchors
- Tie-down solution
- Securing: antenna

Equipment Screen
- Also called: rooftop screen, visual screen, windscreen
- 2000-series anchors with strut framing
- Securing: equipment-screen

Signage
- Also called: rooftop sign, branded signage
- 2000-series anchors
- Securing: signage

Light Mount
- Also called: lighting mount, area light, flood light
- 3000-series anchors
- Securing: light-mount

Camera Mount
- Also called: security camera, surveillance camera, cameras
- 3000-series anchors
- Securing: camera-mount

Elevated Stack (STACKS — vertical pipes rising from the roof)
- Also called: exhaust stack, vent stack, flue pipe, vertical stack, roof stack
- VERTICAL pipes only — do NOT use this for horizontal pipe runs
- Roof-Mounted Elevated Stack
  - Guy wire kit with 2000-series anchors
  - Tie-down solution
  - Securing: elevated-stack/roof-stack
- Wall-Mounted Elevated Stack
  - 2000-series anchors with strut framing
  - Securing: elevated-stack/wall-stack

Lightning Protection
- Also called: lightning arrestor, lightning rod system
- 2000-series anchors
- Securing: lightning

--------------------------------------------------
FINAL BEHAVIOR
--------------------------------------------------

- Identify the solution from what’s being secured before asking anything else.
- Only ask about membrane type AFTER the solution is identified and confirmed.
- If “pipe” is mentioned without context, ask whether it runs horizontally or vertically before recommending.
- Recognize multiple names for the same solution.
- Always keep responses aligned with Anchor Products’ real-world practices and product families.

`.trim();

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));

    // ── Decision Tree mode — completely separate path ─────────────────────────
    if (body?.mode === "decision_tree") {
      const incoming: ChatMsg[] = Array.isArray(body?.messages)
        ? body.messages
            .filter((m: any) => m?.role && m?.content)
            .map((m: any) => ({ role: m.role, content: String(m.content || "") }))
        : [];

      const lastUser = [...incoming].reverse().find((m) => m.role === "user")?.content?.trim() || "";

      if (!lastUser) {
        return NextResponse.json({
          answer: "How are you currently accessing the roof? Please type ladder, hatch, or stairwell.",
          foldersUsed: [],
          recommendedDocs: [],
          sessionId: body?.sessionId || undefined,
        } satisfies ChatResponse);
      }

      if (!process.env.OPENAI_API_KEY) {
        return NextResponse.json(
          { answer: "Server configuration error.", error: "Missing OPENAI_API_KEY", foldersUsed: [], recommendedDocs: [] } satisfies ChatResponse,
          { status: 500 }
        );
      }

      const contractorName = (body?.contractorName ?? "").trim();
      const companyName    = (body?.companyName ?? "").trim();
      const contractorContext = contractorName
        ? `Contractor information (from account registration — do not ask the user for this):\n- Name: ${contractorName}${companyName ? `\n- Company: ${companyName}` : ""}`
        : "";

      const transcript = incoming.map((m) => `${m.role}: ${m.content}`).join("\n");

      const dtUserPrompt = [
        contractorContext,
        `Conversation so far:\n${transcript}`,
        `Now respond to the user’s latest message.`,
      ].filter(Boolean).join("\n\n");

      const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

      const dtResp = await openai.responses.create({
        model: DEFAULT_MODEL,
        max_output_tokens: 800,
        reasoning: { effort: "minimal" },
        text: { format: { type: "text" }, verbosity: "low" },
        input: [
          {
            role: "system",
            content: [{ type: "input_text", text: DT_SYSTEM_PROMPT }],
          },
          {
            role: "user",
            content: [{ type: "input_text", text: dtUserPrompt }],
          },
        ],
      });

      const dtRaw = extractResponsesText(dtResp);
      const dtAnswer = normalizeBulletSpacing(dtRaw.trim()) ||
        "I didn’t receive a response. Please try again.";

      return NextResponse.json({
        answer: dtAnswer,
        foldersUsed: [],
        recommendedDocs: [],
        sessionId: body?.sessionId || undefined,
      } satisfies ChatResponse);
    }
    // ── End Decision Tree mode ────────────────────────────────────────────────

    const incoming: ChatMsg[] = Array.isArray(body?.messages)
      ? body.messages
          .filter((m: any) => m?.role && m?.content)
          .map((m: any) => ({
            role: m.role,
            content: String(m.content || ""),
          }))
      : [];

    const lastUser =
      [...incoming].reverse().find((m) => m.role === "user")?.content?.trim() || "";

    if (!lastUser) {
      return NextResponse.json({
        answer:
          "Tell me what you’re securing and I’ll recommend the right Anchor solution.",
        foldersUsed: [U_ANCHORS_FOLDER],
        recommendedDocs: [],
      } satisfies ChatResponse);
    }

    // engineering escalation (log only; still call OpenAI every time)
    const preEscalate = needsEngineeringEscalation(lastUser);
    if (process.env.LOG_ESCALATION === "true") {
      console.info("[chat] escalation precheck", {
        preEscalate,
        lastUser: lastUser.slice(0, 280),
        model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
      });
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        {
          answer: "Server configuration error.",
          error: "Missing OPENAI_API_KEY",
          foldersUsed: [U_ANCHORS_FOLDER],
          recommendedDocs: [],
        } satisfies ChatResponse,
        { status: 500 }
      );
    }

    const userOnlyText = incoming
      .filter((m) => m.role === "user")
      .map((m) => m.content)
      .join("\n");
    const intentText = `${userOnlyText}\n${lastUser}`;

    // Pre-resolve from user text (helps the prompt but docs resolved after AI responds)
    const preFolder = resolveCanonicalSolution(intentText) || undefined;
    const memory = buildConversationMemory(userOnlyText);
    const memoryBlock =
      Object.keys(memory).length > 0
        ? `Conversation memory (confirmed facts):\n${Object.entries(memory)
            .map(([k, v]) => `- ${k}: ${v}`)
            .join("\n")}`
        : "";

    const transcript = incoming.map((m) => `${m.role}: ${m.content}`).join("\n");

    // ── RAG: pull relevant knowledge chunks from past interactions ────────────
    let knowledgeBlock = "";
    try {
      const chunks = await retrieveKnowledge(supabaseAdmin, intentText, { matchCount: 5 });
      const useful = chunks.filter((c) => c.similarity > 0.75);
      if (useful.length > 0) {
        knowledgeBlock =
          "Relevant knowledge from previous sales interactions (use to inform your answer):\n" +
          useful.map((c, i) => `[${i + 1}] ${c.content.trim()}`).join("\n\n");
      }
    } catch {
      // non-fatal — proceed without knowledge context
    }

    const userPrompt = [
      preFolder ? `Detected solution context: ${preFolder}` : "",
      memoryBlock,
      knowledgeBlock,
      `Conversation so far:\n${transcript}`,
      `If the user asks for documents, manuals, or specs, direct them to the Asset Management tool.`,
      `Now answer the user's latest message.`,
    ]
      .filter(Boolean)
      .join("\n\n");

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const resp = await openai.responses.create({
      model: DEFAULT_MODEL,
      max_output_tokens: 650,
      reasoning: { effort: "minimal" },
      text: { format: { type: "text" }, verbosity: "low" },
      input: [
        {
          role: "system",
          content: [{ type: "input_text", text: SYSTEM_PROMPT }],
        },
        {
          role: "user",
          content: [{ type: "input_text", text: userPrompt }],
        },
      ],
    });
    const extractedPrimary = extractResponsesText(resp);
    let answer = sanitizeAnswer(extractedPrimary);

    // guardrail
    const postEscalate = containsEngineeringOutput(answer);
    if (process.env.LOG_ESCALATION === "true") {
      console.info("[chat] escalation postcheck", { postEscalate, answer: answer.slice(0, 280) });
    }
    if (postEscalate || preEscalate) {
      answer = `That's an engineering question — for load calculations, spacing, and code compliance, the Anchor Products team can help you directly. Give them a call at (888) 575-2131 or visit anchorp.com.\n\nIn the meantime, I'm happy to help you identify the right product family or solution type for the job.`;
    }

    if (!answer) {
      const retry = await openai.responses.create({
        model: DEFAULT_MODEL,
        max_output_tokens: 650,
        reasoning: { effort: "minimal" },
        text: { format: { type: "text" }, verbosity: "low" },
        input: [
          { role: "system", content: [{ type: "input_text", text: FALLBACK_SYSTEM_PROMPT }] },
          { role: "user", content: [{ type: "input_text", text: `Conversation:\n${transcript}\n\nUser: ${lastUser}` }] },
        ],
      });
      answer = sanitizeAnswer(extractResponsesText(retry));
    }

    if (!answer) {
      const fallback = await openai.responses.create({
        model: FALLBACK_MODEL,
        max_output_tokens: 650,
        reasoning: { effort: "minimal" },
        text: { format: { type: "text" }, verbosity: "low" },
        input: [
          { role: "system", content: [{ type: "input_text", text: SYSTEM_PROMPT }] },
          { role: "user", content: [{ type: "input_text", text: userPrompt }] },
        ],
      });
      answer = sanitizeAnswer(extractResponsesText(fallback));
    }

    answer = ensureNonEmptyAnswer({ answer, userText: lastUser, transcript, folderHint: preFolder, solution: findCanonicalSolutionByFolder(preFolder) });
    answer = normalizeBulletSpacing(answer);

    // ── Learning loop: persist messages + extract knowledge (fire-and-forget) ─
    try {
      const supa = await supabaseRoute();
      const { data: { user } } = await supa.auth.getUser();
      const uid = user?.id;
      const sid = body?.sessionId || body?.conversationId || null;
      if (uid && sid) {
        // Write both turns to chat_messages so extraction loop has material to work with
        writeChatMessage(supabaseAdmin, uid, sid, "user", lastUser).catch(() => {});
        writeChatMessage(supabaseAdmin, uid, sid, "assistant", answer).catch(() => {});
        // Periodically summarize + extract reusable knowledge (non-blocking)
        maybeSummarizeSession(supabaseAdmin, uid, sid).catch(() => {});
        maybeExtractKnowledge(supabaseAdmin, uid, sid).catch(() => {});
      }
    } catch {
      // non-fatal — never block the response
    }

    // ── Resolve docs: user text first, then combined with AI answer ──────────
    // Use preFolder (user-only) as the primary trigger so docs appear on the
    // first message that matches a solution — no confirmation needed.
    // Fall back to combined text (user + AI answer) to pick up cases where the
    // AI names a solution the user didn't spell out explicitly.
    const combinedText = `${intentText}\n${answer}`;
    const folderHint = preFolder || resolveCanonicalSolution(combinedText) || undefined;
    const recommendedDocs = folderHint ? await fetchDocsForFolder(folderHint) : [];

    return NextResponse.json({
      answer,
      foldersUsed: [U_ANCHORS_FOLDER, ...(folderHint ? [folderHint] : [])],
      recommendedDocs,
      sessionId: body?.sessionId || undefined,
      conversationId: body?.conversationId || undefined,
    } satisfies ChatResponse);
  } catch (e: any) {
    return NextResponse.json(
      {
        answer: "Something went wrong. Please try again.",
        error: e?.message || "Unknown error",
        foldersUsed: [U_ANCHORS_FOLDER],
        recommendedDocs: [],
      } satisfies ChatResponse,
      { status: 500 }
    );
  }
}
