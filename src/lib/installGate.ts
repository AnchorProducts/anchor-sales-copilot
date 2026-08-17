// Constants shared between the InstallGate client component and the pre-paint
// script that the root layout inlines into <head>.
//
// These deliberately live in a plain module rather than in InstallGate.tsx: a
// Server Component importing from a "use client" module receives client
// reference proxies instead of the real values, so interpolating them into the
// inline script would emit `undefined` (and, for the regex source, syntactically
// broken JS). Keeping them here means both sides read the same literals.

// Paths a phone browser may still reach. Sign-in callbacks and password resets
// arrive as email links that have to work where they're opened, /docs is
// published documentation, and /grab is the public QR pickup page whose
// visitors aren't app users at all.
export const GATE_EXEMPT_PREFIXES = ["/auth", "/docs", "/grab", "/reset", "/forgot"];

// Set when someone takes the "continue in browser" escape hatch. sessionStorage,
// not localStorage: it lasts the rest of that browsing session, then the gate
// returns on the next visit rather than being permanently waived by one tap.
export const GATE_BYPASS_KEY = "anchor.installGate.bypass";

// Source text, not a RegExp, because it is interpolated into the inline script.
export const MOBILE_UA_PATTERN = "iPhone|iPad|iPod|Android";

export function isGateExemptPath(pathname: string) {
  return GATE_EXEMPT_PREFIXES.some((p) => pathname === p || pathname.startsWith(p + "/"));
}
