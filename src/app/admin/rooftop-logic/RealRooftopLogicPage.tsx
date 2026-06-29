"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { AppNavbar } from "@/app/components/ui/AppNavbar";
import { Card } from "@/app/components/ui/Card";
import Button from "@/app/components/ui/Button";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { ToolLoader } from "@/app/components/visuals/FeatureGraphic";
import { CONTRACTOR_IDENTITY_TOKEN } from "@/lib/rooftop/assessmentPrompt";

export const dynamic = "force-dynamic";

export default function RooftopLogicPage() {
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const { t } = useTranslation();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [prompt, setPrompt] = useState("");
  const [savedPrompt, setSavedPrompt] = useState("");
  const [defaultPrompt, setDefaultPrompt] = useState("");
  const [isCustom, setIsCustom] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
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

      try {
        const res = await fetch("/api/admin/rooftop-logic", { cache: "no-store" });
        const j = await res.json();
        if (!alive) return;
        if (!res.ok) throw new Error(j.error || "Failed to load");
        setPrompt(j.prompt || "");
        setSavedPrompt(j.prompt || "");
        setDefaultPrompt(j.default || "");
        setIsCustom(!!j.isCustom);
      } catch (e) {
        if (!alive) return;
        setError(e instanceof Error ? e.message : "Failed to load");
      }
      setReady(true);
    })();
    return () => { alive = false; };
  }, [router, supabase]);

  const dirty = prompt !== savedPrompt;
  const hasToken = prompt.includes(CONTRACTOR_IDENTITY_TOKEN);

  async function save() {
    setSaving(true);
    setSaveError(null);
    setStatus(null);
    // If the text matches the built-in default, save an empty override so the
    // audit tracks the evolving default instead of freezing this snapshot.
    const toSave = prompt.trim() === defaultPrompt.trim() ? "" : prompt;
    try {
      const res = await fetch("/api/admin/rooftop-logic", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: toSave }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || "Failed to save");
      setSavedPrompt(prompt);
      setIsCustom(!!j.isCustom);
      setStatus("Saved. New audits will use this logic immediately.");
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="ds-page">
      <AppNavbar
        title="Rooftop Audit Logic"
        subtitle="Edit the assessment decision tree"
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
            <Card className="mb-4 p-4 text-sm text-[var(--anchor-gray)]">
              <p>
                This is the system prompt that drives the <strong>/rooftop</strong> assessment — every
                question, branch, and ⚠️ compliance flag. Edits take effect on the next audit; no deploy needed.
              </p>
              <p className="mt-2">
                Keep the{" "}
                <code className="rounded bg-[var(--anchor-mint)]/40 px-1 py-0.5 text-[var(--anchor-deep)]">
                  {CONTRACTOR_IDENTITY_TOKEN}
                </code>{" "}
                token where the assistant should learn who it&apos;s greeting — it&apos;s replaced with the
                contractor&apos;s name/company at runtime.
              </p>
              <p className="mt-2">
                Status: {isCustom ? "Custom (overriding the built-in default)." : "Using the built-in default."}
              </p>
            </Card>

            {saveError && (
              <Card className="mb-4 border-red-300 bg-red-50 p-3 text-sm text-red-700">{saveError}</Card>
            )}
            {status && (
              <Card className="mb-4 border-[var(--anchor-green)]/40 bg-[var(--anchor-mint)]/40 p-3 text-sm text-[var(--anchor-deep)]">
                {status}
              </Card>
            )}
            {!hasToken && (
              <Card className="mb-4 border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
                Heads up: the {CONTRACTOR_IDENTITY_TOKEN} token isn&apos;t in the prompt, so the assistant won&apos;t be
                told the contractor&apos;s name.
              </Card>
            )}

            <textarea
              value={prompt}
              onChange={(e) => { setPrompt(e.target.value); setStatus(null); setSaveError(null); }}
              spellCheck={false}
              className="h-[60vh] w-full resize-y rounded-xl border border-[var(--anchor-deep)]/20 bg-white p-4 font-mono text-[13px] leading-relaxed text-[var(--anchor-deep)] focus:border-[var(--anchor-green)] focus:outline-none"
            />

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <Button onClick={save} disabled={saving || !dirty}>
                {saving ? "Saving…" : "Save logic"}
              </Button>
              <Button
                variant="secondary"
                disabled={saving || prompt === savedPrompt}
                onClick={() => setPrompt(savedPrompt)}
              >
                Discard changes
              </Button>
              <Button
                variant="secondary"
                disabled={saving || prompt === defaultPrompt}
                onClick={() => setPrompt(defaultPrompt)}
              >
                Reset to default
              </Button>
              {dirty && <span className="text-sm text-[var(--anchor-gray)]">Unsaved changes</span>}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
