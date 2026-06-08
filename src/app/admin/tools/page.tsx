"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { AppNavbar } from "@/app/components/ui/AppNavbar";
import { Card } from "@/app/components/ui/Card";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { ToolLoader } from "@/app/components/visuals/FeatureGraphic";
import { CARDS, BADGE_STYLE, TileIcon } from "../cards";
import { SALES_TOOLS, salesToolKey, type SalesAudience } from "@/lib/salesTools";

export const dynamic = "force-dynamic";

const SALES_AUDIENCES: SalesAudience[] = ["internal", "external"];

export default function AdminToolsPage() {
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const { t } = useTranslation();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Per-tool active state, defaulting every tool to active (no row = active).
  const [active, setActive] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(CARDS.map((c) => [c.key, true]))
  );
  // Sales tools, keyed by composite `sales:<audience>:<key>`, also default on.
  const [salesActive, setSalesActive] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const tool of SALES_TOOLS) {
      for (const aud of tool.audiences) init[salesToolKey(aud, tool.key)] = true;
    }
    return init;
  });
  const [saving, setSaving] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!alive) return;
      if (!data.user) { router.replace("/"); return; }

      const { data: prof } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.user.id)
        .maybeSingle();

      const role = String((prof as { role?: string } | null)?.role || "");
      if (role !== "admin") {
        setError("Admin access only.");
        setReady(true);
        return;
      }

      const { data: tools } = await supabase
        .from("admin_tools")
        .select("key,active");
      if (!alive) return;
      if (tools) {
        const rows = tools as Array<{ key: string; active: boolean }>;
        setActive((prev) => {
          const next = { ...prev };
          for (const row of rows) if (row.key in next) next[row.key] = row.active;
          return next;
        });
        setSalesActive((prev) => {
          const next = { ...prev };
          for (const row of rows) if (row.key in next) next[row.key] = row.active;
          return next;
        });
      }
      setReady(true);
    })();
    return () => { alive = false; };
  }, [router, supabase]);

  async function toggle(
    key: string,
    nextActive: boolean,
    setMap: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  ) {
    // Optimistic update, rolled back if the request fails.
    setMap((prev) => ({ ...prev, [key]: nextActive }));
    setSaving(key);
    setSaveError(null);
    try {
      const res = await fetch("/api/admin/tools", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, active: nextActive }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Failed to save");
      }
    } catch (e) {
      setMap((prev) => ({ ...prev, [key]: !nextActive }));
      setSaveError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(null);
    }
  }

  const activeCount = CARDS.filter((c) => active[c.key]).length;

  return (
    <main className="ds-page">
      <AppNavbar
        title="Manage Tools"
        subtitle="Activate or deactivate admin & sales tools"
        menuItems={[
          { label: "Admin Console", href: "/admin" },
          { label: t("dashboard"), href: "/dashboard" },
        ]}
      />

      <div className="ds-container py-6 pb-[calc(2rem+env(safe-area-inset-bottom))] sm:py-10">
        {!ready ? (
          <ToolLoader feature="admin" label={t("loading")} />
        ) : error ? (
          <Card className="border-[var(--anchor-deep)]/25 bg-[var(--anchor-mint)] p-5 text-sm text-[var(--anchor-deep)]">
            {error}
          </Card>
        ) : (
          <>
            {saveError && (
              <Card className="mb-4 border-red-300 bg-red-50 p-3 text-sm text-red-700">
                {saveError}
              </Card>
            )}

            {/* Admin Console tools */}
            <h2 className="text-lg font-bold text-[var(--anchor-deep)]">Admin Console tools</h2>
            <p className="mb-4 mt-1 text-sm text-[var(--anchor-gray)]">
              Deactivated tools are hidden from the Admin Console for everyone. {activeCount} of {CARDS.length} active.
            </p>
            <div className="flex flex-col gap-2.5">
              {CARDS.map((card) => {
                const isOn = active[card.key];
                return (
                  <Card
                    key={card.key}
                    className={`flex items-center gap-4 p-4 transition ${isOn ? "" : "opacity-60"}`}
                  >
                    <span className="inline-flex shrink-0 items-center justify-center rounded-xl bg-[var(--anchor-mint)]/40 p-2.5 text-[var(--anchor-deep)]">
                      <TileIcon name={card.icon} className="h-5 w-5" />
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="truncate text-base font-bold text-[var(--anchor-deep)]">{card.title}</h3>
                        <span className={`ds-badge !rounded-full ${BADGE_STYLE[card.badge]}`}>{card.badge}</span>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-sm text-[var(--anchor-gray)]">{card.description}</p>
                    </div>

                    <Switch
                      on={isOn}
                      disabled={saving === card.key}
                      label={`${isOn ? "Deactivate" : "Activate"} ${card.title}`}
                      onClick={() => toggle(card.key, !isOn, setActive)}
                    />
                  </Card>
                );
              })}
            </div>

            {/* Sales rep tools — toggled per audience (internal vs external) */}
            <h2 className="mt-8 text-lg font-bold text-[var(--anchor-deep)]">Sales rep tools</h2>
            <p className="mb-4 mt-1 text-sm text-[var(--anchor-gray)]">
              Deactivated tools are hidden from a rep&apos;s dashboard. Toggle each tool separately for internal and external reps.
            </p>
            <div className="flex flex-col gap-2.5">
              {SALES_TOOLS.map((tool) => (
                <Card key={tool.key} className="flex items-center gap-4 p-4">
                  <span className="inline-flex shrink-0 items-center justify-center rounded-xl bg-[var(--anchor-mint)]/40 p-2.5 text-[var(--anchor-deep)]">
                    <TileIcon name={tool.icon} className="h-5 w-5" />
                  </span>

                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-base font-bold text-[var(--anchor-deep)]">{tool.label}</h3>
                    <p className="mt-0.5 line-clamp-2 text-sm text-[var(--anchor-gray)]">{tool.description}</p>
                  </div>

                  <div className="flex shrink-0 gap-4">
                    {SALES_AUDIENCES.map((aud) => {
                      const applies = tool.audiences.includes(aud);
                      const fullKey = salesToolKey(aud, tool.key);
                      const isOn = salesActive[fullKey];
                      return (
                        <div key={aud} className="flex w-16 flex-col items-center gap-1">
                          <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--anchor-gray)]">
                            {aud}
                          </span>
                          {applies ? (
                            <Switch
                              on={isOn}
                              disabled={saving === fullKey}
                              label={`${isOn ? "Deactivate" : "Activate"} ${tool.label} for ${aud} reps`}
                              onClick={() => toggle(fullKey, !isOn, setSalesActive)}
                            />
                          ) : (
                            <span className="text-sm text-[var(--anchor-gray)]/60" aria-label="Not applicable">—</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </Card>
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  );
}

function Switch({
  on,
  disabled,
  label,
  onClick,
}: {
  on: boolean;
  disabled?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:opacity-50 ${
        on ? "bg-[var(--anchor-green)]" : "bg-[var(--anchor-gray)]/40"
      }`}
    >
      <span
        className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition ${
          on ? "translate-x-5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}
