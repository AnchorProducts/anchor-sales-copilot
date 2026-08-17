"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import Button from "@/app/components/ui/Button";
import { APP_NAME, APP_LOGO, isInternal } from "@/lib/appMode";
import { GATE_BYPASS_KEY, isGateExemptPath } from "@/lib/installGate";

// Mobile install gate.
//
// The app is meant to be used as an installed app on a phone, not as a website
// — on iOS push notifications only work from the home-screen copy, never from a
// Safari tab. So a phone browser doesn't get the app at all: it gets these
// install instructions in place of whatever page it asked for.
//
// Android gets Chrome's one-tap install; iOS gets the Share → Add to Home
// Screen walkthrough it can't automate. A de-emphasized "continue in browser"
// link is the escape hatch — in-app browsers (Gmail, Outlook, LinkedIn) can't
// Add to Home Screen at all, and without a way through their users would be
// locked out with no recourse.

// The pre-paint script in layout.tsx re-implements the checks below in plain JS
// so the page behind the gate never flashes. Both read their constants from
// @/lib/installGate — see the note there on why they can't live in this file.

const GATE_BYPASS_EVENT = "anchor:install-gate:bypass";

// Why installing is worth it, per deployment. Internal staff are here for the
// back-office pushes an admin has assigned them (see src/lib/push/topics.ts).
// External reps are simply meant to have the app on their phone, so their
// version sells the experience and stays off notifications entirely.
const INSTALL_REASON = isInternal
  ? "it opens full screen, loads faster, and it's the only way to get push notifications for new leads, orders, and claims"
  : "it opens full screen, loads faster, and works the way it's meant to on a phone";

// ─── Imperative open (Help menu → "Install on your phone") ─────────────────
export const INSTALL_GUIDE_EVENT = "anchor:install-guide:open";

export function openInstallGuide() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(INSTALL_GUIDE_EVENT));
}

// Chrome stashes its deferred install event here (see layout.tsx) — it can fire
// before React mounts.
declare global {
  interface Window {
    __anchorInstallEvent?: BeforeInstallPromptEvent | null;
  }
}

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

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

// There's nothing to install on a desktop, so nothing about this feature —
// gate or Help-menu entry — appears there.
export function isMobileDevice() {
  if (typeof window === "undefined") return false;
  return detectPlatform().platform !== "desktop";
}

// ─── Snapshot readers ──────────────────────────────────────────────────────
// These feed useSyncExternalStore, so each must return a primitive: a fresh
// object every call would never compare equal and would re-render forever.
const getPlatform = () => detectPlatform().platform;
const getIosBrowser = () => detectPlatform().iosBrowser;
const getCanPromptInstall = () => !!window.__anchorInstallEvent;

function getInstalled() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari's non-standard flag for home-screen launches.
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function getBypassed() {
  try {
    return window.sessionStorage.getItem(GATE_BYPASS_KEY) === "1";
  } catch {
    // Private-mode storage failures shouldn't wall someone out of the app.
    return true;
  }
}

// The user agent is fixed for the session, so there is nothing to subscribe to.
function subscribeNothing() {
  return () => {};
}

function subscribeDisplayMode(onChange: () => void) {
  const mq = window.matchMedia("(display-mode: standalone)");
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

// Chrome decides the app is installable whenever it likes — possibly before
// React mounts, which the pre-paint script catches and re-fires.
function subscribeInstallable(onChange: () => void) {
  window.addEventListener("anchor:installable", onChange);
  return () => window.removeEventListener("anchor:installable", onChange);
}

function subscribeBypass(onChange: () => void) {
  window.addEventListener(GATE_BYPASS_EVENT, onChange);
  return () => window.removeEventListener(GATE_BYPASS_EVENT, onChange);
}

export function InstallGate() {
  const pathname = usePathname() || "";

  // Opened from the Help menu — shows the guide even when the gate itself is
  // satisfied (already bypassed this session).
  const [manual, setManual] = useState(false);

  // Client-only facts. The server snapshots resolve to "no gate", so this never
  // renders during SSR and never mismatches on hydration.
  const platform = useSyncExternalStore<Platform>(subscribeNothing, getPlatform, () => "desktop");
  const iosBrowser = useSyncExternalStore(subscribeNothing, getIosBrowser, () => "safari" as const);
  const installed = useSyncExternalStore(subscribeDisplayMode, getInstalled, () => true);
  const bypassed = useSyncExternalStore(subscribeBypass, getBypassed, () => true);
  const canPromptInstall = useSyncExternalStore(subscribeInstallable, getCanPromptInstall, () => false);

  useEffect(() => {
    const onOpen = () => setManual(true);
    window.addEventListener(INSTALL_GUIDE_EVENT, onOpen);
    return () => window.removeEventListener(INSTALL_GUIDE_EVENT, onOpen);
  }, []);

  const gated = platform !== "desktop" && !installed && !bypassed && !isGateExemptPath(pathname);
  const visible = gated || (manual && platform !== "desktop");

  // Drop the pre-paint cover as soon as the gate stops applying, or it would
  // sit over the app for the rest of the page's life.
  useEffect(() => {
    if (!visible) document.documentElement.removeAttribute("data-install-gate");
  }, [visible]);

  const continueInBrowser = useCallback(() => {
    try {
      window.sessionStorage.setItem(GATE_BYPASS_KEY, "1");
    } catch { /* the snapshot falls back to "bypassed" anyway */ }
    setManual(false);
    window.dispatchEvent(new Event(GATE_BYPASS_EVENT));
  }, []);

  async function runChromeInstall() {
    const ev = window.__anchorInstallEvent;
    if (!ev) return;
    // A deferred prompt is single-use. Drop it and re-fire the event so the
    // snapshot re-reads and the button falls back to the manual steps.
    window.__anchorInstallEvent = null;
    window.dispatchEvent(new Event("anchor:installable"));
    await ev.prompt();
  }

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Install ${APP_NAME}`}
      // Above every other fixed element in the app — the bottom nav sits at
      // z-index 100 and the pre-paint cover at 9998.
      className="fixed inset-0 z-[9999] overflow-y-auto bg-[var(--surface-page)]"
      style={{
        paddingTop: "calc(env(safe-area-inset-top) + 1.5rem)",
        paddingBottom: "calc(env(safe-area-inset-bottom) + 1.5rem)",
      }}
    >
      <div className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center px-6">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={APP_LOGO} alt={APP_NAME} className="ds-logo mb-8 self-start" />

        <h1 className="text-2xl font-bold leading-tight text-[var(--anchor-deep)]">
          Install {APP_NAME}
        </h1>
        <p className="mt-2 text-sm leading-snug text-black/70">
          {APP_NAME} runs as an app on your phone, not a website. Add it to your home screen
          to sign in — {INSTALL_REASON}.
        </p>

        <div className="mt-7">
          {platform === "ios" ? (
            <IosSteps browser={iosBrowser} />
          ) : (
            <AndroidSteps canPrompt={canPromptInstall} onInstall={runChromeInstall} />
          )}
        </div>

        <button
          type="button"
          onClick={continueInBrowser}
          className="mx-auto mt-10 block text-xs font-medium text-black/45 underline underline-offset-4 transition hover:text-black/70"
        >
          Continue in browser
        </button>
      </div>
    </div>
  );
}

// ─── Per-platform steps ────────────────────────────────────────────────────

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--anchor-mint)]/60 text-sm font-bold text-[var(--anchor-deep)]">
        {n}
      </span>
      <span className="pt-1 text-sm leading-snug text-black/75">{children}</span>
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

// Safari's "More" control — a rounded rect holding three dots, the way iOS
// draws it, so it reads as the button on screen rather than as punctuation.
function MoreIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="mx-0.5 inline h-4 w-4 -translate-y-px text-[var(--anchor-green)]"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-label="More"
      role="img"
    >
      <rect x="2" y="6" width="20" height="12" rx="4" />
      <circle cx="8" cy="12" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.15" fill="currentColor" stroke="none" />
      <circle cx="16" cy="12" r="1.15" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IosSteps({ browser }: { browser: "safari" | "other" }) {
  return (
    <>
      <ol className="space-y-4">
        <Step n={1}>
          Tap the <MoreIcon /> button at the bottom of{" "}
          {browser === "safari" ? "Safari" : "the browser"}, then tap{" "}
          {/* Keep the label and its glyph on one line — wrapping between them
              strands the icon and the full stop on a line of their own. */}
          <span className="whitespace-nowrap">
            <strong>Share</strong>
            <ShareIcon />.
          </span>
        </Step>
        <Step n={2}>
          Scroll down the share sheet and tap <strong>Add to Home Screen</strong>.
        </Step>
        <Step n={3}>
          Tap <strong>Add</strong>, then open {APP_NAME} from your home screen to sign in.
        </Step>
      </ol>
      {browser === "safari" ? (
        // Safari's toolbar differs by iOS version and tab-bar setting: newer
        // ones tuck Share inside the ••• menu, older ones put the Share icon
        // straight on the bottom bar. Cover the second case rather than leaving
        // those users hunting for a button they don't have.
        <p className="mt-4 rounded-xl bg-[var(--anchor-mint)]/30 px-3 py-2.5 text-xs leading-snug text-black/70">
          If your Safari shows the Share icon <ShareIcon /> in the bottom bar instead of{" "}
          <MoreIcon />, tap that and go straight to step 2.
        </p>
      ) : (
        <p className="mt-4 rounded-xl bg-[var(--anchor-mint)]/30 px-3 py-2.5 text-xs leading-snug text-black/70">
          Don&rsquo;t see &ldquo;Add to Home Screen&rdquo;? Open this page in <strong>Safari</strong> and
          try again — iPhone only installs apps from Safari.
        </p>
      )}
    </>
  );
}

function AndroidSteps({ canPrompt, onInstall }: { canPrompt: boolean; onInstall: () => void }) {
  if (canPrompt) {
    return (
      <>
        <Button variant="primary" onClick={onInstall} className="w-full justify-center">
          Install app
        </Button>
        <p className="mt-2.5 text-center text-xs leading-snug text-black/55">
          Chrome will ask you to confirm, then open {APP_NAME} from your home screen to sign in.
        </p>
      </>
    );
  }
  return (
    <ol className="space-y-4">
      <Step n={1}>
        Tap the <strong>⋮</strong> menu in the top-right of the browser.
      </Step>
      <Step n={2}>
        Tap <strong>Add to Home screen</strong> (some versions say <strong>Install app</strong>).
      </Step>
      <Step n={3}>
        Confirm with <strong>Install</strong>, then open {APP_NAME} from your home screen to sign in.
      </Step>
    </ol>
  );
}
