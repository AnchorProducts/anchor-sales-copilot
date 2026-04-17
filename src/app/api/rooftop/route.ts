// src/app/api/rooftop/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-5-mini";

const SYSTEM_PROMPT = `
You are the Anchor Products Rooftop Access & Egress Decision Tree assistant.
Guide commercial roofing contractors through OSHA 1910.23 compliance verification.

CRITICAL RULE: You MUST respond with valid JSON only — no markdown fences, no extra text, nothing else.
Format:
{
  "message": "Your message or question",
  "options": ["Option A", "Option B"]
}

RULES:
- Ask exactly ONE question per response.
- When a compliance issue exists, prefix the relevant sentence with ⚠️ and briefly cite the OSHA requirement.
- options must always be a non-empty array EXCEPT when the assessment is fully complete.
- When the assessment is complete: set options to [] and end message with exactly:
  "Your assessment is complete. I am generating your Rooftop Access Report now."
- Do not discuss anything outside rooftop access safety and Anchor Products.

OPENING (first response, no prior messages):
Ask which access type they use.
options: ["Ladder", "Hatch", "Stairwell"]

LADDER QUESTIONS (ask in order after access type confirmed):
1. Is the ladder fixed or portable?
   options: ["Fixed", "Portable"]
2. Is the ladder 24 ft or taller?
   options: ["Yes", "No"]
3. (If yes to #2) Is a ladder safety system (cable or rail) or Personal Fall Arrest System present? Note: cages are no longer acceptable for new installations per OSHA 1910.23.
   options: ["Yes", "No"]
   (If no to #2, skip this question)
4. Does the ladder extend at least 3 ft above the roof edge?
   options: ["Yes", "No"]
5. Is there a secure handhold or grab bar at the roof transition point?
   options: ["Yes", "No"]
6. Is the parapet at least 42 inches at the transition point?
   options: ["Yes", "No"]
7. Are any environmental hazards present?
   options: ["Ice / frost", "Bird droppings", "Rust / corrosion", "Heat sources nearby", "None of these"]
8. Is a written roof access policy and fall protection plan in place?
   options: ["Yes", "No"]
Then provide a compliance summary (flag any ⚠️ issues), recommend relevant Anchor Products categories (Safety, Rooftop Accessories, MEP/HVAC, Communications, Solar from anchorp.com), set options to [], and end with the completion phrase.

HATCH QUESTIONS (ask in order):
1. Is the hatch opening at least 30 × 36 inches?
   options: ["Yes", "No"]
2. Does the hatch cover open smoothly and have an automatic hold-open device?
   options: ["Yes", "No"]
3. Is there a fixed ladder leading to the hatch?
   options: ["Yes", "No"]
4. (If yes to #3) Are rung width ≥16 in, rung spacing 10–14 in, and free of corrosion?
   options: ["Yes", "No"]
   (If no to #3, skip)
5. Is the ladder 24 ft or taller?
   options: ["Yes", "No"]
6. (If yes to #5) Is a ladder safety system or PFAS present? Cages no longer acceptable.
   options: ["Yes", "No"]
   (If no to #5, skip)
7. Are grab bars present extending at least 42 inches above the hatch?
   options: ["Yes", "No"]
8. Is there a hatch guardrail system with a self-closing gate?
   options: ["Yes", "No"]
9. Are environmental hazards present?
   options: ["Condensation", "Rust / corrosion", "HVAC exhaust nearby", "None of these"]
Then summarize, recommend Anchor categories, set options to [], end with completion phrase.

STAIRWELL QUESTIONS (ask in order):
1. Is the stairwell clear width at least 22 inches?
   options: ["Yes", "No"]
2. Are riser heights uniform and no more than 9.5 inches?
   options: ["Yes", "No"]
3. Are tread depths uniform and at least 9.5 inches?
   options: ["Yes", "No"]
4. Are handrails present on all stairways with 4 or more risers?
   options: ["Yes", "No"]
5. Is handrail height between 30 and 38 inches?
   options: ["Yes", "No"]
6. At the roof exit point, is there a guardrail or parapet at least 42 inches?
   options: ["Yes", "No"]
7. Is the unprotected roof edge within 15 ft of the stairwell exit?
   options: ["Yes", "No"]
8. Are there any obstructions in the stair path or at the landing?
   options: ["Yes", "No"]
Then summarize, recommend Anchor categories, set options to [], end with completion phrase.
`.trim();

const DT_COMPLETION_TRIGGER =
  "Your assessment is complete. I am generating your Rooftop Access Report now.";

type Msg = { role: "user" | "assistant"; content: string };

function stripJsonFences(raw: string): string {
  return raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const messages: Msg[] = Array.isArray(body?.messages) ? body.messages : [];
    const contractorName: string = (body?.contractorName ?? "").trim();
    const companyName: string    = (body?.companyName ?? "").trim();

    // Build context preamble so the AI knows who it's talking to
    const contextParts: string[] = [];
    if (contractorName || companyName) {
      contextParts.push(
        `Contractor on this session (from their account — do not ask for this info):` +
        (contractorName ? `\n- Name: ${contractorName}` : "") +
        (companyName    ? `\n- Company: ${companyName}` : "")
      );
    }
    if (messages.length > 0) {
      const transcript = messages
        .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
        .join("\n");
      contextParts.push(`Conversation so far:\n${transcript}`);
    }
    contextParts.push("Now produce the next JSON response.");

    const userPrompt = contextParts.join("\n\n");

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const response = await openai.responses.create({
      model: DEFAULT_MODEL,
      max_output_tokens: 800,
      reasoning: { effort: "minimal" },
      text: { format: { type: "text" }, verbosity: "low" },
      input: [
        { role: "system", content: [{ type: "input_text", text: SYSTEM_PROMPT }] },
        { role: "user",   content: [{ type: "input_text", text: userPrompt }] },
      ],
    } as any);

    const raw: string =
      (response as any).output_text ||
      (response as any).output?.find?.((o: any) => o.type === "text")?.text ||
      "";
    const cleaned = stripJsonFences(raw);

    let parsed: { message: string; options: string[] };
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      // Fallback: treat entire output as message with no options
      parsed = { message: cleaned || "Something went wrong. Please try again.", options: [] };
    }

    const message: string = (parsed.message ?? "").trim();
    const options: string[] = Array.isArray(parsed.options) ? parsed.options : [];
    const isComplete = message.includes(DT_COMPLETION_TRIGGER);

    return NextResponse.json({ message, options, isComplete });
  } catch (err: any) {
    console.error("ROOFTOP_API_ERROR:", err);
    return NextResponse.json(
      { message: "Server error. Please try again.", options: [], isComplete: false, error: err?.message },
      { status: 500 }
    );
  }
}
