"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import Button from "@/app/components/ui/Button";
import { APP_NAME, isInternal } from "@/lib/appMode";

// "Install this on your phone" sheet.
//
// The app is already a fully installable PWA (see manifest.ts), but a browser
// tab gives no hint of that — and on iOS push notifications only work from the
// installed home-screen copy, never from a Safari tab. So on a phone browser we
// surface the steps ourselves: Android gets Chrome's one-tap install, iOS gets
// the Share → Add to Home Screen walkthrough it can't automate.
//
// Auto-shows once per browser; after that it lives in the Help menu.

// ─── Imperative open (Help menu → "Install on your phone") ─────────────────
export const INSTALL_GUIDE_EVENT = "anchor:install-guide:open";

export function openInstallGuide() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(INSTALL_GUIDE_EVENT));
}

// Set once the sheet has auto-shown on this browser, so it appears on the first
// mobile visit and never nags afterwards. Not keyed per user: installing is a
// property of the device, not the account.
const SEEN_KEY = "anchor.installPrompt.seen";

// Chrome stashes its deferred install event here (see the head script in
// layout.tsx) — it can fire before React mounts.
declare global {
  interface Window {
    __anchorInstallEvent?: BeforeInstallPromptEvent | null;
  }
}

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

// Same convention as AppTutorial / ProfileCompletionPrompt: stay off the auth
// screens, the published docs, and the public QR pickup page (whose visitors
// aren't app users at all).
const HIDE_EXACT = new Set(["/", "/signup", "/forgot", "/reset"]);
const HIDE_PREFIXES = ["/auth", "/docs", "/grab"];
function shouldHide(pathname: string) {
  if (HIDE_EXACT.has(pathname)) return true;
  return HIDE_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

// ─── Platform detection ────────────────────────────────────────────────────
type Platform = "ios" | "android" | "desktop";

function detectPlatform(): { platform: Platform; iosBrowser: "safari" | "other" } {
  if (typeof navigator === "undefined") return { platform: "desktop", iosBrowser: "safari" };
  const ua = navigator.userAgent;

  // iPadOS 13+ reports a Mac user agent; touch points give it away.
  const isIpadDesktopUA = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  const isIOS = /iPhone|iPad|iPod/i.test(ua) || isIpadDesktopUA;
  const isAndroid = /Android/i.test(ua);

  // Chrome/Firefox/Edge on iOS are Safari underneath but have their own menus.
  const iosBrowser = /CriOS|FxiOS|EdgiOS|OPT\//.test(ua) ? "other" : "safari";

  if (isIOS) return { platform: "ios", iosBrowser };
  if (isAndroid) return { platform: "android", iosBrowser: "safari" };
  return { platform: "desktop", iosBrowser: "safari" };
}

// The whole feature is phone-only: there's nothing to install on a desktop, so
// neither the sheet nor its Help-menu entry appears there.
export function isMobileDevice() {
  if (typeof window === "undefined") return false;
  return detectPlatform().platform !== "desktop";
}

// Snapshot readers for useSyncExternalStore. They must return primitives — a
// fresh object each call would never compare equal and would re-render forever.
const getPlatform = () => detectPlatform().platform;
const getIosBrowser = () => detectPlatform().iosBrowser;
const getCanPromptInstall = () => !!window.__anchorInstallEvent;

// The user agent is fixed for the session, so there is nothing to subscribe to.
function subscribeNothing() {
  return () => {};
}

// Chrome decides the app is installable whenever it likes — possibly before
// React mounts (the head script in layout.tsx catches that case and re-fires).
function subscribeInstallable(onChange: () => void) {
  window.addEventListener("anchor:installable", onChange);
  return () => window.removeEventListener("anchor:installable", onChange);
}

function isInstalled() {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari's non-standard flag for home-screen launches.
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

const APP_ICON = isInternal ? "/internal_apple-touch-icon.png" : "/apple-touch-icon.png";

export function InstallAppPrompt() {
  const pathname = usePathname() || "";

  const [open, setOpen] = useState(false);
  // Opened from the Help menu — show it even after the once-per-browser dismissal.
  const [manual, setManual] = useState(false);

  // All three are client-only facts; the server snapshots keep SSR quiet and
  // render nothing until the browser reports otherwise.
  const platform = useSyncExternalStore<Platform>(subscribeNothing, getPlatform, () => "desktop");
  const iosBrowser = useSyncExternalStore(subscribeNothing, getIosBrowser, () => "safari" as const);
  const canPromptInstall = useSyncExternalStore(subscribeInstallable, getCanPromptInstall, () => false);

  // Nothing to install once it's installed.
  useEffect(() => {
    const onInstalled = () => setOpen(false);
    window.addEventListener("appinstalled", onInstalled);
    return () => window.removeEventListener("appinstalled", onInstalled);
  }, []);

  // Manual open from the Help menu.
  useEffect(() => {
    const onOpen = () => {
      setManual(true);
      setOpen(true);
    };
    window.addEventListener(INSTALL_GUIDE_EVENT, onOpen);
    return () => window.removeEventListener(INSTALL_GUIDE_EVENT, onOpen);
  }, []);

  // First-visit auto-show on a phone browser.
  useEffect(() => {
    if (shouldHide(pathname)) return;
    if (isInstalled()) return;
    const { platform: p } = detectPlatform();
    if (p === "desktop") return;
    try {
      if (window.localStorage.getItem(SEEN_KEY) === "1") return;
    } catch { /* ignore */ }

    // Let the page settle, and don't stack on the first-run walkthrough or the
    // profile nudge — whichever of those is up gets the user's attention first.
    const t = window.setTimeout(() => {
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      try { window.localStorage.setItem(SEEN_KEY, "1"); } catch { /* ignore */ }
      setOpen(true);
    }, 2500);
    return () => window.clearTimeout(t);
  }, [pathname]);

  const close = useCallback(() => {
    setManual(false);
    setOpen(false);
  }, []);

  async function runChromeInstall() {
    const ev = window.__anchorInstallEvent;
    if (!ev) return;
    // A deferred prompt is single-use. Drop it and re-fire the event so the
    // snapshot above re-reads and the button falls back to manual steps.
    window.__anchorInstallEvent = null;
    window.dispatchEvent(new Event("anchor:installable"));
    await ev.prompt();
    const { outcome } = await ev.userChoice;
    if (outcome === "accepted") close();
  }

  if (!open) return null;
  // Phones only — a desktop browser has nothing to install.
  if (platform === "desktop") return null;
  // A route change into an auth screen shouldn't leave the sheet hanging around.
  if (!manual && shouldHide(pathname)) return null;

  return (
    // Above the mobile bottom nav (z-index 100), which is fixed to the same
    // corner of the screen this sheet slides up from.
    <div className="fixed inset-0 z-[110] flex items-end justify-center sm:items-center">
      <button
        type="button"
        aria-label="Close"
        onClick={close}
        className="absolute inset-0 cursor-default bg-black/45 backdrop-blur-[3px]"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Install ${APP_NAME}`}
        className="relative w-full max-w-md rounded-t-3xl border border-black/10 bg-white p-5 shadow-[0_-8px_40px_rgba(0,0,0,0.28)] sm:rounded-3xl sm:shadow-[0_12px_40px_rgba(0,0,0,0.28)]"
        style={{ paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom))" }}
      >
        {/* Grab handle — reads as a sheet you can dismiss. */}
        <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-black/15 sm:hidden" />

        <div className="flex items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={APP_ICON}
            alt=""
            className="h-12 w-12 shrink-0 rounded-xl border border-black/10 shadow-sm"
          />
          <div className="min-w-0">
            <h2 className="text-base font-bold leading-tight text-[var(--anchor-deep)]">
              Install {APP_NAME}
            </h2>
            <p className="mt-0.5 text-xs leading-snug text-black/60">
              Free, no app store — it adds an icon to your home screen.
            </p>
          </div>
        </div>

        <p className="mt-3 text-sm leading-snug text-black/70">
          Installed, it opens full screen without the browser bars — and it&rsquo;s the only way to
          receive push notifications for new leads and orders.
        </p>

        <div className="mt-4">
          {platform === "ios" ? (
            <IosSteps browser={iosBrowser} />
          ) : (
            <AndroidSteps canPrompt={canPromptInstall} onInstall={runChromeInstall} />
          )}
        </div>

        {/* `secondary`, not `ghost` — the ghost variant is white-on-dark and
            would vanish against this sheet. */}
        <Button variant="secondary" onClick={close} className="mt-5 w-full justify-center text-sm">
          Not now
        </Button>
      </div>
    </div>
  );
}

// ─── Per-platform steps ────────────────────────────────────────────────────

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--anchor-mint)]/60 text-xs font-bold text-[var(--anchor-deep)]">
        {n}
      </span>
      <span className="pt-0.5 text-sm leading-snug text-black/75">{children}</span>
    </li>
  );
}

function ShareIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="mx-0.5 inline h-4 w-4 -translate-y-px text-[var(--anchor-green)]"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M12 16V4" />
      <path d="M8 8l4-4 4 4" />
      <path d="M5 12v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
    </svg>
  );
}

function IosSteps({ browser }: { browser: "safari" | "other" }) {
  return (
    <>
      <ol className="space-y-3">
        <Step n={1}>
          Tap the Share button <ShareIcon /> {browser === "safari" ? "at the bottom of Safari" : "in the browser toolbar"}.
        </Step>
        <Step n={2}>
          Scroll down the share sheet and tap <strong>Add to Home Screen</strong>.
        </Step>
        <Step n={3}>
          Tap <strong>Add</strong> — the icon lands on your home screen with your other apps.
        </Step>
      </ol>
      {browser === "other" && (
        <p className="mt-3 rounded-xl bg-[var(--anchor-mint)]/30 px-3 py-2 text-xs leading-snug text-black/70">
          Don&rsquo;t see &ldquo;Add to Home Screen&rdquo;? Open this page in <strong>Safari</strong> and try again —
          iPhone only installs apps from Safari.
        </p>
      )}
    </>
  );
}

function AndroidSteps({ canPrompt, onInstall }: { canPrompt: boolean; onInstall: () => void }) {
  if (canPrompt) {
    return (
      <>
        <Button variant="primary" onClick={onInstall} className="w-full justify-center text-sm">
          Install app
        </Button>
        <p className="mt-2 text-center text-xs leading-snug text-black/55">
          Chrome will ask you to confirm.
        </p>
      </>
    );
  }
  return (
    <ol className="space-y-3">
      <Step n={1}>
        Tap the <strong>⋮</strong> menu in the top-right of the browser.
      </Step>
      <Step n={2}>
        Tap <strong>Add to Home screen</strong> (some versions say <strong>Install app</strong>).
      </Step>
      <Step n={3}>
        Confirm with <strong>Install</strong> — the icon lands in your app drawer.
      </Step>
    </ol>
  );
}

