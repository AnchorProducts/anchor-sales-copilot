"use client";

import Link from "next/link";
import { Card } from "@/app/components/ui/Card";

/* ============================================================================
 * Shown in place of any surface that is still dark behind the "Site live"
 * flag. Deliberately says nothing about what the feature does — someone who
 * lands on the URL before launch just learns it isn't available.
 * ==========================================================================*/
export function NotLiveNotice() {
  return (
    <Card className="p-8 text-center">
      <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-full bg-[var(--surface-soft)]">
        <svg viewBox="0 0 24 24" className="h-5 w-5 text-[var(--anchor-gray)]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="3" y="11" width="18" height="11" rx="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      </div>
      <h2 className="text-base font-semibold text-[var(--anchor-deep)]">Not available yet</h2>
      <p className="mx-auto mt-1 max-w-sm text-sm text-[var(--anchor-gray)]">
        This part of the app hasn&apos;t been switched on. Check back once it&apos;s released.
      </p>
      <Link
        href="/dashboard"
        className="mt-4 inline-flex h-10 items-center rounded-xl bg-[var(--anchor-green)] px-5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
      >
        Back to dashboard
      </Link>
    </Card>
  );
}
