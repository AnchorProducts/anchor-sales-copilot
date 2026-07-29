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
import { SITE_LIVE_KEY, SITE_LIVE_SURFACES, siteLiveFrom } from "@/lib/flags/siteLive";

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
  // The master switch for the unreleased feature set. Unlike every other key in
  // admin_tools, a missing row means OFF — see src/lib/flags/siteLive.ts.
  const [siteLive, setSiteLive] = useState(false);

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
        setSiteLive(siteLiveFrom(rows));
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

  // Flip the master switch. Everything it controls reads the same flag, so this
  // single write reveals (or re-hides) the whole feature set at once.
  async function toggleSiteLive() {
    const next = !siteLive;
    if (!next && !confirm("Take these features back offline for everyone?")) return;

    setSiteLive(next);
    setSaving(SITE_LIVE_KEY);
    setSaveError(null);
    try {
      const res = await fetch("/api/admin/tools", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: SITE_LIVE_KEY, active: next }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Failed to save");
      }
    } catch (e) {
      setSiteLive(!next);
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

            {/* Master switch for the unreleased feature set. Everything listed
                here is hidden from every user — reps, marketing, and admins —
                until this is turned on. */}
            <Card
              className={
                "mb-6 border-t-4 p-5 sm:p-6 " +
                (siteLive ? "border-t-[var(--anchor-green)]" : "border-t-[#d09a3c]")
              }
            >
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-bold tracking-tight text-[var(--anchor-deep)]">Site live</h2>
                    <span
                      className={
                        "rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide " +
                        (siteLive ? "bg-[#e6f4ea] text-[#1e6b3a]" : "bg-[#fdf3e2] text-[#8a6d3b]")
                      }
                    >
                      {siteLive ? "Live" : "Hidden"}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-[var(--anchor-gray)]">
                    {siteLive
                      ? "These features are switched on and visible to everyone who has access to them."
                      : "These features are built and deployed but hidden from everyone — including admins. Turn this on to release them all at once."}
                  </p>

                  <ul className="mt-3 space-y-1.5">
                    {SITE_LIVE_SURFACES.map((s) => (
                      <li key={s.label} className="flex gap-2 text-sm">
                        <span
                          className={
                            "mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full " +
                            (siteLive ? "bg-[var(--anchor-green)]" : "bg-[var(--anchor-gray)]/50")
                          }
                          aria-hidden
                        />
                        <span>
                          <b className="text-[var(--anchor-deep)]">{s.label}</b>
                          <span className="text-[var(--anchor-gray)]"> — {s.detail}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>

                <button
                  type="button"
                  onClick={() => void toggleSiteLive()}
                  disabled={saving === SITE_LIVE_KEY}
                  className={
                    "h-11 shrink-0 rounded-xl px-6 text-sm font-semibold transition-opacity disabled:opacity-50 " +
                    (siteLive
                      ? "border border-[var(--border-default)] bg-white text-[var(--anchor-deep)] hover:bg-[var(--surface-soft)]"
                      : "bg-[var(--anchor-green)] text-white hover:opacity-90")
                  }
                >
                  {saving === SITE_LIVE_KEY ? "Saving…" : siteLive ? "Take offline" : "Go live"}
                </button>
              </div>
            </Card>

            {/* Admin Console tools */}
            <h2 className="text-lg font-bold text-[var(--anchor-deep)]">Admin Console tools</h2>
            <p className="mb-4 mt-1 text-sm text-[var(--anchor-gray)]">
              Deactivated tools stay visible to admins on the console (marked “Inactive”) so you can
              preview them, but they’re hidden from everyone else. {activeCount} of {CARDS.length} active.
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
