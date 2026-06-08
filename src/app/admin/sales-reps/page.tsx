"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { AppNavbar } from "@/app/components/ui/AppNavbar";
import { Card } from "@/app/components/ui/Card";
import { Input } from "@/app/components/ui/Field";
import { Alert } from "@/app/components/ui/Alert";
import Button from "@/app/components/ui/Button";
import { useTranslation } from "@/lib/i18n/useTranslation";

export const dynamic = "force-dynamic";

type RepKind = "internal" | "external";

type Rep = {
  id: string;
  kind: RepKind;
  name: string | null;
  email: string | null;
  teams_link: string | null;
  states: string[];
  zip_prefixes: string[];
};

type RepDraft = {
  id?: string;
  kind: RepKind;
  name: string;
  email: string;
  teams_link: string;
  statesText: string;
  zipText: string;
};

const EMPTY_DRAFT: RepDraft = {
  kind: "external",
  name: "",
  email: "",
  teams_link: "",
  statesText: "",
  zipText: "",
};

function repToDraft(rep: Rep): RepDraft {
  return {
    id: rep.id,
    kind: rep.kind,
    name: rep.name || "",
    email: rep.email || "",
    teams_link: rep.teams_link || "",
    statesText: (rep.states || []).join(", "),
    zipText: (rep.zip_prefixes || []).join(", "),
  };
}

const KIND_LABEL: Record<RepKind, string> = {
  external: "External (outside)",
  internal: "Internal (inside)",
};

export default function AdminSalesRepsPage() {
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const { t } = useTranslation();

  const [ready, setReady] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [reps, setReps] = useState<Rep[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [draft, setDraft] = useState<RepDraft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);

  async function loadReps() {
    setLoadErr(null);
    const res = await fetch("/api/admin/sales-reps", { cache: "no-store" });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      setLoadErr(json?.error || "Failed to load reps.");
      return;
    }
    setReps(json?.reps || []);
  }

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

      const role = String((prof as any)?.role || "");
      if (role !== "admin") {
        setAccessError("Admin access only.");
        setReady(true);
        return;
      }

      await loadReps();
      setReady(true);
    })();
    return () => { alive = false; };
  }, [supabase, router]);

  function startEdit(rep: Rep) {
    setDraft(repToDraft(rep));
    setActionMsg(null);
    setActionErr(null);
  }

  function cancelEdit() {
    setDraft(EMPTY_DRAFT);
    setActionMsg(null);
    setActionErr(null);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setActionMsg(null);
    setActionErr(null);

    const states = draft.statesText
      .split(/[,\s]+/)
      .map((s) => s.trim().toUpperCase())
      .filter(Boolean);

    // States Covered is required — a rep with none can't be routed leads.
    if (states.length === 0) {
      setActionErr("Select at least one state covered.");
      setSaving(false);
      return;
    }

    const zip_prefixes = draft.zipText
      .split(/[,\s]+/)
      .map((s) => s.replace(/\D/g, "").slice(0, 3))
      .filter((s) => s.length === 3);

    const body = {
      id: draft.id,
      kind: draft.kind,
      name: draft.name.trim(),
      email: draft.email.trim().toLowerCase(),
      teams_link: draft.kind === "internal" ? null : draft.teams_link.trim() || null,
      states,
      zip_prefixes,
    };

    const isEdit = !!draft.id;
    const res = await fetch("/api/admin/sales-reps", {
      method: isEdit ? "PATCH" : "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => null);
    setSaving(false);

    if (!res.ok) {
      setActionErr(json?.error || "Save failed.");
      return;
    }

    setActionMsg(isEdit ? "Salesperson updated." : "Salesperson added.");
    setDraft(EMPTY_DRAFT);
    await loadReps();
  }

  async function remove(id: string) {
    if (!confirm("Delete this salesperson? This cannot be undone.")) return;
    setActionMsg(null);
    setActionErr(null);
    const res = await fetch(`/api/admin/sales-reps?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    const json = await res.json().catch(() => null);
    if (!res.ok) { setActionErr(json?.error || "Delete failed."); return; }
    setActionMsg("Salesperson deleted.");
    await loadReps();
  }

  const externalReps = reps.filter((r) => r.kind === "external");
  const internalReps = reps.filter((r) => r.kind === "internal");

  function repRow(rep: Rep) {
    return (
      <div
        key={rep.id}
        className="rounded-xl border border-black/10 bg-white p-4 text-sm"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="break-words font-semibold">{rep.name || "—"}</span>
              <span
                className={
                  rep.kind === "internal"
                    ? "rounded-full bg-[var(--anchor-deep)]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--anchor-deep)]"
                    : "rounded-full bg-[var(--anchor-green)]/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--anchor-deep)]"
                }
              >
                {rep.kind === "internal" ? "Internal" : "External"}
              </span>
            </div>
            {rep.email && (
              <div className="truncate text-[12px] text-[var(--anchor-gray)]">{rep.email}</div>
            )}
            {rep.kind === "external" &&
              (rep.teams_link ? (
                <div className="truncate text-[12px] text-[var(--anchor-green)]">Teams link set</div>
              ) : (
                <div className="text-[12px] text-[#B45309]">No Teams link</div>
              ))}
            <div className="mt-2 flex flex-wrap gap-1">
              {rep.states.map((s) => (
                <span key={s} className="rounded bg-[var(--surface-soft)] px-2 py-0.5 text-[11px]">
                  {s}
                </span>
              ))}
            </div>
            {rep.zip_prefixes && rep.zip_prefixes.length > 0 && (
              <div className="mt-1 text-[11px] text-[var(--anchor-gray)]">
                ZIP sub-territory: {rep.zip_prefixes.join(", ")}
              </div>
            )}
          </div>
          <div className="flex shrink-0 gap-2">
            <Button
              type="button"
              onClick={() => startEdit(rep)}
              variant="secondary"
              className="flex-1 px-3 py-2 text-[12px] sm:flex-none"
            >
              Edit
            </Button>
            <Button
              type="button"
              onClick={() => remove(rep.id)}
              variant="secondary"
              className="flex-1 px-3 py-2 text-[12px] sm:flex-none"
            >
              Delete
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <main className="ds-page">
      <AppNavbar
        title="Sales Reps"
        subtitle="Admin · Configure regional assignments"
        menuItems={[{ label: "Admin", href: "/admin" }]}
      />

      <div className="ds-container py-6 pb-[calc(2rem+env(safe-area-inset-bottom))] sm:py-10">
        <div className="mx-auto max-w-3xl space-y-5">
          {!ready ? (
            <Card className="p-5 text-sm text-black/60">{t("loading")}</Card>
          ) : accessError ? (
            <Card className="border-[var(--anchor-deep)]/25 bg-[var(--anchor-mint)] p-5 text-sm text-[var(--anchor-deep)]">
              {accessError}
            </Card>
          ) : (
            <>
              {/* Add / Edit form */}
              <Card className="border-t-4 border-t-[var(--anchor-green)] p-5">
                <div className="text-sm font-semibold text-black">
                  {draft.id ? "Edit Salesperson" : "Add Salesperson"}
                </div>
                <div className="mt-1 text-[12px] text-[var(--anchor-gray)]">
                  Add as many internal and external salespeople per state as you need — each entry is one person.
                </div>

                <form onSubmit={save} className="mt-4 grid gap-4">
                  <div className="grid gap-1.5 text-sm">
                    <span className="font-semibold">Type *</span>
                    <div className="grid grid-cols-2 gap-2">
                      {(["external", "internal"] as RepKind[]).map((k) => (
                        <button
                          key={k}
                          type="button"
                          onClick={() => setDraft({ ...draft, kind: k })}
                          className={
                            "rounded-xl border px-3 py-2.5 text-left text-[13px] font-semibold transition " +
                            (draft.kind === k
                              ? "border-[var(--anchor-green)] bg-[var(--anchor-mint)]/40 text-[var(--anchor-deep)]"
                              : "border-black/10 bg-white text-[var(--anchor-gray)] hover:border-[var(--anchor-green)]/50")
                          }
                        >
                          {KIND_LABEL[k]}
                        </button>
                      ))}
                    </div>
                    <span className="text-[11px] text-[var(--anchor-gray)]">
                      External reps show on the user dashboard. REC submissions route to the internal reps for the state.
                    </span>
                  </div>

                  <label className="grid gap-1.5 text-sm">
                    <span className="font-semibold">Name *</span>
                    <Input
                      value={draft.name}
                      onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                      className="h-11 px-3 text-sm"
                      placeholder="Salesperson name"
                    />
                  </label>

                  <label className="grid gap-1.5 text-sm">
                    <span className="font-semibold">Email *</span>
                    <Input
                      value={draft.email}
                      onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                      className="h-11 px-3 text-sm"
                      type="email"
                      placeholder="name@anchorp.com"
                    />
                  </label>

                  {draft.kind === "external" ? (
                    <label className="grid gap-1.5 text-sm">
                      <span className="font-semibold">Teams Link</span>
                      <Input
                        value={draft.teams_link}
                        onChange={(e) => setDraft({ ...draft, teams_link: e.target.value })}
                        className="h-11 px-3 text-sm"
                        placeholder="https://teams.microsoft.com/l/call/0/0?users=..."
                      />
                      <span className="text-[11px] text-[var(--anchor-gray)]">
                        Opened from the dashboard Your Reps contacts.
                      </span>
                    </label>
                  ) : (
                    <div className="rounded-lg border border-black/10 bg-[var(--surface-soft)] p-3 text-[11px] text-[var(--anchor-gray)]">
                      Internal reps don&apos;t need a Teams link — their email receives the routed forms.
                    </div>
                  )}

                  <label className="grid gap-1.5 text-sm">
                    <span className="font-semibold">States Covered *</span>
                    <Input
                      value={draft.statesText}
                      onChange={(e) => setDraft({ ...draft, statesText: e.target.value })}
                      className="h-11 px-3 text-sm"
                      placeholder="TX, OK, NM"
                    />
                    <span className="text-[11px] text-[var(--anchor-gray)]">
                      Comma- or space-separated 2-letter state codes.
                    </span>
                  </label>

                  <label className="grid gap-1.5 text-sm">
                    <span className="font-semibold">ZIP sub-territory</span>
                    <Input
                      value={draft.zipText}
                      onChange={(e) => setDraft({ ...draft, zipText: e.target.value })}
                      className="h-11 px-3 text-sm"
                      placeholder="770, 771, 772 (optional)"
                    />
                    <span className="text-[11px] text-[var(--anchor-gray)]">
                      Optional. 3-digit ZIP prefixes this rep covers within a shared state. Leave blank for whole-state coverage. Used to split overlapping reps (e.g. TX: Houston/Gulf vs the rest).
                    </span>
                  </label>

                  {actionErr && <Alert tone="error">{actionErr}</Alert>}
                  {actionMsg && <Alert tone="success">{actionMsg}</Alert>}

                  <div className="flex flex-wrap gap-3">
                    <Button type="submit" disabled={saving} variant="primary" className="py-3 text-sm sm:px-6">
                      {saving ? "Saving…" : draft.id ? "Save Changes" : "Add Salesperson"}
                    </Button>
                    {draft.id && (
                      <Button type="button" onClick={cancelEdit} variant="secondary" className="py-3 text-sm sm:px-6">
                        Cancel
                      </Button>
                    )}
                  </div>
                </form>
              </Card>

              {/* List */}
              <Card className="border-t-4 border-t-[var(--anchor-green)] p-5">
                <div className="text-sm font-semibold text-black">Current Salespeople</div>
                <div className="mt-1 text-[12px] text-[var(--anchor-gray)]">
                  {externalReps.length} external · {internalReps.length} internal
                </div>

                {loadErr && <Alert tone="error" className="mt-3">{loadErr}</Alert>}

                {reps.length === 0 && !loadErr ? (
                  <div className="mt-4 rounded-lg border border-black/10 bg-[var(--surface-soft)] p-4 text-sm text-[var(--anchor-gray)]">
                    No salespeople yet. Add one using the form above.
                  </div>
                ) : (
                  <div className="mt-4 space-y-5">
                    <div>
                      <div className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[var(--anchor-gray)]">
                        External reps
                      </div>
                      {externalReps.length === 0 ? (
                        <div className="text-[12px] text-[var(--anchor-gray)]">None yet.</div>
                      ) : (
                        <div className="grid gap-3">{externalReps.map(repRow)}</div>
                      )}
                    </div>
                    <div>
                      <div className="mb-2 text-[12px] font-semibold uppercase tracking-wide text-[var(--anchor-gray)]">
                        Internal reps
                      </div>
                      {internalReps.length === 0 ? (
                        <div className="text-[12px] text-[var(--anchor-gray)]">None yet.</div>
                      ) : (
                        <div className="grid gap-3">{internalReps.map(repRow)}</div>
                      )}
                    </div>
                  </div>
                )}
              </Card>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
