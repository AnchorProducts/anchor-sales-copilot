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

type Rep = {
  id: string;
  outside_sales_name: string | null;
  outside_sales_email: string | null;
  phone: string | null;
  teams_link: string | null;
  states: string[];
};

type RepDraft = {
  id?: string;
  outside_sales_name: string;
  outside_sales_email: string;
  phone: string;
  teams_link: string;
  statesText: string;
};

const EMPTY_DRAFT: RepDraft = {
  outside_sales_name: "",
  outside_sales_email: "",
  phone: "",
  teams_link: "",
  statesText: "",
};

function repToDraft(rep: Rep): RepDraft {
  return {
    id: rep.id,
    outside_sales_name: rep.outside_sales_name || "",
    outside_sales_email: rep.outside_sales_email || "",
    phone: rep.phone || "",
    teams_link: rep.teams_link || "",
    statesText: (rep.states || []).join(", "),
  };
}

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

    const body = {
      id: draft.id,
      outside_sales_name: draft.outside_sales_name.trim(),
      outside_sales_email: draft.outside_sales_email.trim().toLowerCase(),
      phone: draft.phone.trim() || null,
      teams_link: draft.teams_link.trim() || null,
      states,
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

    setActionMsg(isEdit ? "Rep updated." : "Rep added.");
    setDraft(EMPTY_DRAFT);
    await loadReps();
  }

  async function remove(id: string) {
    if (!confirm("Delete this rep? This cannot be undone.")) return;
    setActionMsg(null);
    setActionErr(null);
    const res = await fetch(`/api/admin/sales-reps?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    const json = await res.json().catch(() => null);
    if (!res.ok) { setActionErr(json?.error || "Delete failed."); return; }
    setActionMsg("Rep deleted.");
    await loadReps();
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
                  {draft.id ? "Edit Rep" : "Add Rep"}
                </div>
                <div className="mt-1 text-[12px] text-[var(--anchor-gray)]">
                  Each rep covers a list of US state codes (e.g. TX, OK, NM).
                </div>

                <form onSubmit={save} className="mt-4 grid gap-4">
                  <label className="grid gap-1.5 text-sm">
                    <span className="font-semibold">Name *</span>
                    <Input
                      value={draft.outside_sales_name}
                      onChange={(e) => setDraft({ ...draft, outside_sales_name: e.target.value })}
                      className="h-11 px-3 text-sm"
                      placeholder="Outside sales rep"
                    />
                  </label>

                  <label className="grid gap-1.5 text-sm">
                    <span className="font-semibold">Email *</span>
                    <Input
                      value={draft.outside_sales_email}
                      onChange={(e) => setDraft({ ...draft, outside_sales_email: e.target.value })}
                      className="h-11 px-3 text-sm"
                      type="email"
                      placeholder="name@anchorp.com"
                    />
                  </label>

                  <label className="grid gap-1.5 text-sm">
                    <span className="font-semibold">Phone</span>
                    <Input
                      value={draft.phone}
                      onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                      className="h-11 px-3 text-sm"
                      type="tel"
                      placeholder="(555) 555-5555"
                    />
                  </label>

                  <label className="grid gap-1.5 text-sm">
                    <span className="font-semibold">Teams Link</span>
                    <Input
                      value={draft.teams_link}
                      onChange={(e) => setDraft({ ...draft, teams_link: e.target.value })}
                      className="h-11 px-3 text-sm"
                      placeholder="https://teams.microsoft.com/l/call/0/0?users=..."
                    />
                    <span className="text-[11px] text-[var(--anchor-gray)]">
                      Opened by the dashboard's "Talk to Sales" card.
                    </span>
                  </label>

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

                  {actionErr && <Alert tone="error">{actionErr}</Alert>}
                  {actionMsg && <Alert tone="success">{actionMsg}</Alert>}

                  <div className="flex flex-wrap gap-3">
                    <Button type="submit" disabled={saving} variant="primary" className="py-3 text-sm sm:px-6">
                      {saving ? "Saving…" : draft.id ? "Save Changes" : "Add Rep"}
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
                <div className="text-sm font-semibold text-black">Current Reps</div>
                <div className="mt-1 text-[12px] text-[var(--anchor-gray)]">
                  {reps.length} configured
                </div>

                {loadErr && <Alert tone="error" className="mt-3">{loadErr}</Alert>}

                {reps.length === 0 && !loadErr ? (
                  <div className="mt-4 rounded-lg border border-black/10 bg-[var(--surface-soft)] p-4 text-sm text-[var(--anchor-gray)]">
                    No reps yet. Add one using the form above.
                  </div>
                ) : (
                  <div className="mt-4 grid gap-3">
                    {reps.map((rep) => (
                      <div
                        key={rep.id}
                        className="rounded-xl border border-black/10 bg-white p-4 text-sm"
                      >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div className="min-w-0 flex-1">
                            <div className="break-words font-semibold">{rep.outside_sales_name || "—"}</div>
                            {rep.outside_sales_email && (
                              <div className="truncate text-[12px] text-[var(--anchor-gray)]">{rep.outside_sales_email}</div>
                            )}
                            {rep.phone && (
                              <div className="text-[12px] text-[var(--anchor-gray)]">Phone: {rep.phone}</div>
                            )}
                            {rep.teams_link ? (
                              <div className="truncate text-[12px] text-[var(--anchor-green)]">
                                Teams link set
                              </div>
                            ) : (
                              <div className="text-[12px] text-[#B45309]">No Teams link</div>
                            )}
                            <div className="mt-2 flex flex-wrap gap-1">
                              {rep.states.map((s) => (
                                <span key={s} className="rounded bg-[var(--surface-soft)] px-2 py-0.5 text-[11px]">
                                  {s}
                                </span>
                              ))}
                            </div>
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
                    ))}
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
