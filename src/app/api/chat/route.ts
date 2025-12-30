// src/app/api/chat/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { supabaseRoute } from "@/lib/supabase/server";

export const runtime = "nodejs";

type UserType = "internal" | "external";

type RecommendedDoc = {
  title: string;
  doc_type: string;
  path: string;
  url: string | null;
};

/* ---------------------------------------------
   Helpers
--------------------------------------------- */

function normalize(s: string) {
  return (s || "").toLowerCase().trim();
}

function getBaseUrl(req: Request) {
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  if (!host) throw new Error("Missing host header");
  return `${proto}://${host}`;
}

/* ---------------------------------------------
   Folder detection (anchors + solutions)
--------------------------------------------- */

function detectFolders(message: string) {
  const m = normalize(message);

  // Detect anchor series (u2400, u2600, etc.)
  const uMatch = m.match(/\bu(\d{4})\b/);
  const uSeries = uMatch ? `u${uMatch[1]}` : null;

  // Membrane / variant detection
  const variants = [
    { key: "epdm", hits: ["epdm"] },
    { key: "kee", hits: ["kee"] },
    { key: "pvc", hits: ["pvc"] },
    { key: "tpo", hits: ["tpo"] },
    { key: "app", hits: ["app"] },
    { key: "sbs", hits: ["sbs"] },
    { key: "sbs-torch", hits: ["torch", "sbs torch"] },
    { key: "coatings", hits: ["coating", "coatings"] },
    { key: "plate", hits: ["plate"] },
  ];

  const variant =
    variants.find((v) => v.hits.some((h) => m.includes(h)))?.key ?? null;

  // Solution detection
  const solutions = [
    { key: "solutions/hvac", hits: ["hvac", "rtu"] },
    { key: "solutions/satellite-dish", hits: ["satellite", "dish"] },
    { key: "solutions/snow-retention/2pipe", hits: ["2pipe", "two pipe"] },
    { key: "solutions/snow-retention/snow-fence", hits: ["snow fence"] },
    { key: "solutions/roof-guardrail", hits: ["guardrail"] },
    { key: "solutions/roof-ladder", hits: ["roof ladder", "ladder"] },
    { key: "solutions/roof-box", hits: ["roof box"] },
    { key: "solutions/solar", hits: ["solar"] },
    { key: "solutions/lightning", hits: ["lightning"] },
  ];

  const solutionFolder =
    solutions.find((s) => s.hits.some((h) => m.includes(h)))?.key ?? null;

  // Anchor folder
  let anchorFolder: string | null = null;
  if (uSeries && variant) {
    anchorFolder = `anchor/u-anchors/${uSeries}/${variant}`;
  } else if (uSeries) {
    anchorFolder = `anchor/u-anchors/${uSeries}`;
  }

  return [anchorFolder, solutionFolder].filter(Boolean).slice(0, 2) as string[];
}

/* ---------------------------------------------
   Fetch docs from /api/docs (server-safe)
--------------------------------------------- */

async function getDocsForFolder(req: Request, folder: string) {
  const baseUrl = getBaseUrl(req);
  const url = new URL("/api/docs", baseUrl);
  url.searchParams.set("folder", folder);

  const res = await fetch(url.toString(), { cache: "no-store" });
  if (!res.ok) return [];

  const json = await res.json();
  return (json?.files || []) as RecommendedDoc[];
}

/* ---------------------------------------------
   POST
--------------------------------------------- */

export async function POST(req: Request) {
  // ✅ create a response object so Supabase can mutate cookies/headers if needed
  const res = NextResponse.next();

  try {
    // ✅ Auth gate (server-side)
    // IMPORTANT: supabaseRoute must accept (req, res)
    const supabase = supabaseRoute(req, res);

    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr) console.error("API_CHAT_AUTH_ERROR:", authErr);

    const user = authData.user;
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      
    }

    const body = await req.json().catch(() => ({}));
    const message = (body?.message || "").trim();

    if (!message) {
      return NextResponse.json({ error: "Missing message" }, { status: 400 });
    }

    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "Missing OPENAI_API_KEY" },
        { status: 500 }
      );
    }

    // ✅ Determine access from profiles (ignore any client-provided userType)
    let { data: profile, error: profileErr } = await supabase
      .from("profiles")
      .select("email, user_type, role")
      .eq("id", user.id)
      .maybeSingle();

    if (profileErr) console.error("API_CHAT_PROFILE_SELECT_ERROR:", profileErr);

    // ✅ If profile missing, create one based on email domain
    if (!profile) {
      const email = (user.email || "").toLowerCase();
      const user_type: UserType = email.endsWith("@anchorp.com")
        ? "internal"
        : "external";
      const role = user_type === "internal" ? "anchor_rep" : "external_rep";

      const { data: created, error: upsertErr } = await supabase
        .from("profiles")
        .upsert(
          {
            id: user.id,
            email,
            user_type,
            role,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "id" }
        )
        .select("email, user_type, role")
        .single();

      if (upsertErr) console.error("API_CHAT_PROFILE_UPSERT_ERROR:", upsertErr);

      profile = created ?? null;
    }

    const userType: UserType =
      profile?.user_type === "external" ? "external" : "internal";

    /* Detect folders + pull docs */
    const folders = detectFolders(message);
    const folderDocs = await Promise.all(
      folders.map((folder) => getDocsForFolder(req, folder))
    );

    const recommendedDocs = folderDocs.flat().slice(0, 10);

    const docContext =
      recommendedDocs.length > 0
        ? recommendedDocs
            .map(
              (d) =>
                `- ${d.doc_type}: ${d.title} (${d.path})${
                  d.url ? ` [${d.url}]` : ""
                }`
            )
            .join("\n")
        : "- None matched yet.";

    /* Prompt */
    const systemPrompt = `
You are "Anchor Sales Co-Pilot" — an expert Sales Engineer for Anchor Products.

Rules:
- Do NOT fabricate specs, approvals, compatibility, or install steps.
- Ask at most 2 clarifying questions if required.
- Be concise, confident, and sales-ready.
- Follow the response format exactly.
- End with "Recommended documents" using ONLY the provided list.

Visibility:
- External users: no competitor comparisons.
- Internal users: competitor comparisons only with provided sources.

Response format:

Recommendation:
- ...

Why:
- ...

Need to confirm:
- ...

Quick questions:
1) ...
2) ...

Recommended documents:
- ...

Provided documents:
${docContext}
`.trim();

    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const model = process.env.OPENAI_MODEL || "gpt-5-mini";

    const resp = await client.responses.create({
      model,
      input: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `userType=${userType}\n\nQuestion:\n${message}`,
        },
      ],
    });

    const answer =
      resp.output_text ?? "I couldn’t generate a response. Please try again.";

    // ✅ Return JSON, preserving any cookie/header changes from Supabase
    return NextResponse.json(
      {
        answer,
        foldersUsed: folders,
        recommendedDocs,
        userType, // optional debug
      },
      { headers: res.headers }
    );
  } catch (err: any) {
    console.error("CHAT_ROUTE_ERROR:", err);
    return NextResponse.json(
      { error: err?.message || "Server error" },
      { status: 500 }
    );
  }
}
