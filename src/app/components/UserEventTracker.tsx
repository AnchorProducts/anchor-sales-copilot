"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { trackEvent, trackPageView } from "@/lib/analytics/track";

const APP_OPEN_KEY = "anchor-last-app-open";
// Fire app_open at most once per 30 minutes of inactivity.
const APP_OPEN_THROTTLE_MS = 30 * 60 * 1000;

function maybeFireAppOpen() {
  if (typeof window === "undefined") return;
  try {
    const raw = window.localStorage.getItem(APP_OPEN_KEY);
    const last = raw ? Number(raw) : 0;
    const now = Date.now();
    if (!last || now - last > APP_OPEN_THROTTLE_MS) {
      trackEvent("app_open", {
        standalone:
          typeof window.matchMedia === "function" &&
          window.matchMedia("(display-mode: standalone)").matches,
      });
      window.localStorage.setItem(APP_OPEN_KEY, String(now));
    }
  } catch {
    // localStorage unavailable (private mode, etc.) — silently skip.
  }
}

export function UserEventTracker() {
  const pathname = usePathname() || "";
  const lastSent = useRef<string | null>(null);

  // Page-view tracking
  useEffect(() => {
    if (!pathname) return;
    if (lastSent.current === pathname) return;
    lastSent.current = pathname;
    trackPageView(pathname);
  }, [pathname]);

  // App-open tracking — fires on first load and whenever the tab/PWA
  // becomes visible again after the throttle window.
  useEffect(() => {
    maybeFireAppOpen();

    function onVisibility() {
      if (document.visibilityState === "visible") {
        maybeFireAppOpen();
      }
    }

    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  return null;
}
