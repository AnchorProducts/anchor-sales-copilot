import { AppNavbar } from "@/app/components/ui/AppNavbar";
import { Card } from "@/app/components/ui/Card";

// A simple placeholder screen for features that are temporarily paused. The real
// implementation for each paused route is preserved in a sibling file (e.g.
// Real*Page.tsx); re-enable by pointing the route's page.tsx back at it.
export default function ComingSoon({
  title,
  message,
}: {
  title: string;
  message?: string;
}) {
  return (
    <main className="ds-page">
      <AppNavbar
        title={title}
        subtitle="Coming soon"
        menuItems={[{ label: "Dashboard", href: "/dashboard" }]}
      />
      <div className="ds-container py-16">
        <Card className="mx-auto max-w-md p-8 text-center">
          <div className="text-4xl" aria-hidden>
            🚧
          </div>
          <h1 className="mt-3 text-2xl font-bold text-[var(--anchor-deep)]">Coming soon</h1>
          <p className="mt-2 text-sm text-[var(--anchor-gray)]">
            {message || `${title} isn’t available yet. Check back soon.`}
          </p>
          <a
            href="/dashboard"
            className="mt-6 inline-flex items-center justify-center rounded-xl bg-[var(--anchor-green)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--anchor-deep)]"
          >
            Back to dashboard
          </a>
        </Card>
      </div>
    </main>
  );
}
