"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { trackClick, trackEvent, trackPageView, type ClickMeta } from "@/lib/analytics/track";

const APP_OPEN_KEY = "anchor-last-app-open";
// Fire app_open at most once per 30 minutes of inactivity.
const APP_OPEN_THROTTLE_MS = 30 * 60 * 1000;

const INTERACTIVE_TAGS = new Set(["a", "button", "input", "select", "textarea", "summary"]);

function describeInteractive(target: EventTarget | null): ClickMeta | null {
  if (!(target instanceof Element)) return null;

  // Walk up to the closest interactive ancestor (button, link, form field,
  // or any element with role=button/link or data-track-id). This catches
  // cases where the click lands on a child <svg> or <span>.
  let el: Element | null = target;
  while (el && el !== document.body) {
    const tag = el.tagName.toLowerCase();
    const role = el.getAttribute("role") || "";
    const trackId = el.getAttribute("data-track-id") || "";
    const isInteractive =
      INTERACTIVE_TAGS.has(tag) ||
      role === "button" ||
      role === "link" ||
      role === "menuitem" ||
      role === "menuitemradio" ||
      role === "tab" ||
      !!trackId;

    if (isInteractive) {
      const ariaLabel = el.getAttribute("aria-label") || "";
      const title = el.getAttribute("title") || "";
      const text = (el as HTMLElement).innerText || el.textContent || "";
      const label = (ariaLabel || text || title)
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 80);
      const href =
        tag === "a" && (el as HTMLAnchorElement).href
          ? (el as HTMLAnchorElement).href
          : undefined;
      return {
        el: tag,
        ...(label ? { label } : {}),
        ...(href ? { href } : {}),
        ...(trackId ? { trackId } : {}),
        ...(role ? { role } : {}),
      };
    }
    el = el.parentElement;
  }
  return null;
}

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
  // Dedup key for clicks so a single tap that bubbles through multiple
  // listeners doesn't post duplicate rows.
  const lastClickRef = useRef<{ key: string; at: number } | null>(null);

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

  // Global click tracking — capture every meaningful interaction.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      const meta = describeInteractive(e.target);
      if (!meta) return;
      // Drop empty rows that wouldn't help analysis (no label and no trackId).
      if (!meta.label && !meta.trackId && !meta.href) return;

      const key = `${window.location.pathname}|${meta.trackId || meta.label || meta.href || meta.el}`;
      const now = Date.now();
      if (lastClickRef.current && lastClickRef.current.key === key && now - lastClickRef.current.at < 400) {
        return;
      }
      lastClickRef.current = { key, at: now };
      trackClick(meta);
    }

    // Capture phase so we still see clicks that are stopped from bubbling
    // (e.g., dropdown items that call stopPropagation).
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return null;
}
