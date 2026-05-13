"use client";

// Custom user-event tracker. Posts to /api/user-events.
// Uses sendBeacon when available so events still flush on page unload.
//
// Page-view tracking happens automatically (see UserEventTracker).
// For key actions, call trackEvent("lead_submitted", { leadId }) directly.

type EventPayload = {
  event_type: string;
  page_path?: string | null;
  metadata?: Record<string, unknown>;
};

const PUBLIC_PATH_PREFIXES = ["/auth"];
const PUBLIC_PATHS_EXACT = new Set(["/", "/signup", "/forgot", "/reset"]);

function isPublicPath(pathname: string) {
  if (PUBLIC_PATHS_EXACT.has(pathname)) return true;
  return PUBLIC_PATH_PREFIXES.some((p) => pathname.startsWith(p));
}

function postEvents(payload: EventPayload | EventPayload[]) {
  if (typeof window === "undefined") return;
  const body = JSON.stringify(payload);

  try {
    if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
      const blob = new Blob([body], { type: "application/json" });
      const ok = navigator.sendBeacon("/api/user-events", blob);
      if (ok) return;
    }
  } catch {
    // fall through to fetch
  }

  try {
    fetch("/api/user-events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body,
      credentials: "include",
      keepalive: true,
    }).catch(() => {});
  } catch {
    // swallow — analytics failures must not break the app
  }
}

export function trackEvent(
  eventType: string,
  metadata?: Record<string, unknown>
) {
  if (typeof window === "undefined") return;
  // Explicit events (login, form submits, etc.) fire from any path.
  // The endpoint is auth-gated, so unauthenticated calls fail silently.
  postEvents({
    event_type: eventType,
    page_path: window.location.pathname,
    metadata: metadata ?? {},
  });
}

export function trackPageView(pathname: string) {
  if (typeof window === "undefined") return;
  if (isPublicPath(pathname)) return;

  postEvents({
    event_type: "page_view",
    page_path: pathname,
    metadata: {},
  });
}
