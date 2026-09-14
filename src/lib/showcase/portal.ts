import "server-only";

/* ============================================================================
 * Showcase submissions — the App's half of the anchorp.com integration.
 *
 * The mobile showcase schedule lives on the website. The person driving the
 * truck files stops from this app; marketing publishes or declines them on the
 * website. The two codebases share one Supabase project but NOT one session:
 * the portal authenticates with httpOnly cookies scoped to its own domain,
 * which never reach this origin. What we do have is a Supabase access token
 * from the same project, and the website's showcase endpoints accept it as a
 * bearer token.
 *
 * WHY THESE CALLS ARE PROXIED SERVER-SIDE
 * The browser could call anchorp.com directly, but only if the website serves
 * CORS headers for this origin — which is not part of the contract and is not
 * ours to change. Proxying the small JSON calls through our own routes
 * sidesteps CORS entirely and keeps the website's base URL out of the client
 * bundle. The PHOTO is deliberately NOT proxied: it goes browser → Supabase
 * Storage on a signed URL, because a photo off a modern phone is comfortably
 * over Vercel's 4.5 MB request-body limit and would fail on exactly the
 * pictures worth having.
 * ==========================================================================*/

import { requireToolAccessFromBearer } from "@/lib/toolAccessServer";

const DEFAULT_PORTAL_BASE = "https://anchorp.com";

/** The tool key these routes are gated on — see src/lib/toolAccess.ts. */
export const SHOWCASE_TOOL_KEY = "showcase";

/** `code` on our own 403 — mirrored as NOT_ASSIGNED in src/lib/showcase/client.ts. */
const SHOWCASE_NOT_ASSIGNED = "not_assigned";

/** Base URL of the website that owns the showcase schedule. */
export function portalBaseUrl(): string {
  const configured = String(process.env.PORTAL_BASE_URL ?? "").trim();
  const base = configured || DEFAULT_PORTAL_BASE;
  return (base.startsWith("http") ? base : `https://${base}`).replace(/\/+$/, "");
}

/** The caller's Supabase access token, or "" when the header is absent. */
export function bearerFrom(req: Request): string {
  const header = req.headers.get("authorization") || "";
  return header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : "";
}

/**
 * Forward a showcase request to the website and hand its response straight
 * back. Status and body pass through verbatim so the website's own readable
 * `error` strings reach the form — a decline reason or "that photo isn't
 * yours" is more useful than anything we could re-word here.
 */
export async function proxyToPortal(
  req: Request,
  path: string,
  init: { method: "GET" | "POST" | "PATCH" | "DELETE"; body?: unknown }
): Promise<Response> {
  const token = bearerFrom(req);

  // Two gates, both server-side. The showcase is a named list, not a role: the
  // website would accept any authorized portal user, so if we did not check
  // here, anyone who found the URL could file a stop.
  //
  // Our 403 carries a code because the website's 403 means something else: on
  // the schedule routes it is "authorized, but doesn't keep the schedule", and
  // the page reads that to decide whether to show the Schedule tab.
  const gate = await requireToolAccessFromBearer(token, SHOWCASE_TOOL_KEY);
  if ("error" in gate) {
    return Response.json(
      { error: gate.error, ...(gate.status === 403 ? { code: SHOWCASE_NOT_ASSIGNED } : {}) },
      { status: gate.status }
    );
  }

  let upstream: Response;
  try {
    upstream = await fetch(`${portalBaseUrl()}${path}`, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
    });
  } catch {
    // The website being unreachable is a different problem from being rejected
    // by it, and the form says so — a rep on a bad yard connection should be
    // told to retry, not told they aren't authorized.
    return Response.json(
      { error: "Couldn't reach anchorp.com. Check your connection and try again." },
      { status: 502 }
    );
  }

  const contentType = upstream.headers.get("content-type") || "";
  const text = await upstream.text();

  // Until anchorp.com is cut over to the site that serves these routes, the
  // host answering is the Webflow marketing site — which returns its own HTML
  // 404/405 rather than a JSON error. Anything that isn't JSON did not come
  // from the showcase API, so say that plainly instead of passing an HTML page
  // back to a caller that is about to JSON.parse it.
  if (!contentType.includes("application/json")) {
    return Response.json(
      { error: "The showcase isn't live on anchorp.com yet. Nothing you file would reach marketing." },
      { status: 503 }
    );
  }

  // Status and body otherwise pass through verbatim, so the website's own
  // readable `error` strings reach the form.
  return new Response(text, {
    status: upstream.status,
    headers: { "Content-Type": contentType },
  });
}
