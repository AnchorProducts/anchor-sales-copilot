"use client";

import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { useEffectiveRole } from "@/lib/role/viewAs";
import { APP_NAME } from "@/lib/appMode";

// ─── Public events / keys ──────────────────────────────────────────────────
export const TUTORIAL_START_EVENT = "anchor:tutorial:start";
// localStorage flag — set after a user finishes or skips the tour for a given
// role on this browser. Different roles get separate flags so an admin who
// previews "external_rep" doesn't suppress the real first-time auto-launch
// for an external rep on the same machine.
export const tutorialDoneKey = (role: string) => `anchor.tutorial.${role}.done`;
// Set by the View-As "Replay walkthrough" button when it needs to navigate
// to the dashboard before running the tour. The tutorial picks this up on
// mount and starts itself.
export const TUTORIAL_PENDING_KEY = "anchor.tutorial.pending";

type Role = "admin" | "anchor_rep" | "external_rep";

type Step = {
  // CSS selector for the highlighted element. Null/missing = centered modal
  // (used for intro/outro). The selector is queried at step time, so the
  // element doesn't need to exist on mount.
  target?: string;
  title: string;
  // Function form runs at render time, so copy can vary by viewport
  // (e.g. "use the sidebar" vs "use the bottom nav").
  body: string | (() => string);
  // If provided, the tour will navigate here before showing the step. Used
  // when a step lives on a different route than the previous one.
  path?: string;
  // Skip this step on the desktop layout. Used for steps that explain a
  // mobile-only affordance (e.g. the bottom nav's adaptive recent buttons,
  // which the fixed desktop sidebar doesn't have).
  mobileOnly?: boolean;
};

// True when the desktop sidebar is in play. Matches the Tailwind `lg`
// breakpoint used throughout the app.
function isDesktopViewport() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(min-width: 1024px)").matches;
}

// ─── Role-specific scripts ─────────────────────────────────────────────────
// Each script targets DOM nodes tagged with [data-tutorial="<key>"]. Steps
// without a target render as a centered modal (used for the welcome screen
// and the finish card).

const COMMON_INTRO: Step = {
  title: `Welcome to ${APP_NAME}`,
  body: "Quick 60-second tour so you know where everything lives. You can skip anytime — hit the Walkthrough option in your account menu to replay it later.",
};

const COMMON_OUTRO: Step = {
  title: "You're all set",
  body: "That's the tour. You can replay this walkthrough anytime from the account menu.",
};

// "Settings & Sign out" step uses a comma-list selector so it finds whichever
// element is actually on screen — the sidebar's bottom block on desktop, or
// the gear icon in the mobile nav pill.
const SETTINGS_TARGET = '[data-tutorial="settings-signout"], [data-tutorial="settings-mobile"]';

// The home button, pinned in both the desktop sidebar and the mobile bottom
// nav. Shown on both layouts — the spotlight lands on whichever is on screen.
const DASHBOARD_STEP: Step = {
  target: '[data-tutorial="nav-dashboard"]',
  title: "Back to home base",
  body: () => isDesktopViewport()
    ? "Dashboard is your home base. Click it anytime to return to your hub — quick actions, shortcuts, and what needs your attention."
    : "The home button takes you back to your dashboard anytime — quick actions, shortcuts, and what needs your attention.",
};

// Bottom-nav only: the two middle buttons aren't fixed — they swap to the
// sections you've opened most recently. Skipped on desktop, where the sidebar
// shows every link in a fixed order.
const RECENTS_STEP: Step = {
  target: '[data-tutorial="nav-recents"]',
  title: "Shortcuts that follow you",
  body: "The two buttons in the middle of the bar aren't fixed — they swap to the sections you open most, so your go-to tools are always one tap away. Dashboard, Support, and Settings stay put.",
  mobileOnly: true,
};

const STEPS_EXTERNAL: Step[] = [
  COMMON_INTRO,
  {
    target: '[data-tutorial="dashboard-hero"]',
    title: "Your dashboard hero",
    body: "This card always points to what you use most. Tap it to jump straight there.",
    path: "/dashboard",
  },
  {
    target: '[data-tutorial="quick-actions"]',
    title: "Quick Actions",
    body: "The four things you'll do most: browse the Resource Library, open Copilot, submit a Rooftop Equipment Consult, and file a Commission Claim.",
  },
  {
    target: '[data-tutorial="qa-assets"]',
    title: "Resource Library",
    body: "Photos, spec sheets, and sales tools for every Anchor solution. Search at the top finds anything across the library.",
  },
  {
    target: '[data-tutorial="qa-chat"]',
    title: "Sales Copilot",
    body: "Ask anything — product fit, install questions, pricing. It pulls from Anchor's docs and can recommend the right solution.",
  },
  {
    target: '[data-tutorial="qa-project"]',
    title: "Rooftop Equipment Consult",
    body: "When you spot a new opportunity, send the details to your inside sales team here. Photos, location, and equipment list.",
  },
  {
    target: '[data-tutorial="qa-commission"]',
    title: "Commission Claim",
    body: "File a claim before your order ships so it lands with your name on it.",
  },
  {
    target: '[data-tutorial="stat-service-state"]',
    title: "Service State",
    body: "Your assigned region. It decides which inside rep gets your consults — tap to change it in Settings.",
  },
  {
    target: '[data-tutorial="stat-your-rep"]',
    title: "Your Rep",
    body: "One-tap shortcut to call or open a Teams chat with your assigned inside sales rep.",
  },
  {
    target: '[data-tutorial="primary-nav"]',
    title: "Get around fast",
    body: () => isDesktopViewport()
      ? "Use the left sidebar to switch between Dashboard, Copilot, Assets, and your forms."
      : "Use the bottom nav to switch between Dashboard, Copilot, Assets, and your forms.",
  },
  DASHBOARD_STEP,
  RECENTS_STEP,
  {
    target: '[data-tutorial="nav-support"]',
    title: "Need a hand?",
    body: "Open Support to message an Anchor admin directly — questions, bugs, or anything blocking you. Replies come back right here in the app.",
  },
  {
    target: SETTINGS_TARGET,
    title: "Settings & Sign out",
    body: "Update your profile, service state, and language here. Sign out lives in the same spot on desktop, or in the Settings page on mobile.",
  },
  COMMON_OUTRO,
];

const STEPS_INTERNAL: Step[] = [
  COMMON_INTRO,
  {
    target: '[data-tutorial="dashboard-hero"]',
    title: "Your dashboard hero",
    body: "Quick link to your most-used tool — Copilot, Assets, or your Active Consults queue.",
    path: "/dashboard",
  },
  {
    target: '[data-tutorial="qa-consults"]',
    title: "Active Consults",
    body: "Rooftop Equipment Consults from external reps in your assigned states land here. Triage, assign, and update status.",
  },
  {
    target: '[data-tutorial="qa-chat"]',
    title: "Sales Copilot",
    body: "Ask product, install, or pricing questions. Pulls from Anchor's internal docs in addition to public material.",
  },
  {
    target: '[data-tutorial="qa-assets"]',
    title: "Resource Library",
    body: "Spec sheets, contacts, and internal assets per product. Use it to grab the right doc fast when you're on a call.",
  },
  {
    target: '[data-tutorial="stat-assets"]',
    title: "Asset Library shortcut",
    body: "One-tap jump into the full Resource Library — spec sheets, photos, sales tools.",
  },
  {
    target: '[data-tutorial="stat-copilot"]',
    title: "Copilot shortcut",
    body: "One-tap open of the Sales Copilot. Same as the Copilot tile, kept here for muscle memory.",
  },
  {
    target: '[data-tutorial="primary-nav"]',
    title: "Get around fast",
    body: () => isDesktopViewport()
      ? "The left sidebar gets you anywhere fast. The Consults link takes you straight to the queue."
      : "The bottom nav gets you anywhere fast. The Consults icon takes you straight to the queue.",
  },
  DASHBOARD_STEP,
  RECENTS_STEP,
  {
    target: '[data-tutorial="nav-support"]',
    title: "Need a hand?",
    body: "Open Support to message an Anchor admin directly — questions, bugs, or anything blocking you. Replies come back right here in the app.",
  },
  {
    target: SETTINGS_TARGET,
    title: "Settings & Sign out",
    body: "Update your profile and language here. Sign out lives in the same spot on desktop, or in the Settings page on mobile.",
  },
  COMMON_OUTRO,
];

const STEPS_ADMIN: Step[] = [
  COMMON_INTRO,
  {
    target: '[data-tutorial="dashboard-hero"]',
    title: "Your dashboard hero",
    body: "Quick link to your most-used tool. As admin, you also have direct shortcuts to the admin console and reports.",
    path: "/dashboard",
  },
  {
    target: '[data-tutorial="quick-actions"]',
    title: "Quick Actions",
    body: "You see every user-facing action plus the admin tools — Admin Console for reps and activity, Assessment Reports for rooftop audits.",
  },
  {
    target: '[data-tutorial="qa-admin"]',
    title: "Admin Console",
    body: "Configure outside reps and their assigned states, review user activity, asset reviews, and the knowledge base.",
  },
  {
    target: '[data-tutorial="qa-reports"]',
    title: "Assessment Reports",
    body: "Every Rooftop Equipment Audit submission, viewable in detail. Admin-only.",
  },
  {
    target: '[data-tutorial="stat-reps"]',
    title: "Service Reps shortcut",
    body: "Jump straight to the rep manager — add/remove outside reps and assign their states.",
  },
  {
    target: '[data-tutorial="stat-reports"]',
    title: "Reports shortcut",
    body: "Direct link to the rooftop assessment audit submissions.",
  },
  {
    target: '[data-tutorial="primary-nav"]',
    title: "Get around fast",
    body: () => isDesktopViewport()
      ? "The left sidebar puts Dashboard, Copilot, Assets, Admin, and Reports one click away."
      : "The bottom nav puts Dashboard, Copilot, Assets, Admin, and Reports one tap away.",
  },
  DASHBOARD_STEP,
  RECENTS_STEP,
  {
    target: '[data-tutorial="nav-support"]',
    title: "Support queue",
    body: "Every support request from reps and external partners lands here. Read and reply to each thread without leaving the app.",
  },
  {
    target: SETTINGS_TARGET,
    title: "Settings & Sign out",
    body: "Update your profile and language here. Sign out lives in the same spot on desktop, or in the Settings page on mobile.",
  },
  {
    target: '[data-tutorial="view-as-button"]',
    title: "View As",
    body: "Preview the app as an external rep or internal sales rep — useful for QA and onboarding. The same menu has a Replay Walkthrough option so you can re-run this tour from any view.",
  },
  COMMON_OUTRO,
];

function stepsForRole(role: Role | string): Step[] {
  let base: Step[];
  if (role === "external_rep") base = STEPS_EXTERNAL;
  else if (role === "anchor_rep") base = STEPS_INTERNAL;
  else if (role === "admin") base = STEPS_ADMIN;
  else return [];
  // Drop mobile-only steps when the desktop sidebar is in play.
  return isDesktopViewport() ? base.filter((s) => !s.mobileOnly) : base;
}

// ─── Imperative API used by the View-As switcher ───────────────────────────
export function startTutorial(role?: Role) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(TUTORIAL_START_EVENT, { detail: { role } }));
}

// ─── Component ─────────────────────────────────────────────────────────────

// Hide on auth screens — same convention as the sidebar and View-As switcher.
const HIDE_EXACT = new Set(["/", "/signup", "/forgot", "/reset"]);
const HIDE_PREFIXES = ["/auth"];
function shouldHide(pathname: string) {
  if (HIDE_EXACT.has(pathname)) return true;
  return HIDE_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

type Rect = { top: number; left: number; width: number; height: number };

export function AppTutorial() {
  const pathname = usePathname() || "";
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);

  const [actualRole, setActualRole] = useState<string | null>(null);
  const [roleLoaded, setRoleLoaded] = useState(false);
  const effectiveRole = useEffectiveRole(actualRole) || actualRole || "";

  const [active, setActive] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [steps, setSteps] = useState<Step[]>([]);
  const [rect, setRect] = useState<Rect | null>(null);
  const tickRef = useRef<number | null>(null);

  // Pull the user's actual role once so auto-launch knows what to show.
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!alive) return;
      if (!u.user) {
        setRoleLoaded(true);
        return;
      }
      const { data: prof } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", u.user.id)
        .maybeSingle();
      if (!alive) return;
      setActualRole((prof as { role: string | null } | null)?.role || null);
      setRoleLoaded(true);
    })();
    return () => { alive = false; };
  }, [supabase]);

  const close = useCallback((markDone: boolean) => {
    setActive(false);
    setStepIdx(0);
    setRect(null);
    if (markDone) {
      try {
        const r = effectiveRole || actualRole;
        if (r) window.localStorage.setItem(tutorialDoneKey(r), "1");
      } catch { /* ignore */ }
    }
  }, [effectiveRole, actualRole]);

  // Listen for manual start (from View As menu or anywhere else).
  useEffect(() => {
    function onStart(e: Event) {
      const detail = (e as CustomEvent).detail as { role?: Role } | undefined;
      const requested = detail?.role || effectiveRole || actualRole || "";
      const next = stepsForRole(requested);
      if (next.length === 0) return;
      setSteps(next);
      setStepIdx(0);
      setActive(true);
    }
    window.addEventListener(TUTORIAL_START_EVENT, onStart);
    return () => window.removeEventListener(TUTORIAL_START_EVENT, onStart);
  }, [effectiveRole, actualRole]);

  // Auto-launch on first dashboard visit per role. Admin's auto-launch only
  // fires when not previewing another role — otherwise an admin previewing
  // an external view would suppress the external user's real first run.
  // Also handles the "pending replay" handoff from the View-As menu, which
  // sets a sessionStorage key before navigating to /dashboard.
  useEffect(() => {
    if (!roleLoaded) return;
    if (shouldHide(pathname)) return;
    if (pathname !== "/dashboard") return;
    if (active) return;

    // 1) Replay requested before nav — honor it regardless of "done" state.
    try {
      const pending = window.sessionStorage.getItem(TUTORIAL_PENDING_KEY);
      if (pending) {
        window.sessionStorage.removeItem(TUTORIAL_PENDING_KEY);
        const next = stepsForRole(pending);
        if (next.length > 0) {
          setSteps(next);
          setStepIdx(0);
          setActive(true);
          return;
        }
      }
    } catch { /* ignore */ }

    // 2) Real first-time auto-launch — gated by the per-role "done" flag.
    if (!actualRole) return;
    try {
      const done = window.localStorage.getItem(tutorialDoneKey(actualRole));
      if (done === "1") return;
    } catch { return; }
    const next = stepsForRole(actualRole);
    if (next.length === 0) return;
    setSteps(next);
    setStepIdx(0);
    setActive(true);
  }, [roleLoaded, actualRole, pathname, active]);

  const step = active ? steps[stepIdx] : null;

  // Navigate to step.path before computing the spotlight rect. Otherwise the
  // selector might not exist on the current page.
  useEffect(() => {
    if (!step) return;
    if (step.path && pathname !== step.path) {
      router.push(step.path);
    }
  }, [step, pathname, router]);

  // Compute the highlight rect. Retries on a short interval until the element
  // shows up (handles SSR'd routes, lazy-mounted nav, async data fetches that
  // gate a tile's appearance, etc.). Also re-measures on scroll/resize.
  //
  // We use querySelectorAll + visibility check because mobile and desktop
  // dashboard layouts both render the same data-tutorial attributes — only
  // one is visible at a time (the other is display:none via responsive
  // utilities). querySelector alone would return the first DOM match,
  // which may be the hidden one.
  const measure = useCallback(() => {
    if (!step) return;
    if (!step.target) { setRect(null); return; }
    const nodes = document.querySelectorAll(step.target);
    const visible = (Array.from(nodes) as HTMLElement[]).filter(
      (h) => h.offsetWidth > 0 && h.offsetHeight > 0
    );
    if (visible.length === 0) { setRect(null); return; }
    // Union every visible match so one step can spotlight more than a single
    // element — e.g. the bottom nav's two adaptive recent buttons. The
    // mobile/desktop duplicates never co-occur (only one layout is on screen),
    // so single-target steps still produce exactly that element's rect.
    let top = Infinity, left = Infinity, right = -Infinity, bottom = -Infinity;
    for (const el of visible) {
      const r = el.getBoundingClientRect();
      top = Math.min(top, r.top);
      left = Math.min(left, r.left);
      right = Math.max(right, r.right);
      bottom = Math.max(bottom, r.bottom);
    }
    setRect({ top, left, width: right - left, height: bottom - top });
    // Bring the target into view if it's offscreen.
    if (top < 0 || bottom > window.innerHeight) {
      visible[0].scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [step]);

  useLayoutEffect(() => {
    if (!step) return;
    measure();
    // Re-attempt for up to ~3s in case the target mounts late.
    let tries = 0;
    if (tickRef.current) window.clearInterval(tickRef.current);
    tickRef.current = window.setInterval(() => {
      tries += 1;
      // Same visibility-aware lookup as measure() — mobile + desktop layouts
      // share data-tutorial attributes and only one is visible at a time.
      let visible: HTMLElement | null = null;
      if (step.target) {
        const nodes = document.querySelectorAll(step.target);
        for (const n of Array.from(nodes)) {
          const h = n as HTMLElement;
          if (h.offsetWidth > 0 && h.offsetHeight > 0) { visible = h; break; }
        }
      }
      if (visible || tries > 30) {
        measure();
        if (visible || tries > 30) {
          if (tickRef.current) window.clearInterval(tickRef.current);
          tickRef.current = null;
        }
      }
    }, 100) as unknown as number;
    return () => {
      if (tickRef.current) { window.clearInterval(tickRef.current); tickRef.current = null; }
    };
  }, [step, measure, pathname]);

  useEffect(() => {
    if (!active) return;
    const onResize = () => measure();
    const onScroll = () => measure();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [active, measure]);

  // Escape closes the tour.
  useEffect(() => {
    if (!active) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close(true);
      if (e.key === "ArrowRight") goNext();
      if (e.key === "ArrowLeft") goPrev();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, stepIdx, steps]);

  function goNext() {
    if (stepIdx >= steps.length - 1) {
      close(true);
      return;
    }
    setStepIdx((i) => i + 1);
  }
  function goPrev() {
    setStepIdx((i) => Math.max(0, i - 1));
  }

  if (!active || !step) return null;
  if (shouldHide(pathname)) return null;

  const total = steps.length;
  const isFirst = stepIdx === 0;
  const isLast = stepIdx === total - 1;

  // ─── Tooltip placement ──────────────────────────────────────────────────
  // No target → centered modal. Target → place below if room, otherwise above,
  // otherwise center. Mobile defaults to bottom-anchored card to keep things
  // simple.
  const TIP_W = 320;
  const TIP_GUTTER = 12;

  let tipStyle: React.CSSProperties;
  if (!rect) {
    tipStyle = {
      position: "fixed",
      left: "50%",
      top: "50%",
      transform: "translate(-50%, -50%)",
      width: `min(${TIP_W}px, calc(100vw - 32px))`,
      zIndex: 110,
    };
  } else {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // Rough card-height estimate used only to decide above-vs-below. The
    // actual placement below uses `top` (anchors at the top edge) or
    // `bottom` (anchors at the bottom edge), so the card growing past the
    // estimate never causes it to overlap the spotlight.
    const TIP_H_EST = 200;
    const placeBelow = rect.top + rect.height + TIP_GUTTER + TIP_H_EST < vh;
    let left = rect.left + rect.width / 2 - TIP_W / 2;
    left = Math.max(12, Math.min(left, vw - TIP_W - 12));
    if (placeBelow) {
      tipStyle = {
        position: "fixed",
        top: rect.top + rect.height + TIP_GUTTER,
        left,
        width: `min(${TIP_W}px, calc(100vw - 24px))`,
        zIndex: 110,
      };
    } else {
      // Anchor by `bottom` so the card grows upward from a fixed point just
      // above the spotlight — guarantees no overlap regardless of card height.
      tipStyle = {
        position: "fixed",
        bottom: Math.max(12, vh - rect.top + TIP_GUTTER),
        left,
        width: `min(${TIP_W}px, calc(100vw - 24px))`,
        zIndex: 110,
      };
    }
  }

  return (
    <>
      {/* Dim layer. Clicking it advances — common convention for tours. */}
      <div
        onClick={goNext}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(4, 24, 18, 0.55)",
          zIndex: 100,
          backdropFilter: "blur(1px)",
        }}
      />

      {/* Spotlight ring around the highlighted element. */}
      {rect && (
        <div
          aria-hidden
          style={{
            position: "fixed",
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12,
            borderRadius: 16,
            boxShadow:
              "0 0 0 9999px rgba(4, 24, 18, 0.0), 0 0 0 3px rgba(255,255,255,0.95), 0 0 0 6px rgba(8, 145, 78, 0.55), 0 10px 40px rgba(0,0,0,0.35)",
            pointerEvents: "none",
            zIndex: 105,
            transition: "top 160ms ease, left 160ms ease, width 160ms ease, height 160ms ease",
          }}
        />
      )}

      {/* Tooltip card */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={step.title}
        style={tipStyle}
        className="rounded-2xl bg-white p-5 shadow-[0_24px_60px_rgba(0,0,0,0.35)]"
      >
        <div className="flex items-center justify-between gap-3">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--anchor-green)]">
            Step {stepIdx + 1} of {total}
          </div>
          <button
            type="button"
            onClick={() => close(true)}
            aria-label="Skip walkthrough"
            className="-mr-1 rounded-full p-1 text-black/40 transition hover:bg-black/5 hover:text-black/70"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <h3 className="mt-2 text-lg font-bold leading-tight text-[var(--anchor-deep)]">{step.title}</h3>
        <p className="mt-1.5 text-sm leading-snug text-black/70">{typeof step.body === "function" ? step.body() : step.body}</p>

        <div className="mt-4 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => close(true)}
            className="text-xs font-semibold text-black/55 transition hover:text-black"
          >
            Skip tour
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={goPrev}
              disabled={isFirst}
              className="rounded-full px-3 py-1.5 text-xs font-semibold text-[var(--anchor-deep)] transition hover:bg-black/[0.04] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Back
            </button>
            <button
              type="button"
              onClick={goNext}
              className="rounded-full bg-[var(--anchor-deep)] px-4 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[var(--anchor-green)]"
            >
              {isLast ? "Finish" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
