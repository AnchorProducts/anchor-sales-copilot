import { proxyToPortal } from "@/lib/showcase/portal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* The whole showcase schedule, for the people who keep it.
 *
 * Who counts as a keeper is decided by the website (403 for everyone else), not
 * here — this route only adds our own assigned-list gate in front of it. There
 * is no POST: new stops go through /api/showcase/submit and marketing's review. */

const EDITABLE = ["date", "city", "event", "note", "photoPath"] as const;

async function readBody(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  return proxyToPortal(req, "/api/showcase/stops", { method: "GET" });
}

/* Correct one stop. Only fields the caller actually sent are forwarded, and
 * only the five that describe the stop — `status`, `requested` and the public
 * photo are marketing's, and never leave this route even if a client sends
 * them. An empty string is kept: `note: ""` clears the note and
 * `photoPath: ""` removes a photo awaiting review. */
export async function PATCH(req: Request) {
  const body = await readBody(req);
  if (!body) return Response.json({ error: "Expected a JSON body." }, { status: 400 });

  const id = String(body.id ?? "").trim();
  if (!id) return Response.json({ error: "A stop id is required." }, { status: 400 });

  const payload: Record<string, string> = { id };
  for (const key of EDITABLE) {
    if (body[key] !== undefined) payload[key] = String(body[key] ?? "").trim();
  }

  return proxyToPortal(req, "/api/showcase/stops", { method: "PATCH", body: payload });
}

export async function DELETE(req: Request) {
  const body = await readBody(req);
  const id = String(body?.id ?? "").trim();
  if (!id) return Response.json({ error: "A stop id is required." }, { status: 400 });

  return proxyToPortal(req, "/api/showcase/stops", { method: "DELETE", body: { id } });
}
