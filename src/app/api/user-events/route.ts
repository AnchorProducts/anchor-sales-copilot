import { NextResponse } from "next/server";
import { supabaseRoute } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeJsonParse(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch {
    return null;
  }
}

type IncomingEvent = {
  event_type?: unknown;
  page_path?: unknown;
  metadata?: unknown;
};

function normalize(raw: IncomingEvent) {
  const eventType = typeof raw.event_type === "string" ? raw.event_type.trim().slice(0, 64) : "";
  if (!eventType) return null;

  const pagePath =
    typeof raw.page_path === "string" ? raw.page_path.slice(0, 512) : null;

  const metadata =
    raw.metadata && typeof raw.metadata === "object" && !Array.isArray(raw.metadata)
      ? (raw.metadata as Record<string, unknown>)
      : {};

  return { eventType, pagePath, metadata };
}

export async function POST(req: Request) {
  const supabase = await supabaseRoute();
  const { data: auth, error: authErr } = await supabase.auth.getUser();
  if (authErr || !auth?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // sendBeacon submits as text/plain; accept JSON body either way.
  const raw = await req.text().catch(() => "");
  const parsed = safeJsonParse(raw);

  const events: IncomingEvent[] = Array.isArray(parsed)
    ? (parsed as IncomingEvent[])
    : parsed && typeof parsed === "object"
      ? [parsed as IncomingEvent]
      : [];

  const rows = events
    .map(normalize)
    .filter((e): e is { eventType: string; pagePath: string | null; metadata: Record<string, unknown> } => !!e)
    .map((e) => ({
      user_id: auth.user!.id,
      event_type: e.eventType,
      page_path: e.pagePath,
      metadata: e.metadata,
    }));

  if (rows.length === 0) {
    return NextResponse.json({ ok: true, inserted: 0 });
  }

  const { error: insertErr } = await supabase.from("user_events").insert(rows);
  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, inserted: rows.length });
}
