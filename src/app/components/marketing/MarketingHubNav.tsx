"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/* ============================================================================
 * Marketing Hub navigation. Currently fronts the two modules the app owns —
 * the pitch Submissions inbox and the transactional email templates. Further
 * hub modules (campaigns, links, contacts, funnel, …) slot in here as they are
 * ported from the Anchor Internal Portal.
 * ==========================================================================*/

const MODULES = [
  { href: "/marketing/submissions", label: "Submissions" },
  { href: "/marketing/email-templates", label: "Email templates" },
];

export function MarketingHubNav() {
  const pathname = usePathname();

  return (
    <nav className="mb-5 flex flex-wrap gap-2" aria-label="Marketing Hub">
      {MODULES.map((m) => {
        const active = pathname === m.href || pathname.startsWith(`${m.href}/`);
        return (
          <Link
            key={m.href}
            href={m.href}
            aria-current={active ? "page" : undefined}
            className={
              "rounded-full border px-4 py-2 text-[13px] font-semibold transition " +
              (active
                ? "border-[var(--anchor-green)] bg-[var(--anchor-green)] text-white"
                : "border-black/10 bg-white text-black hover:bg-[var(--surface-soft)]")
            }
          >
            {m.label}
          </Link>
        );
      })}
    </nav>
  );
}
