"use client";

import { useRouter } from "next/navigation";
import { AppNavbar } from "@/app/components/ui/AppNavbar";
import { Card } from "@/app/components/ui/Card";
import Button from "@/app/components/ui/Button";
import { PAGE_TOUR_LIST, setPendingPageTutorial } from "@/app/components/tutorial/AppTutorial";

export const dynamic = "force-dynamic";

export default function AdminWalkthroughsPage() {
  const router = useRouter();

  // Stash the requested tour, then navigate to its page. AppTutorial picks up
  // the handoff on arrival and runs the same walkthrough a user would see.
  const preview = (key: string, route: string) => {
    setPendingPageTutorial(key);
    router.push(route);
  };

  return (
    <main className="ds-page">
      <AppNavbar
        title="Walkthroughs"
        subtitle="Preview each page's guided tour"
        menuItems={[{ label: "Admin", href: "/admin" }]}
      />

      <div className="ds-container py-6 pb-[calc(2rem+env(safe-area-inset-bottom))] sm:py-10">
        <div className="mx-auto max-w-3xl">
          <Card className="mb-4 border-t-4 border-t-[var(--anchor-green)] p-6">
            <div className="ds-caption">Walkthroughs</div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--anchor-deep)]">Page walkthroughs</h1>
            <p className="mt-1 text-sm text-[var(--anchor-gray)]">
              Preview the guided tour users see on each page. We&rsquo;ll take you to the page and run its
              walkthrough &mdash; exactly what a user sees when they tap the &ldquo;?&rdquo; button.
            </p>
          </Card>

          <ul className="space-y-2">
            {PAGE_TOUR_LIST.map((tour) => (
              <li key={tour.key}>
                <Card className="flex items-center justify-between gap-4 p-4">
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-[var(--anchor-deep)]">{tour.label}</div>
                    <div className="truncate text-xs text-[var(--anchor-gray)]">{tour.route}</div>
                  </div>
                  <Button
                    variant="primary"
                    className="shrink-0 px-4 py-2 text-sm"
                    onClick={() => preview(tour.key, tour.route)}
                  >
                    Preview
                  </Button>
                </Card>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </main>
  );
}
