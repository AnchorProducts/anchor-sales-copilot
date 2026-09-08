import { proxyToPortal } from "@/lib/showcase/portal";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* Mint a signed upload URL for a showcase photo.
 *
 * Returns { bucket, path, token } from the website. The browser uploads to
 * Supabase Storage with that token directly — the file never comes back
 * through here. See src/lib/showcase/portal.ts for why. */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Expected a JSON body." }, { status: 400 });
  }

  const filename = String((body as { filename?: unknown })?.filename ?? "").trim();
  if (!filename) {
    return Response.json({ error: "A filename is required." }, { status: 400 });
  }

  return proxyToPortal(req, "/api/showcase/upload-url", {
    method: "POST",
    body: { filename },
  });
}
