"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { AppNavbar } from "@/app/components/ui/AppNavbar";
import { Card } from "@/app/components/ui/Card";
import { useTranslation } from "@/lib/i18n/useTranslation";
import OrdersPanel from "@/app/admin/marketing-orders/OrdersPanel";
import InventoryPanel from "@/app/admin/inventory/InventoryPanel";
import SubmissionsPanel from "@/app/marketing/submissions/SubmissionsPanel";
import { useSiteLive } from "@/lib/flags/useSiteLive";
import { isInternal } from "@/lib/appMode";

export const dynamic = "force-dynamic";

type MarketingTab = "orders" | "inventory" | "submissions";

function tabFromUrl(): MarketingTab {
  if (typeof window === "undefined") return "orders";
  const t = new URLSearchParams(window.location.search).get("tab");
  if (t === "inventory") return "inventory";
  if (t === "submissions") return "submissions";
  return "orders";
}

export default function MarketingAdminCenterPage() {
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const { t } = useTranslation();

  const [ready, setReady] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [role, setRole] = useState<string>("");
  const [tab, setTab] = useState<MarketingTab>("orders");
  // Gates the Submissions tab. Starts false, so the tab never flashes into view
  // while the flag is still loading.
  const { live } = useSiteLive();

  // Pick up the initial tab from the URL (so deep links / refresh land correctly).
  useEffect(() => {
    setTab(tabFromUrl());
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!alive) return;
      if (!data.user) {
        router.replace("/");
        return;
      }
      const { data: prof } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.user.id)
        .maybeSingle();
      const userRole = String((prof as { role?: string } | null)?.role || "");
      if (userRole !== "admin" && userRole !== "anchor_rep") {
        setAccessError("This page is for the Anchor fulfillment team.");
        setReady(true);
        return;
      }
      setRole(userRole);
      setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, [router, supabase]);

  function selectTab(next: MarketingTab) {
    setTab(next);
    // Keep the URL in sync without a full navigation, so the tab is shareable.
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.searchParams.set("tab", next);
      window.history.replaceState(null, "", url.toString());
    }
  }

  // Submissions is part of the Pitch to Marketing feature set, so it only
  // exists once an admin has flipped "Site live" in Manage Tools. Until then the
  // tab isn't rendered at all — not shown-and-disabled — matching how the rest
  // of that feature set stays completely invisible.
  //
  // It also requires the INTERNAL build: requireMarketingUser() fails closed on
  // the external deploy, so on that build the tab could only ever open onto a
  // 403. Better to not offer it than to offer it broken.
  const showSubmissions = live && isInternal;

  const tabs: { key: MarketingTab; label: string }[] = [
    { key: "orders", label: "Orders" },
    { key: "inventory", label: "Inventory" },
    ...(showSubmissions ? [{ key: "submissions" as const, label: "Submissions" }] : []),
  ];

  // Deep-linking to ?tab=submissions when it isn't available (flag off, wrong
  // build, or switched off while someone sat on the tab) must not strand the
  // page on a tab that isn't there.
  const activeTab: MarketingTab = tab === "submissions" && !showSubmissions ? "orders" : tab;

  return (
    <main className="ds-page">
      <AppNavbar
        title="Marketing Admin Center"
        subtitle="Orders & inventory"
        menuItems={[
          { label: t("dashboard"), href: "/dashboard" },
          ...(role === "admin" ? [{ label: "Admin Console", href: "/admin" }] : []),
        ]}
      />

      <div className="ds-container py-6 pb-[calc(3rem+env(safe-area-inset-bottom))] sm:py-10">
        {!ready ? (
          <Card className="p-5 text-sm text-black/60">{t("loading")}</Card>
        ) : accessError ? (
          <Card className="border-[var(--anchor-deep)]/25 bg-[var(--anchor-mint)] p-5 text-sm text-[var(--anchor-deep)]">
            {accessError}
          </Card>
        ) : (
          <>
            <div className="mb-2 flex gap-2 border-b border-[var(--border-default)] pb-2">
              {tabs.map((tb) => (
                <button
                  key={tb.key}
                  type="button"
                  onClick={() => selectTab(tb.key)}
                  className={`rounded-xl px-4 py-2 text-sm font-semibold ${
                    activeTab === tb.key
                      ? "bg-[var(--anchor-green)] text-white"
                      : "border border-[var(--border-default)] bg-white text-[var(--anchor-deep)]"
                  }`}
                >
                  {tb.label}
                </button>
              ))}
            </div>

            {/* Each panel renders embedded — no nav shell of its own. Mounting only
                the active tab keeps its data fresh on switch. */}
            {activeTab === "orders" ? (
              <OrdersPanel embedded />
            ) : activeTab === "inventory" ? (
              <InventoryPanel embedded />
            ) : (
              <SubmissionsPanel embedded />
            )}
          </>
        )}
      </div>
    </main>
  );
}
