import { proxyToPortal } from "@/lib/showcase/portal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* A keeper's approve / deny on a pending stop or photo somebody else filed.
 *
 * A recommendation only: the website never changes the item's status here, and
 * an admin still publishes or declines it on anchorp.com with this shown next
 * to the buttons. Keepers only — the website answers 403 for everyone else.
 * `clear` withdraws it. */

const VERDICTS = ["approve", "deny", "clear"];

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const stopId = String(body.stopId ?? "").trim();
  const photoId = String(body.photoId ?? "").trim();
  if (!stopId === !photoId) {
    return Response.json({ error: "Send a stop id or a photo id." }, { status: 400 });
  }

  const verdict = String(body.verdict ?? "");
  if (!VERDICTS.includes(verdict)) {
    return Response.json({ error: "Approve, deny or clear." }, { status: 400 });
  }

  const payload: Record<string, string> = stopId ? { stopId, verdict } : { photoId, verdict };
  const note = String(body.note ?? "").trim();
  if (note && verdict !== "clear") payload.note = note;

  return proxyToPortal(req, "/api/showcase/review", { method: "POST", body: payload });
}
