// src/app/api/rooftop/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { supabaseRoute } from "@/lib/supabase/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  DEFAULT_ROOFTOP_SYSTEM_PROMPT,
  renderRooftopSystemPrompt,
} from "@/lib/rooftop/assessmentPrompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-5-mini";

// Load the admin-editable prompt template (from /admin/rooftop-logic). Falls
// back to the built-in default if there's no override row or the service key
// isn't configured, so the audit always works.
async function loadPromptTemplate(): Promise<string> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return DEFAULT_ROOFTOP_SYSTEM_PROMPT;
  try {
    const { data } = await supabaseAdmin
      .from("rooftop_assessment_config")
      .select("system_prompt")
      .eq("id", 1)
      .maybeSingle();
    const override = String((data as { system_prompt?: string } | null)?.system_prompt || "").trim();
    return override || DEFAULT_ROOFTOP_SYSTEM_PROMPT;
  } catch {
    return DEFAULT_ROOFTOP_SYSTEM_PROMPT;
  }
}

const DT_COMPLETION_TRIGGER =
  "Your assessment is complete. I am generating your Rooftop Access Report now.";

type Msg = { role: "user" | "assistant"; content: string };

function stripJsonFences(raw: string): string {
  return raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

export async function POST(req: Request) {
  try {
    // Auth gate: the assessment is an authenticated, OpenAI-backed tool — never
    // open to anonymous callers. The client already handles a 401 by redirecting
    // to sign-in.
    const supabase = await supabaseRoute();
    const { data: auth, error: authErr } = await supabase.auth.getUser();
    if (authErr || !auth?.user) {
      return NextResponse.json(
        { message: "Please sign in to continue.", options: [], isComplete: false },
        { status: 401 }
      );
    }

    const body = await req.json();
    const messages: Msg[] = Array.isArray(body?.messages) ? body.messages : [];
    const contractorName: string = (body?.contractorName ?? "").trim();
    const companyName: string    = (body?.companyName ?? "").trim();

    const contextParts: string[] = [];
    if (messages.length > 0) {
      const transcript = messages
        .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
        .join("\n");
      contextParts.push(`Conversation so far:\n${transcript}`);
    }
    contextParts.push("Now produce the next JSON response.");

    const userPrompt = contextParts.join("\n\n");

    const template = await loadPromptTemplate();
    const systemPrompt = renderRooftopSystemPrompt(template, contractorName, companyName);

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    const response = await openai.responses.create({
      model: DEFAULT_MODEL,
      max_output_tokens: 800,
      reasoning: { effort: "minimal" },
      text: { format: { type: "text" }, verbosity: "low" },
      input: [
        { role: "system", content: [{ type: "input_text", text: systemPrompt }] },
        { role: "user",   content: [{ type: "input_text", text: userPrompt }] },
      ],
    } as any);

    const raw: string =
      (response as any).output_text ||
      (response as any).output?.find?.((o: any) => o.type === "text")?.text ||
      "";
    const cleaned = stripJsonFences(raw);

    let parsed: { message: string; options: string[]; accessType?: string | null };
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = { message: cleaned || "Something went wrong. Please try again.", options: [] };
    }

    const message: string = (parsed.message ?? "").trim();
    const options: string[] = Array.isArray(parsed.options) ? parsed.options : [];
    const isComplete = message.includes(DT_COMPLETION_TRIGGER);
    const accessType: string | null = parsed.accessType ?? null;

    return NextResponse.json({ message, options, isComplete, accessType });
  } catch (err: any) {
    console.error("ROOFTOP_API_ERROR:", err);
    return NextResponse.json(
      { message: "Server error. Please try again.", options: [], isComplete: false, error: err?.message },
      { status: 500 }
    );
  }
}
