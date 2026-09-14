import { proxyToPortal } from "@/lib/showcase/portal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* File a showcase stop.
 *
 * Only the content fields are forwarded. `status` is deliberately not in that
 * list and never will be: a stop is filed pending, publishing is marketing's
 * call on the website, and the website ignores the field anyway. `requested` is
 * likewise not settable — it means "we've been asked to come", which is
 * marketing's word about a booking, not a description of a stop somebody drove
 * to. */
export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const str = (v: unknown) => String(v ?? "").trim();
  const payload: Record<string, string | string[]> = {
    date: str(body.date),
    city: str(body.city),
    event: str(body.event),
  };
  // Optional fields are omitted rather than sent empty, so the website stores a
  // null note instead of an empty string.
  const note = str(body.note);
  if (note) payload.note = note;
  // Storage paths from upload-url. The website checks each is the caller's own
  // and really in the bucket, and refuses more than it allows in one request.
  const photoPaths = Array.isArray(body.photoPaths) ? body.photoPaths.map(str).filter(Boolean) : [];
  if (photoPaths.length) payload.photoPaths = photoPaths;

  return proxyToPortal(req, "/api/showcase/submit", { method: "POST", body: payload });
}

/* What I've filed, and what came of it. Scoped to the caller by the website. */
export async function GET(req: Request) {
  return proxyToPortal(req, "/api/showcase/submit", { method: "GET" });
}
