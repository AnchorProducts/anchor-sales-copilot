"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { AppNavbar } from "@/app/components/ui/AppNavbar";
import { Card } from "@/app/components/ui/Card";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { useSiteLive } from "@/lib/flags/useSiteLive";
import { NotLiveNotice } from "@/app/components/ui/NotLiveNotice";
import { MarketingHubNav } from "@/app/components/marketing/MarketingHubNav";
import { interpolate, renderEmailHtml } from "@/lib/email/renderEmail";
import type { TemplateVariable } from "@/lib/email/pitchTemplates";

export const dynamic = "force-dynamic";

/* ============================================================================
 * Marketing Hub → Email templates.
 *
 * Marketing writes and designs the Pitch to Marketing notification emails here.
 * The preview pane renders with renderEmailHtml() — the same function the
 * sender uses — so what shows on the right is what actually lands in an inbox.
 * ==========================================================================*/

type Template = {
  key: string;
  label: string;
  audience: string;
  trigger: string;
  variables: TemplateVariable[];
  defaults: { subject: string; heading: string; body: string; buttonLabel: string };
  customized: boolean;
  updatedAt: string | null;
  subject: string;
  heading: string;
  body: string;
  buttonLabel: string;
};

type Draft = { subject: string; heading: string; body: string; buttonLabel: string };

function draftOf(t: Template): Draft {
  return { subject: t.subject, heading: t.heading, body: t.body, buttonLabel: t.buttonLabel };
}

function sameAs(a: Draft, b: Draft) {
  return (
    a.subject === b.subject &&
    a.heading === b.heading &&
    a.body === b.body &&
    a.buttonLabel === b.buttonLabel
  );
}

export default function EmailTemplatesPage() {
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const { t } = useTranslation();
  const { live, ready: liveReady } = useSiteLive();

  const [ready, setReady] = useState(false);
  const [forbidden, setForbidden] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [migrated, setMigrated] = useState(true);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [selected, setSelected] = useState<string>("");
  const [draft, setDraft] = useState<Draft>({ subject: "", heading: "", body: "", buttonLabel: "" });

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!alive) return;
      if (!data.user) { router.replace("/"); return; }
      setReady(true);
    })();
    return () => { alive = false; };
  }, [router, supabase]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/marketing/email-templates", { cache: "no-store", credentials: "include" });
      if (res.status === 403) { setForbidden(true); return; }
      const json = await res.json().catch(() => null);
      if (!res.ok) { setErr(json?.error || "Couldn't load the templates."); return; }
      setForbidden(false);
      setMigrated(json?.migrated !== false);
      const list = (json?.templates ?? []) as Template[];
      setTemplates(list);
      setSelected((prev) => prev || list[0]?.key || "");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (ready && live) void load(); }, [ready, live, load]);

  const current = useMemo(
    () => templates.find((x) => x.key === selected) ?? null,
    [templates, selected]
  );

  // Load the selected template into the editor.
  useEffect(() => {
    if (current) setDraft(draftOf(current));
  }, [current]);

  const dirty = current ? !sameAs(draft, draftOf(current)) : false;
  const isDefault = current
    ? sameAs(draft, {
        subject: current.defaults.subject,
        heading: current.defaults.heading,
        body: current.defaults.body,
        buttonLabel: current.defaults.buttonLabel,
      })
    : false;

  // Preview with sample values, rendered by the real sender.
  const previewHtml = useMemo(() => {
    if (!current) return "";
    const vars = Object.fromEntries(current.variables.map((v) => [v.name, v.sample]));
    const link = vars.link ?? "#";
    return renderEmailHtml({
      subject: interpolate(draft.subject, vars),
      heading: interpolate(draft.heading, vars),
      body: interpolate(draft.body, vars),
      buttonLabel: interpolate(draft.buttonLabel, vars),
      buttonUrl: link,
    });
  }, [current, draft]);

  const previewSubject = useMemo(() => {
    if (!current) return "";
    const vars = Object.fromEntries(current.variables.map((v) => [v.name, v.sample]));
    return interpolate(draft.subject, vars);
  }, [current, draft]);

  async function save() {
    if (!current || busy) return;
    setBusy(true);
    setErr(null);
    setSaved(null);
    try {
      const res = await fetch("/api/marketing/email-templates", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ key: current.key, ...draft }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) { setErr(json?.error || "That didn't save."); return; }
      setSaved("Saved — this is what the next email will use.");
      setTimeout(() => setSaved(null), 4000);
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function revert() {
    if (!current || busy) return;
    if (!confirm("Discard marketing's version and go back to the default wording?")) return;
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/marketing/email-templates", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ key: current.key }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) { setErr(json?.error || "That didn't reset."); return; }
      await load();
    } finally {
      setBusy(false);
    }
  }

  /** Drop a {{variable}} at the end of the body. */
  function insertVar(name: string) {
    setDraft((d) => ({ ...d, body: `${d.body}${d.body.endsWith("\n") || !d.body ? "" : " "}{{${name}}}` }));
  }

  const field =
    "w-full rounded-xl border border-[var(--border-default)] bg-white px-3 text-sm outline-none focus:border-[var(--anchor-green)]";

  return (
    <main className="ds-page">
      <AppNavbar
        title="Email templates"
        subtitle="Marketing Hub"
        menuItems={[
          { label: t("dashboard"), href: "/dashboard" },
          { label: "Submissions", href: "/marketing/submissions" },
        ]}
      />

      <div className="ds-container py-6 pb-[calc(3rem+env(safe-area-inset-bottom))] sm:py-10">
        {!ready || !liveReady ? (
          <Card className="p-5 text-sm text-black/60">{t("loading")}</Card>
        ) : !live ? (
          <NotLiveNotice />
        ) : forbidden ? (
          <Card className="border-[var(--anchor-deep)]/25 bg-[var(--anchor-mint)] p-5 text-sm text-[var(--anchor-deep)]">
            The Marketing Hub is limited to admins and the Marketing team. If that should be you, an admin can
            add you in Admin → Portal Access.
          </Card>
        ) : (
          <>
            <MarketingHubNav />

            <header className="mb-5">
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Email templates</h1>
              <p className="mt-1 text-sm text-[var(--anchor-gray)] sm:text-base">
                The wording of every automatic email the pitch workflow sends. Edit the copy on the left and
                watch the real email build itself on the right — the preview uses the same renderer that sends it.
              </p>
            </header>

            {!migrated && (
              <Card className="mb-4 border-[#fde68a] bg-[#fffbeb] p-4 text-sm text-[#7c4a00]">
                The template table isn&apos;t migrated yet, so edits can&apos;t be saved. The emails still send
                using the default wording shown here.
              </Card>
            )}
            {err && <Card className="mb-4 border-red-200 bg-red-50 p-4 text-sm text-red-700">{err}</Card>}
            {saved && (
              <Card className="mb-4 border-[var(--anchor-green)]/30 bg-[var(--anchor-mint)] p-4 text-sm text-[var(--anchor-deep)]">
                {saved}
              </Card>
            )}

            {loading ? (
              <Card className="p-5 text-sm text-black/60">{t("loading")}</Card>
            ) : !current ? (
              <Card className="p-8 text-center text-sm text-[var(--anchor-gray)]">No templates found.</Card>
            ) : (
              <>
                <div className="mb-4 flex flex-wrap gap-2">
                  {templates.map((tpl) => {
                    const active = tpl.key === selected;
                    return (
                      <button
                        key={tpl.key}
                        type="button"
                        onClick={() => setSelected(tpl.key)}
                        className={
                          "rounded-full border px-3.5 py-1.5 text-[12px] font-semibold transition " +
                          (active
                            ? "border-[var(--anchor-green)] bg-[var(--anchor-green)] text-white"
                            : "border-black/10 bg-white text-black hover:bg-[var(--surface-soft)]")
                        }
                      >
                        {tpl.label}
                        {tpl.customized && (
                          <span className={"ml-1.5 " + (active ? "text-white/80" : "text-[var(--anchor-green)]")}>•</span>
                        )}
                      </button>
                    );
                  })}
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  {/* ── Editor ─────────────────────────────────────────── */}
                  <Card className="p-4 sm:p-5">
                    <div className="mb-4 rounded-xl bg-[var(--surface-soft)] p-3 text-xs text-[var(--anchor-gray)]">
                      <div><b className="text-[var(--anchor-deep)]">Goes to:</b> {current.audience}</div>
                      <div className="mt-0.5"><b className="text-[var(--anchor-deep)]">Sends when:</b> {current.trigger}</div>
                    </div>

                    <div className="space-y-4">
                      <label className="block">
                        <span className="mb-1 block text-xs font-semibold text-[var(--anchor-gray)]">Subject line</span>
                        <input
                          value={draft.subject}
                          onChange={(e) => setDraft((d) => ({ ...d, subject: e.target.value }))}
                          className={`h-11 ${field}`}
                        />
                      </label>

                      <label className="block">
                        <span className="mb-1 block text-xs font-semibold text-[var(--anchor-gray)]">Headline</span>
                        <input
                          value={draft.heading}
                          onChange={(e) => setDraft((d) => ({ ...d, heading: e.target.value }))}
                          className={`h-11 ${field}`}
                        />
                      </label>

                      <label className="block">
                        <span className="mb-1 block text-xs font-semibold text-[var(--anchor-gray)]">
                          Body — blank line starts a new paragraph, a line starting with{" "}
                          <code className="rounded bg-[var(--surface-soft)] px-1">&gt;</code> becomes a highlighted box
                        </span>
                        <textarea
                          value={draft.body}
                          onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
                          rows={10}
                          className={`p-3 ${field}`}
                        />
                      </label>

                      <label className="block sm:max-w-xs">
                        <span className="mb-1 block text-xs font-semibold text-[var(--anchor-gray)]">Button label</span>
                        <input
                          value={draft.buttonLabel}
                          onChange={(e) => setDraft((d) => ({ ...d, buttonLabel: e.target.value }))}
                          placeholder="Leave blank for no button"
                          className={`h-11 ${field}`}
                        />
                      </label>

                      <div>
                        <div className="mb-1.5 text-xs font-semibold text-[var(--anchor-gray)]">
                          Variables — click to insert. They&apos;re filled in when the email sends.
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {current.variables.map((v) => (
                            <button
                              key={v.name}
                              type="button"
                              onClick={() => insertVar(v.name)}
                              title={v.describe}
                              className="rounded-lg border border-[var(--border-default)] bg-white px-2.5 py-1 font-mono text-[11px] font-semibold text-[var(--anchor-deep)] transition-colors hover:bg-[var(--surface-soft)]"
                            >
                              {`{{${v.name}}}`}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 border-t border-[var(--border-default)] pt-4">
                        <button
                          type="button"
                          onClick={() => void save()}
                          disabled={busy || !dirty}
                          className="h-11 rounded-xl bg-[var(--anchor-green)] px-5 text-sm font-semibold text-white transition-opacity disabled:opacity-40"
                        >
                          {busy ? "Saving…" : dirty ? "Save changes" : "Saved"}
                        </button>
                        {dirty && (
                          <button
                            type="button"
                            onClick={() => setDraft(draftOf(current))}
                            disabled={busy}
                            className="h-11 rounded-xl border border-[var(--border-default)] bg-white px-4 text-sm font-semibold text-[var(--anchor-deep)] transition-colors hover:bg-[var(--surface-soft)]"
                          >
                            Discard
                          </button>
                        )}
                        {current.customized && !isDefault && (
                          <button
                            type="button"
                            onClick={() => void revert()}
                            disabled={busy}
                            className="h-11 rounded-xl border border-[var(--border-default)] bg-white px-4 text-sm font-semibold text-[var(--anchor-gray)] transition-colors hover:bg-[var(--surface-soft)]"
                          >
                            Reset to default
                          </button>
                        )}
                      </div>
                    </div>
                  </Card>

                  {/* ── Live preview ───────────────────────────────────── */}
                  <div>
                    <Card className="overflow-hidden p-0">
                      <div className="border-b border-[var(--border-default)] px-4 py-3">
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--anchor-gray)]">
                          Preview — with example values
                        </div>
                        <div className="mt-1 truncate text-sm font-semibold text-[var(--anchor-deep)]">
                          {previewSubject || "(no subject)"}
                        </div>
                      </div>
                      <iframe
                        title="Email preview"
                        srcDoc={previewHtml}
                        sandbox=""
                        className="h-[620px] w-full border-0 bg-white"
                      />
                    </Card>
                    <p className="mt-2 px-1 text-xs text-[var(--anchor-gray)]">
                      Sample values stand in for the real pitch details.
                    </p>
                  </div>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}
