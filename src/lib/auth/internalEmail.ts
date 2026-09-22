// Which email domains belong to Anchor.
//
// A first sign-in creates the person's profile, and the email domain decides
// what they get: an internal sales rep (anchor_rep) or an outside rep
// (external_rep). Anchor's own staff don't all share one domain — icalcit.com
// and rte-solutions.com are Anchor too — so the list lives here rather than
// being spelled out at each sign-in path.
//
// It only affects profiles created from here on. An existing profile keeps
// whatever role it has; an admin changes that from the Users page.

export const INTERNAL_EMAIL_DOMAINS = ["anchorp.com", "icalcit.com", "rte-solutions.com"] as const;

export function isInternalEmail(email: string | null | undefined): boolean {
  const value = String(email || "").trim().toLowerCase();
  const at = value.lastIndexOf("@");
  if (at < 0) return false;
  const domain = value.slice(at + 1);
  return INTERNAL_EMAIL_DOMAINS.some((d) => domain === d);
}
