"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { AppNavbar } from "@/app/components/ui/AppNavbar";
import { Card } from "@/app/components/ui/Card";
import Button from "@/app/components/ui/Button";
import { Select, Textarea } from "@/app/components/ui/Field";
import { useTranslation } from "@/lib/i18n/useTranslation";
import FMIntakeForm from "@/app/components/fm-intake/FMIntakeForm";
import {
  FM_INTAKE_STATUSES,
  fmIntakeStatusLabel,
  fmIntakeStatusPill,
} from "@/lib/fmIntake";

export const dynamic = "force-dynamic";

type IntakeRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  company_name: string | null;
  project_name: string | null;
  project_address: string | null;
  equipment: string[];
  attachment_count: number;
  status: string;
  review_notes: string | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  created_at: string | null;
};

type Attachment = {
  path: string;
  filename: string;
  content_type: string;
  size: number;
  url: string | null;
};

function fmtDateTime(s: string | null) {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString("en-US", {
      month: "short",
      day: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return s;
  }
}

// Turn an internal key (camelCase / snake_case) into a readable label.
function humanize(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (c) => c.toUpperCase());
}

function isEmpty(v: unknown): boolean {
  if (v === null || v === undefined || v === "") return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.keys(v as object).length === 0;
  return false;
}

// Generic, recursive renderer for the nested intake payload — so every section
// of the form shows up without hard-coding all 10 of them.
function PayloadValue({ value }: { value: unknown }) {
  if (isEmpty(value)) return <span className="text-[var(--anchor-gray)]">—</span>;
  if (Array.isArray(value)) {
    return (
      <div className="space-y-2">
        {value.map((item, i) =>
          typeof item === "object" && item !== null ? (
            <div key={i} className="rounded-lg border border-[var(--border-default)] p-2">
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--anchor-gray)]">
                #{i + 1}
              </div>
              <PayloadObject obj={item as Record<string, unknown>} />
            </div>
          ) : (
            <div key={i} className="text-sm">{String(item)}</div>
          )
        )}
      </div>
    );
  }
  if (typeof value === "object") {
    return <PayloadObject obj={value as Record<string, unknown>} />;
  }
  if (typeof value === "boolean") return <span>{value ? "Yes" : "No"}</span>;
  return <span className="whitespace-pre-line text-sm">{String(value)}</span>;
}

function PayloadObject({ obj }: { obj: Record<string, unknown> }) {
  const entries = Object.entries(obj).filter(([, v]) => !isEmpty(v));
  if (entries.length === 0) return <span className="text-[var(--anchor-gray)]">—</span>;
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
      {entries.map(([k, v]) => (
        <div key={k} className={typeof v === "object" && v !== null ? "sm:col-span-2" : ""}>
          <dt className="text-[10px] font-semibold uppercase tracking-wide text-[var(--anchor-gray)]">
            {humanize(k)}
          </dt>
          <dd className="mt-0.5 text-sm text-black">
            <PayloadValue value={v} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

export default function AdminFMIntakePage() {
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const { t } = useTranslation();

  const [ready, setReady] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [tab, setTab] = useState<"submissions" | "new">("submissions");

  const [rows, setRows] = useState<IntakeRow[]>([]);
  const [listErr, setListErr] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<any | null>(null);
  const [detailErr, setDetailErr] = useState<string | null>(null);
  const [statusDraft, setStatusDraft] = useState<string>("new");
  const [notesDraft, setNotesDraft] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const loadList = useCallback(async () => {
    const res = await fetch("/api/fm-intake", { cache: "no-store" });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      setListErr(json?.error || "Failed to load submissions.");
      return;
    }
    setListErr(null);
    setRows(json?.items || []);
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
      const role = String((prof as { role?: string } | null)?.role || "");
      if (role !== "admin") {
        setAccessError("Admin access only.");
        setReady(true);
        return;
      }
      await loadList();
      if (!alive) return;
      setReady(true);
    })();
    return () => {
      alive = false;
    };
  }, [router, supabase, loadList]);

  async function openDetail(id: string) {
    setSelectedId(id);
    setDetail(null);
    setDetailErr(null);
    const res = await fetch(`/api/fm-intake/${encodeURIComponent(id)}`, { cache: "no-store" });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      setDetailErr(json?.error || "Failed to load submission.");
      return;
    }
    const s = json.submission;
    setDetail(s);
    setStatusDraft(s.status || "new");
    setNotesDraft(s.review_notes || "");
  }

  async function saveDecision() {
    if (!selectedId) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/fm-intake/${encodeURIComponent(selectedId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: statusDraft, review_notes: notesDraft }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setDetailErr(json?.error || "Failed to save.");
      } else {
        await loadList();
        await openDetail(selectedId);
      }
    } finally {
      setSaving(false);
    }
  }

  const selectedRow = useMemo(
    () => rows.find((r) => r.id === selectedId) || null,
    [rows, selectedId]
  );

  return (
    <main className="ds-page">
      <AppNavbar
        title="Project Intake"
        subtitle="Quote requests — submissions & review"
        menuItems={[
          { label: t("dashboard"), href: "/dashboard" },
          { label: "Admin Console", href: "/admin" },
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
            <div className="mb-4 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setTab("submissions");
                  setSelectedId(null);
                }}
                className={`rounded-xl px-4 py-2 text-sm font-semibold ${
                  tab === "submissions"
                    ? "bg-[var(--anchor-green)] text-white"
                    : "border border-[var(--border-default)] bg-white text-[var(--anchor-deep)]"
                }`}
              >
                Submissions ({rows.length})
              </button>
              <button
                type="button"
                onClick={() => setTab("new")}
                className={`rounded-xl px-4 py-2 text-sm font-semibold ${
                  tab === "new"
                    ? "bg-[var(--anchor-green)] text-white"
                    : "border border-[var(--border-default)] bg-white text-[var(--anchor-deep)]"
                }`}
              >
                New intake
              </button>
            </div>

            {tab === "new" ? (
              <FMIntakeForm />
            ) : selectedId ? (
              <Detail
                row={selectedRow}
                detail={detail}
                detailErr={detailErr}
                statusDraft={statusDraft}
                notesDraft={notesDraft}
                onStatus={setStatusDraft}
                onNotes={setNotesDraft}
                onSave={saveDecision}
                saving={saving}
                onBack={() => setSelectedId(null)}
              />
            ) : (
              <SubmissionsList rows={rows} err={listErr} onOpen={openDetail} />
            )}
          </>
        )}
      </div>
    </main>
  );
}

function SubmissionsList({
  rows,
  err,
  onOpen,
}: {
  rows: IntakeRow[];
  err: string | null;
  onOpen: (id: string) => void;
}) {
  if (err) return <Card className="border-red-200 bg-red-50 p-4 text-sm text-red-700">{err}</Card>;
  if (rows.length === 0)
    return <Card className="p-6 text-sm text-[var(--anchor-gray)]">No intake submissions yet.</Card>;
  return (
    <div className="grid gap-3">
      {rows.map((r) => {
        const name = [r.first_name, r.last_name].filter(Boolean).join(" ") || "—";
        return (
          <button
            key={r.id}
            type="button"
            onClick={() => onOpen(r.id)}
            className="w-full text-left"
          >
            <Card className="p-4 transition hover:border-[var(--anchor-green)] hover:bg-[var(--anchor-mint)]/20">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-base font-bold text-[var(--anchor-deep)]">{name}</h3>
                  {r.company_name && (
                    <span className="text-sm text-[var(--anchor-gray)]">· {r.company_name}</span>
                  )}
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${fmIntakeStatusPill(r.status)}`}
                  >
                    {fmIntakeStatusLabel(r.status)}
                  </span>
                </div>
                <span className="text-[11px] text-[var(--anchor-gray)]">
                  #{r.id.slice(0, 8)} · {fmtDateTime(r.created_at)}
                </span>
              </div>
              <div className="mt-1 text-sm text-[var(--anchor-gray)]">
                {r.project_name || r.project_address || "—"}
              </div>
              <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--anchor-gray)]">
                {r.equipment.length > 0 && <span>{r.equipment.join(", ")}</span>}
                {r.attachment_count > 0 && <span>📎 {r.attachment_count}</span>}
                {r.reviewed_by_name && <span>Reviewed by {r.reviewed_by_name}</span>}
              </div>
            </Card>
          </button>
        );
      })}
    </div>
  );
}

function Detail({
  row,
  detail,
  detailErr,
  statusDraft,
  notesDraft,
  onStatus,
  onNotes,
  onSave,
  saving,
  onBack,
}: {
  row: IntakeRow | null;
  detail: any | null;
  detailErr: string | null;
  statusDraft: string;
  notesDraft: string;
  onStatus: (v: string) => void;
  onNotes: (v: string) => void;
  onSave: () => void;
  saving: boolean;
  onBack: () => void;
}) {
  const name = row ? [row.first_name, row.last_name].filter(Boolean).join(" ") || "—" : "—";
  const attachments: Attachment[] = detail?.attachments || [];
  // Payload sections to show, minus the customer block (shown above from columns).
  const payload: Record<string, unknown> = detail?.payload || {};
  const cust = (payload.customer || {}) as Record<string, unknown>;
  const sectionEntries = Object.entries(payload).filter(
    ([k, v]) => k !== "customer" && !isEmpty(v)
  );

  return (
    <div>
      <button
        type="button"
        onClick={onBack}
        className="mb-3 text-sm font-semibold text-[var(--anchor-green)] hover:underline"
      >
        ← Back to submissions
      </button>

      {detailErr && (
        <Card className="mb-3 border-red-200 bg-red-50 p-4 text-sm text-red-700">{detailErr}</Card>
      )}

      {!detail ? (
        <Card className="p-5 text-sm text-black/60">Loading…</Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          {/* ── The submission (both sides shown together) ── */}
          <div className="space-y-4 lg:col-span-2">
            <Card className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-bold text-[var(--anchor-deep)]">{name}</h2>
                {row?.company_name && (
                  <span className="text-sm text-[var(--anchor-gray)]">· {row.company_name}</span>
                )}
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${fmIntakeStatusPill(detail.status)}`}
                >
                  {fmIntakeStatusLabel(detail.status)}
                </span>
              </div>
              <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
                <Field label="Email" value={detail.email} />
                <Field label="Phone" value={detail.phone} />
                <Field label="Project" value={detail.project_name} />
                <Field label="Address" value={detail.project_address} full />
                <Field label="Equipment scope" value={(detail.equipment || []).join(", ")} full />
                <Field label="FM project?" value={cust.fmProject} />
                <Field label="FM insured?" value={cust.fmInsured} />
                {!isEmpty(cust.fmIndexRecord) && (
                  <Field label="FM Index-Record #" value={cust.fmIndexRecord} />
                )}
                <Field label="Submitted" value={fmtDateTime(detail.created_at)} />
              </dl>
            </Card>

            {sectionEntries.map(([k, v]) => (
              <Card key={k} className="p-4">
                <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-[var(--anchor-deep)]">
                  {humanize(k)}
                </h3>
                <PayloadValue value={v} />
              </Card>
            ))}

            {attachments.length > 0 && (
              <Card className="p-4">
                <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-[var(--anchor-deep)]">
                  Attachments ({attachments.length})
                </h3>
                <div className="flex flex-wrap gap-3">
                  {attachments.map((a) => {
                    const isImg = a.content_type.startsWith("image/");
                    return (
                      <a
                        key={a.path}
                        href={a.url || "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block w-28 overflow-hidden rounded-lg border border-[var(--border-default)]"
                        title={a.filename}
                      >
                        {isImg && a.url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={a.url} alt={a.filename} className="h-24 w-28 object-cover" />
                        ) : (
                          <div className="flex h-24 w-28 items-center justify-center bg-[var(--surface-soft)] text-xs text-[var(--anchor-gray)]">
                            📄 PDF
                          </div>
                        )}
                        <div className="truncate px-1.5 py-1 text-[10px] text-[var(--anchor-gray)]">
                          {a.filename}
                        </div>
                      </a>
                    );
                  })}
                </div>
              </Card>
            )}
          </div>

          {/* ── Decision side ── */}
          <div className="lg:col-span-1">
            <Card className="sticky top-4 p-4">
              <h3 className="text-sm font-bold uppercase tracking-wide text-[var(--anchor-deep)]">
                Review &amp; decide
              </h3>
              <label className="mt-3 block text-sm">
                <span className="font-medium">Status</span>
                <Select
                  value={statusDraft}
                  onChange={(e) => onStatus(e.target.value)}
                  className="mt-1 h-10 w-full text-sm"
                >
                  {FM_INTAKE_STATUSES.map((s) => (
                    <option key={s.key} value={s.key}>
                      {s.label}
                    </option>
                  ))}
                </Select>
              </label>
              <label className="mt-3 block text-sm">
                <span className="font-medium">Review notes / recommendation</span>
                <Textarea
                  value={notesDraft}
                  onChange={(e) => onNotes(e.target.value)}
                  rows={6}
                  placeholder="Recommendation, calcs, next steps…"
                  className="mt-1 w-full text-sm"
                />
              </label>
              <Button onClick={onSave} disabled={saving} className="mt-3 w-full">
                {saving ? "Saving…" : "Save decision"}
              </Button>
              {detail.reviewed_by_name && (
                <p className="mt-2 text-[11px] text-[var(--anchor-gray)]">
                  Last reviewed by {detail.reviewed_by_name}
                  {detail.reviewed_at ? ` · ${fmtDateTime(detail.reviewed_at)}` : ""}
                </p>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, value, full }: { label: string; value: unknown; full?: boolean }) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-[var(--anchor-gray)]">
        {label}
      </dt>
      <dd className="mt-0.5 whitespace-pre-line text-sm text-black">
        {isEmpty(value) ? "—" : String(value)}
      </dd>
    </div>
  );
}
