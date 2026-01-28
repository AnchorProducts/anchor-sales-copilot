// src/app/api/chat/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { supabaseRoute } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* ---------------------------------------------
   Types
--------------------------------------------- */

type RecommendedDoc = {
  title: string;
  doc_type: string;
  path: string;
  url: string | null;
};

type SiteSnippet = {
  title: string;
  url: string;
  excerpt: string;
};

type ChatResponse = {
  conversationId?: string;
  answer: string; // can be empty for docs-only
  foldersUsed?: string[];
  recommendedDocs?: RecommendedDoc[];
  siteSnippets?: SiteSnippet[];
  error?: string;
};

/* ---------------------------------------------
   Helpers
--------------------------------------------- */

function getOrigin(req: Request) {
  const h = req.headers;
  const proto = h.get("x-forwarded-proto") || "https";
  const host = h.get("x-forwarded-host") || h.get("host");
  return host ? `${proto}://${host}` : new URL(req.url).origin;
}

function extractUserText(body: any, messages: Array<{ role: string; content: string }>) {
  const lastUser = [...messages].reverse().find((m) => m?.role === "user");
  return (
    (lastUser?.content ?? "").toString().trim() ||
    (body?.message ?? "").toString().trim() ||
    (body?.input ?? "").toString().trim() ||
    (body?.text ?? "").toString().trim() ||
    (body?.q ?? "").toString().trim()
  );
}

function mergeDocsUniqueByPath(...lists: RecommendedDoc[][]) {
  const out: RecommendedDoc[] = [];
  const seen = new Set<string>();
  for (const list of lists) {
    for (const d of list || []) {
      const key = (d?.path || "").toString();
      if (!key) continue;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(d);
    }
  }
  return out;
}

function looksLikeDocsOnlyRequest(text: string) {
  const t = (text || "").toLowerCase().trim();
  if (!t) return false;

  const docNouns =
    /\b(doc|docs|document|documents|pdf|file|files|sheet|sheets|sales\s*sheet|data\s*sheet|submittal|spec|specs|manual|installation|install|instructions|cad|dwg|step|stp|drawing|drawings|details)\b/;

  const advisory =
    /\b(how|why|difference|compare|recommend|which|best|should i|what do i|help me choose|tell me about|explain)\b/;

  return docNouns.test(t) && !advisory.test(t);
}

function isUAnchorIntent(text: string) {
  const t = (text || "").toLowerCase();
  return /\bu[-\s]?anchor(s)?\b/.test(t);
}

function isClearlyNotUAnchor(text: string) {
  const t = (text || "").toLowerCase();
  if (isUAnchorIntent(t)) return false;

  // Keep strict for “U-Anchors only” phase
  const other =
    /\b(snow\s*fence|2pipe|two\s*pipe|guy\s*wire|elevated\s*stacks?|walkway|screen|dunnage|pipe\s*support|smoke\s*stack|exhaust\s*stack)\b/i;

  return other.test(t);
}

/**
 * Engineering escalation:
 * Only trigger on explicit numbers/spacing/load/code/calc asks.
 * IMPORTANT: Do not include generic “code” alone.
 */
function needsEngineeringEscalation(text: string) {
  const t = (text || "").toLowerCase();

  const qtySpacing =
    /\b(how\s+many|quantity|qty|count|number\s+of|spacing|pattern|layout|o\.?c\.?|on\s*center)\b/i;

  const loadsCalcs =
    /\b(load|loads|uplift|wind|seismic|psf|kpa|kip|lbs|pounds|newton|calculation|calc|calculate|sizing|size\s+it)\b/i;

  const codeCompliance =
    /\b(code\s*compliance|compliant|meets\s+code|ibc|asce|fm\s*global|ul\s*(listed|classified)?|approval|approved|pe\s*stamp|stamped|sealed)\b/i;

  return qtySpacing.test(t) || loadsCalcs.test(t) || codeCompliance.test(t);
}

function anchorContactBlock() {
  return "Please contact Anchor Products at (888) 575-2131 or online at anchorp.com.";
}

function engineeringEscalationAnswer() {
  return [
    "For final design, sizing, quantities/spacing, loads, or code/compliance questions, this needs Anchor Engineering review.",
    anchorContactBlock(),
  ].join("\n");
}

/**
 * Detect “templatey” answers so we can rewrite them conversationally.
 * This is intentionally heuristic.
 */
function looksTemplated(answer: string) {
  const a = (answer || "").trim();
  if (!a) return false;

  const startsWithHeading =
    /^u-anchors\b/i.test(a) ||
    /^u anchors\b/i.test(a) ||
    /^\*\*u-anchors\*\*/i.test(a) ||
    /^what they are/i.test(a);

  const hasSectionLabels =
    /\b(applications|benefits|components|typical applications|sales view|main components|when to choose)\b/i.test(a);

  const bulletHeavy = (a.match(/^\s*[-•]/gm) || []).length >= 6;

  return startsWithHeading || hasSectionLabels || bulletHeavy;
}

/**
 * Post-gen safety: catch numeric “design guidance” outputs.
 */
function containsEngineeringOutput(answer: string) {
  const t = (answer || "").toLowerCase();

  const numericLoads =
    /\b(\d+(\.\d+)?\s*(psf|kpa|kip|kips|lb|lbs|pounds|n|kn|mph))\b/i;

  const spacing =
    /\b(\d+(\.\d+)?\s*(inches|inch|in|ft|feet|mm|cm|m))\b.*\b(o\.?c\.?|on\s*center)\b/i;

  const counts =
    /\b(use|need|required|minimum)\b.*\b(\d+)\b.*\b(anchor|anchors|attachment|attachments)\b/i;

  return numericLoads.test(t) || spacing.test(t) || counts.test(t);
}

/* ---------------------------------------------
   Docs fetching (your /api/docs indexes the knowledge bucket)
--------------------------------------------- */

async function fetchDocsFromDocsRoute(req: Request, q: string, limit = 12, page = 0) {
  const origin = getOrigin(req);

  const docsUrl = new URL(`${origin}/api/docs`);
  docsUrl.searchParams.set("q", q);
  docsUrl.searchParams.set("limit", String(limit));
  docsUrl.searchParams.set("page", String(page));

  const cookie = req.headers.get("cookie") || "";

  const res = await fetch(docsUrl.toString(), {
    method: "GET",
    headers: { cookie },
    cache: "no-store",
  });

  if (!res.ok) return [] as RecommendedDoc[];

  const json = await res.json().catch(() => null);
  return (json?.docs || []) as RecommendedDoc[];
}

async function fetchDocSnippets(req: Request, q: string, limit = 8): Promise<SiteSnippet[]> {
  const origin = getOrigin(req);

  const docsUrl = new URL(`${origin}/api/docs`);
  docsUrl.searchParams.set("q", q);
  docsUrl.searchParams.set("limit", String(limit));
  docsUrl.searchParams.set("page", "0");

  const cookie = req.headers.get("cookie") || "";

  const res = await fetch(docsUrl.toString(), {
    method: "GET",
    headers: { cookie },
    cache: "no-store",
  });

  if (!res.ok) return [];

  const json = await res.json().catch(() => null);
  const docs = Array.isArray(json?.docs) ? json.docs : [];

  return docs
    .map((d: any) => {
      const title = String(d?.title || d?.name || "").trim();
      const url = String(d?.url || "").trim();
      const excerpt = String(d?.excerpt || d?.snippet || d?.summary || "").trim();
      if (!title) return null;
      return { title, url, excerpt };
    })
    .filter(Boolean)
    .slice(0, limit) as SiteSnippet[];
}

/* ---------------------------------------------
   Minimal persistence helpers (safe)
--------------------------------------------- */

async function getAuthedUserAndMaybeConvoId(req: Request, body: any) {
  try {
    const supabase = await supabaseRoute();
    const { data: authData } = await supabase.auth.getUser();
    const user = authData.user;
    if (!user) return { supabase: null as any, user: null as any, conversationId: "" };

    let conversationId = String(body?.conversationId || "").trim();

    if (!conversationId) {
      const { data: convo, error: convoErr } = await supabase
        .from("conversations")
        .insert({ user_id: user.id, title: "U-Anchors" })
        .select("id")
        .single();

      if (convoErr) return { supabase, user, conversationId: "" };
      conversationId = convo?.id || "";
    }

    return { supabase, user, conversationId };
  } catch {
    return { supabase: null as any, user: null as any, conversationId: "" };
  }
}

async function persistMessage(
  supabase: any,
  userId: string,
  conversationId: string,
  role: "user" | "assistant",
  content: string,
  meta?: any
) {
  try {
    if (!supabase || !userId || !conversationId) return;

    await supabase.from("messages").insert({
      user_id: userId,
      conversation_id: conversationId,
      role,
      content: (content || "").toString(),
      meta: meta && typeof meta === "object" ? meta : {},
    });
  } catch {
    // swallow
  }
}

/* ---------------------------------------------
   Route
--------------------------------------------- */

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const mode = String(body?.mode || "").trim();
    const isDocsMode = mode === "docs";

    const incomingMessages = Array.isArray(body?.messages)
      ? (body.messages as Array<{ role: string; content: string }>)
      : [];

    const userText = extractUserText(body, incomingMessages);
    const foldersUsed: string[] = ["anchors/u-anchors"];

    if (!userText) {
      return NextResponse.json(
        {
          answer: "I didn’t receive your message payload. Please refresh and try again.",
          recommendedDocs: [],
          foldersUsed,
          siteSnippets: [],
        } satisfies ChatResponse,
        { status: 200 }
      );
    }

    const { supabase, user, conversationId } = await getAuthedUserAndMaybeConvoId(req, body);

    if (!isDocsMode && user && conversationId) {
      await persistMessage(supabase, user.id, conversationId, "user", userText);
    }

    /* ---------------------------------------------
       1) U-Anchors docs search (knowledge bucket via /api/docs)
       --------------------------------------------- */

    // Always bias toward U-Anchors sheets, but also include the user’s terms
    const q1 = "u-anchor";
    const q2 = `u-anchor ${userText}`;
    const q3 = "u anchor";

    const [docs1, docs2, docs3] = await Promise.all([
      fetchDocsFromDocsRoute(req, q1, 12, 0),
      fetchDocsFromDocsRoute(req, q2, 12, 0),
      fetchDocsFromDocsRoute(req, q3, 12, 0),
    ]);

    const recommendedDocs = mergeDocsUniqueByPath(docs1, docs2, docs3);
    const siteSnippets = await fetchDocSnippets(req, q2, 8);

    // Docs-only behavior
    if (isDocsMode || looksLikeDocsOnlyRequest(userText)) {
      const out: ChatResponse = {
        conversationId: conversationId || body?.conversationId,
        answer: "",
        recommendedDocs,
        foldersUsed,
        siteSnippets,
      };

      if (user && conversationId) {
        await persistMessage(supabase, user.id, conversationId, "assistant", "", {
          type: "docs_only",
          recommendedDocs,
          foldersUsed,
          siteSnippets,
        });
      }

      return NextResponse.json(out, { status: 200 });
    }

    /* ---------------------------------------------
       2) Scope guard
       --------------------------------------------- */

    if (isClearlyNotUAnchor(userText)) {
      const answer = [
        "Right now I’m scoped to **U-Anchors** only.",
        "If your question is about U-Anchors, tell me what you’re trying to secure and what roof type you’re on (if you know it).",
      ].join("\n");

      if (user && conversationId) {
        await persistMessage(supabase, user.id, conversationId, "assistant", answer, {
          type: "out_of_scope",
          recommendedDocs,
          foldersUsed,
          siteSnippets,
        });
      }

      return NextResponse.json(
        {
          conversationId: conversationId || body?.conversationId,
          answer,
          recommendedDocs,
          foldersUsed,
          siteSnippets,
        } satisfies ChatResponse,
        { status: 200 }
      );
    }

    /* ---------------------------------------------
       3) Engineering hard-stop (only if explicitly asked)
       --------------------------------------------- */

    if (needsEngineeringEscalation(userText)) {
      const answer = engineeringEscalationAnswer();

      if (user && conversationId) {
        await persistMessage(supabase, user.id, conversationId, "assistant", answer, {
          type: "engineering_escalation",
          recommendedDocs,
          foldersUsed,
          siteSnippets,
        });
      }

      return NextResponse.json(
        {
          conversationId: conversationId || body?.conversationId,
          answer,
          recommendedDocs,
          foldersUsed,
          siteSnippets,
        } satisfies ChatResponse,
        { status: 200 }
      );
    }

    /* ---------------------------------------------
       4) Conversational U-Anchors answer (NO template)
       --------------------------------------------- */

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

    // Keep recent history so answers can change based on context
    const trimmed = incomingMessages.slice(-18).map((m) => ({
      role: m.role as "user" | "assistant" | "system",
      content: (m.content || "").toString(),
    }));

    const system = {
      role: "system" as const,
      content: [
        "You are an expert Anchor Products salesperson, currently scoped to ONE product: U-Anchors.",
        "",
        "GOAL:",
        "- Answer like ChatGPT in a natural conversation with an experienced customer.",
        "- Be specific to the question asked. Do NOT reuse a canned structure.",
        "",
        "STRICT SCOPE:",
        "- Only discuss U-Anchors. If asked about other products, say you're scoped to U-Anchors.",
        "",
        "HARD LIMITS:",
        "- No calculations, loads/uplift/wind/seismic values.",
        "- No quantities, spacing, layouts, or 'how many anchors'.",
        "- No code/compliance guarantees or approvals claims.",
        "- No step-by-step installation instructions.",
        "- If the user asks for any of the above, refer them to Anchor Engineering and provide (888) 575-2131 and anchorp.com.",
        "",
        "GROUNDING RULE:",
        "- Use ONLY the provided doc titles/snippets as factual sources. If the snippet doesn't contain a detail, do not invent it.",
        "- If info is missing, ask 1–2 clarifying questions OR offer to share the specific sheet.",
        "",
        "STYLE (IMPORTANT):",
        "- No headings like 'Applications', 'Benefits', 'Components'.",
        "- Avoid long bullet lists unless the user asks for a list.",
        "- Avoid re-defining U-Anchors every reply. If the user is already talking about U-Anchors, just answer the new question.",
        "- Vary phrasing across replies. Respond directly and conversationally.",
      ].join("\n"),
    };

    const grounding = {
      role: "system" as const,
      content: [
        "U-ANCHORS DOC RESULTS (titles + snippets):",
        JSON.stringify(
          {
            docs: (recommendedDocs || []).slice(0, 10).map((d) => ({
              title: d.title,
              doc_type: d.doc_type,
              path: d.path,
              url: d.url,
            })),
            snippets: (siteSnippets || []).map((s) => ({
              title: s.title,
              excerpt: s.excerpt,
            })),
          },
          null,
          2
        ),
      ].join("\n"),
    };

    const messagesForOpenAI =
      trimmed.length > 0
        ? [system, grounding, ...trimmed]
        : [system, grounding, { role: "user" as const, content: userText }];

    let answer = "—";

    try {
      const completion = await openai.chat.completions.create({
        model: process.env.OPENAI_MODEL || "gpt-5-mini",
        messages: messagesForOpenAI,
        temperature: 0.7,
        presence_penalty: 0.4,
      });

      answer = completion.choices?.[0]?.message?.content?.trim() || "—";
    } catch {
      answer = "I couldn’t generate a response right now (temporary AI error). Please try again in a moment.";
    }

    // If it drifted into engineering outputs, hard stop
    if (containsEngineeringOutput(answer)) {
      answer = engineeringEscalationAnswer();
    }

    // If it came out templated, do a rewrite pass (still grounded, still safe)
    if (!containsEngineeringOutput(answer) && looksTemplated(answer)) {
      try {
        const rewrite = await openai.chat.completions.create({
          model: process.env.OPENAI_MODEL || "gpt-5-mini",
          temperature: 0.6,
          messages: [
            system,
            grounding,
            {
              role: "user",
              content:
                "Rewrite the assistant reply below to sound like a natural chat with an experienced customer. " +
                "No headings, no canned sections, no long bullet lists. Keep it specific to the question and short.\n\n" +
                `QUESTION:\n${userText}\n\n` +
                `DRAFT ANSWER:\n${answer}`,
            },
          ],
        });

        const rewritten = rewrite.choices?.[0]?.message?.content?.trim();
        if (rewritten) answer = rewritten;
      } catch {
        // keep original
      }
    }

    if (user && conversationId) {
      await persistMessage(supabase, user.id, conversationId, "assistant", answer, {
        type: "u_anchors_answer",
        recommendedDocs,
        foldersUsed,
        siteSnippets,
      });
    }

    return NextResponse.json(
      {
        conversationId: conversationId || body?.conversationId,
        answer,
        recommendedDocs,
        foldersUsed,
        siteSnippets,
      } satisfies ChatResponse,
      { status: 200 }
    );
  } catch (e: any) {
    return NextResponse.json(
      {
        answer: "Something went wrong. Please try again.",
        error: e?.message || "Unknown error",
        recommendedDocs: [],
        foldersUsed: ["anchors/u-anchors"],
        siteSnippets: [],
      } satisfies ChatResponse,
      { status: 200 }
    );
  }
}
