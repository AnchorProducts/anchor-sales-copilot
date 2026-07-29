"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

/* ============================================================================
 * Hide a floating overlay while it is sitting on top of a button.
 *
 * The app has a few `position: fixed` pills (the View-As switcher, the help
 * menu). They're placed to sit in empty space, but "empty" depends on the page
 * and the scroll position — scroll a form up and a Save button can end up
 * underneath one, unreachable.
 *
 * This watches for that: while a real button is under the overlay, the overlay
 * fades out and stops taking pointer events, so the button below is clickable.
 * Scroll the button away and the overlay comes back.
 *
 * How the test works — hit-testing, not rectangle maths against every button on
 * the page. `elementsFromPoint` returns the paint stack at a point, so sampling
 * a few points across the overlay and looking at what's *under* it is both
 * cheaper and more accurate than iterating the DOM: it accounts for z-order,
 * transforms, and elements clipped out of view, which naive rect comparison
 * gets wrong.
 *
 * Notes:
 *  - Only true buttons count. Every text link on the page would make this fire
 *    constantly, and the point is reaching controls, not prose.
 *  - Never hides while `enabled` is false — callers pass `!menuOpen`, so an
 *    overlay can't vanish out from under someone using it.
 *  - Measurement uses the overlay's own rect, which survives the hidden state
 *    (opacity/pointer-events, not display), so it can tell when to come back.
 * ==========================================================================*/

const BUTTON_SELECTOR =
  'button, [role="button"], input[type="submit"], input[type="button"]';

/** Points to sample across the overlay, as fractions of its box. */
const SAMPLES: Array<[number, number]> = [
  [0.5, 0.5],
  [0.12, 0.12],
  [0.88, 0.12],
  [0.12, 0.88],
  [0.88, 0.88],
];

export function useHideWhenOverlapping(
  ref: React.RefObject<HTMLElement | null>,
  { enabled = true }: { enabled?: boolean } = {}
): boolean {
  const [hidden, setHidden] = useState(false);
  const frame = useRef<number | null>(null);
  const pathname = usePathname();

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;

    // While disabled the result is derived at return, so there's nothing to set.
    if (!enabled) return;

    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      setHidden(false);
      return;
    }

    const covering = SAMPLES.some(([fx, fy]) => {
      const x = rect.left + rect.width * fx;
      const y = rect.top + rect.height * fy;
      // Off-screen points can't be covering anything.
      if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) return false;

      for (const node of document.elementsFromPoint(x, y)) {
        // Skip the overlay itself and anything inside it.
        if (el.contains(node)) continue;
        // First thing underneath decides: a button means we're in the way,
        // anything else means we're over ordinary content.
        return Boolean((node as Element).closest?.(BUTTON_SELECTOR));
      }
      return false;
    });

    setHidden(covering);
  }, [enabled, ref]);

  const schedule = useCallback(() => {
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      measure();
    });
  }, [measure]);

  useEffect(() => {
    schedule();
    // Capture phase so inner scroll containers are caught too, not just window.
    window.addEventListener("scroll", schedule, { passive: true, capture: true });
    window.addEventListener("resize", schedule, { passive: true });

    // Layout can change without a scroll — a panel expands, a list loads.
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });

    return () => {
      window.removeEventListener("scroll", schedule, { capture: true } as EventListenerOptions);
      window.removeEventListener("resize", schedule);
      observer.disconnect();
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [schedule]);

  // Re-check on navigation: same overlay, entirely different page beneath it.
  // Just re-measure — the next frame settles it, so there's no need to flash it
  // back into view synchronously first.
  useEffect(() => {
    schedule();
  }, [pathname, schedule]);

  // Derived rather than stored, so a disabled overlay is never left stuck
  // hidden by whatever the last measurement happened to be.
  return enabled && hidden;
}

/** Classes for the hidden state. Kept here so both overlays fade identically. */
export const HIDE_WHEN_OVERLAPPING_CLASS =
  "pointer-events-none opacity-0 transition-opacity duration-150";
export const SHOW_WHEN_CLEAR_CLASS = "transition-opacity duration-150";
