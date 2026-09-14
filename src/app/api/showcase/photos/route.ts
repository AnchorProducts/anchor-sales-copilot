import { proxyToPortal } from "@/lib/showcase/portal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* Photos on a stop already on the schedule — keepers only; the website decides
 * who that is and answers 403 for everyone else.
 *
 * Every photo attached here waits for marketing. Removing is only for photos
 * that aren't on the site yet; the website answers 409 for a live one. The
 * files themselves never come through here — see src/lib/showcase/portal.ts. */

async function readBody(req: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await req.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  const body = await readBody(req);
  if (!body) return Response.json({ error: "Expected a JSON body." }, { status: 400 });

  const stopId = String(body.stopId ?? "").trim();
  if (!stopId) return Response.json({ error: "A stop id is required." }, { status: 400 });

  const photoPaths = Array.isArray(body.photoPaths)
    ? body.photoPaths.map((p) => String(p ?? "").trim()).filter(Boolean)
    : [];
  if (!photoPaths.length) return Response.json({ error: "Add at least one photo." }, { status: 400 });

  return proxyToPortal(req, "/api/showcase/photos", { method: "POST", body: { stopId, photoPaths } });
}

export async function DELETE(req: Request) {
  const body = await readBody(req);
  const id = String(body?.id ?? "").trim();
  if (!id) return Response.json({ error: "A photo id is required." }, { status: 400 });

  return proxyToPortal(req, "/api/showcase/photos", { method: "DELETE", body: { id } });
}
