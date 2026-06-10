"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { Card } from "@/app/components/ui/Card";
import Button from "@/app/components/ui/Button";

type Attachment = {
  path: string;
  filename: string;
  contentType: string;
  size: number;
  uploadedAt: string;
  solution_key?: string;
  solution_label?: string;
};

type SolutionRequest = {
  solution_key: string;
  solution_label: string;
  comment: string | null;
  attachments: Attachment[];
};

type LeadRow = {
  id: string;
  customer_company: string;
  details: string;
  project_address: string | null;
  location_text: string;
  region_code: string;
  state: string | null;
  country: string | null;
  inside_sales_name: string | null;
  inside_sales_email: string | null;
  outside_sales_name: string | null;
  assignment_note: string | null;
  roof_type: string | null;
  roof_brand: string | null;
  project_timeline: string | null;
  preferred_contact_method: string | null;
  preferred_contact_value: string | null;
  created_by_email: string | null;
  attachments: Attachment[] | null;
  solution_requests: SolutionRequest[] | null;
  status: string;
  assigned_rep_user_id: string | null;
  meeting_link: string | null;
  netsuite_company_id: string | null;
  netsuite_contact_id: string | null;
  netsuite_deal_id: string | null;
  netsuite_sync_status?: string | null;
  netsuite_sync_error?: string | null;
  created_at: string;
};

type SignedAttachment = Attachment & { url: string | null };

const CONTACT_METHOD_LABELS: Record<string, string> = {
  email: "Email",
  phone_call: "Phone (call)",
  phone_text: "Phone (text)",
};

function formatContactMethod(method: string | null, value: string | null) {
  if (!method) return "—";
  const label = CONTACT_METHOD_LABELS[method] || method;
  return value ? `${label} — ${value}` : label;
}

const PROJECT_TIMELINE_LABELS: Record<string, string> = {
  immediate: "Immediate",
  "2_4_weeks": "2-4 weeks",
  "2_3_months": "2-3 months",
  "3_6_months": "3-6 months",
  "6_12_months": "6-12 months",
  over_1_year: "Over 1 year",
};

function formatProjectTimeline(value: string | null): string {
  if (!value) return "—";
  return PROJECT_TIMELINE_LABELS[value] ?? value;
}

export default function LeadDetail({ id }: { id: string }) {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const { t } = useTranslation();

  const [lead, setLead] = useState<LeadRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [currentUserEmail, setCurrentUserEmail] = useState<string>("");
  const [currentUserName, setCurrentUserName] = useState<string>("");
  const [assignRepExpanded, setAssignRepExpanded] = useState(false);
  const [attachments, setAttachments] = useState<SignedAttachment[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/leads/${encodeURIComponent(id)}`, { cache: "no-store" });
      const text = await res.text();
      const json = text ? JSON.parse(text) : {};

      if (!res.ok) {
        setError(json?.error || "Failed to load opportunity.");
        setLead(null);
        setLoading(false);
        return;
      }

      const row = json?.lead as LeadRow;
      const urlMap = (json?.attachmentUrls ?? {}) as Record<string, string>;
      setLead(row);

      // The assigned rep is always the current user.
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id || "";
      setCurrentUserId(uid);
      setCurrentUserEmail(auth?.user?.email || "");
      if (uid) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", uid)
          .maybeSingle();
        setCurrentUserName(String((prof as any)?.full_name || ""));
      }

      // Server pre-signs URLs (browser client can't, storage RLS blocks it).
      const atts = Array.isArray(row.attachments) ? row.attachments : [];
      const signed: SignedAttachment[] = atts.map((att) => ({
        ...att,
        url: urlMap[att.path] ?? null,
      }));
      // Build a global path→url map so per-solution attachments resolve too.
      for (const s of row.solution_requests ?? []) {
        for (const att of s.attachments ?? []) {
          if (urlMap[att.path] && !signed.find((x) => x.path === att.path)) {
            signed.push({ ...att, url: urlMap[att.path] });
          }
        }
      }

      setAttachments(signed);
      setLoading(false);
    } catch (e: any) {
      setError(e?.message || "Failed to load opportunity.");
      setLead(null);
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Persist the current form state to the lead. Status stays "new" and the
  // assigned rep is always the current user. Returns the updated row, or null.
  async function persist(): Promise<LeadRow | null> {
    const res = await fetch(`/api/leads/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        status: "new",
        assigned_rep_user_id: currentUserId || null,
      }),
    });

    const text = await res.text();
    const json = text ? JSON.parse(text) : {};

    if (!res.ok) {
      setError(json?.error || "Failed to update opportunity.");
      return null;
    }

    const updated = (json?.lead || lead) as LeadRow;
    setLead(updated);
    return updated;
  }

  async function syncNetSuite() {
    setSyncing(true);
    setSyncMsg(null);
    setError(null);

    try {
      // Push the latest status + rep assignment first so NetSuite gets current state.
      const saved = await persist();
      if (!saved) {
        setSyncing(false);
        return;
      }

      const res = await fetch(`/api/leads/${encodeURIComponent(id)}/netsuite-sync`, {
        method: "POST",
      });

      const text = await res.text();
      const json = text ? JSON.parse(text) : {};

      if (!res.ok) {
        setSyncMsg(json?.error || "NetSuite sync failed.");
        setSyncing(false);
        return;
      }

      setSyncMsg("NetSuite sync complete.");
      await load();
      setSyncing(false);
    } catch (e: any) {
      setSyncMsg(e?.message || "NetSuite sync failed.");
      setSyncing(false);
    }
  }

  if (loading) return <Card className="p-5 text-sm text-[var(--anchor-gray)]">{t("loading")}</Card>;
  if (error) return <Card className="border-red-200 bg-red-50 p-5 text-sm text-red-700">{error}</Card>;
  if (!lead) return <Card className="p-5 text-sm text-[var(--anchor-gray)]">{t("leadNotFound")}</Card>;

  const attachmentByPath = new Map(attachments.map((a) => [a.path, a]));
  const solutionRequests = Array.isArray(lead.solution_requests) ? lead.solution_requests : [];

  return (
    <div className="grid gap-5">
      {/* Header — company + status + location at a glance */}
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="ds-caption">Consult</div>
          <h1 className="mt-1 break-words text-xl font-bold leading-tight tracking-tight text-[var(--anchor-deep)] sm:text-3xl">
            {lead.customer_company}
          </h1>
          <div className="mt-1 break-words text-sm text-[var(--anchor-gray)]">
            {lead.location_text}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:shrink-0">
          {lead.region_code && (
            <span className="rounded-full bg-[var(--surface-soft)] px-3 py-1 text-xs font-semibold text-[var(--anchor-deep)]">
              {lead.region_code}
            </span>
          )}
          <StatusBadge status={lead.status} />
        </div>
      </header>

      <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
        {/* Consult details */}
        <Card className="p-5 sm:p-6">
          <div className="ds-caption mb-4">{t("leadDetails")}</div>
          <dl className="grid gap-4 text-sm sm:grid-cols-2">
            <Field label={t("projectAddress")} value={lead.project_address} />
            <Field label={t("location")} value={lead.location_text} />
            <Field label={t("country")} value={lead.country} />
            <Field label={t("state")} value={lead.state} />
            <Field
              label={t("insideSales")}
              value={
                lead.inside_sales_name || lead.inside_sales_email
                  ? `${lead.inside_sales_name || "—"}${lead.inside_sales_email ? ` (${lead.inside_sales_email})` : ""}`
                  : t("unassigned")
              }
            />
            <Field label={t("outsideSalesAssignment")} value={lead.outside_sales_name || t("notSet")} />
            <Field label={t("roofType")} value={lead.roof_type} />
            <Field label={t("brand")} value={lead.roof_brand} />
            <Field label={t("projectTimelineLabel")} value={formatProjectTimeline(lead.project_timeline)} />
            <Field
              label={t("bestContactLabel")}
              value={formatContactMethod(lead.preferred_contact_method, lead.preferred_contact_value)}
            />
            <div className="sm:col-span-2">
              <Field label={t("details")} value={lead.details} multiline />
            </div>
            {lead.assignment_note && (
              <div className="sm:col-span-2">
                <Field label={t("assignmentNote")} value={lead.assignment_note} multiline />
              </div>
            )}
            <Field label={t("createdBy")} value={lead.created_by_email || t("unknown")} />
          </dl>
        </Card>

        {/* Right rail */}
        <div className="flex flex-col gap-5">
          {/* Solution uploads */}
          <Card className="p-5 sm:p-6">
            <div className="ds-caption mb-4">{t("solutionUploads")}</div>

            {solutionRequests.length === 0 ? (
              attachments.length === 0 ? (
                <div className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-soft)] p-4 text-sm text-[var(--anchor-gray)]">
                  {t("noSolutionUploads")}
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {attachments.map((att) => (
                    <AttachmentLink
                      key={att.path}
                      filename={att.filename}
                      path={att.path}
                      url={att.url}
                      contentType={att.contentType}
                    />
                  ))}
                </div>
              )
            ) : (
              <div className="grid gap-3">
                {solutionRequests.map((solution, idx) => (
                  <div
                    key={`${solution.solution_key}-${idx}`}
                    className="rounded-2xl border border-[var(--border-default)] bg-[var(--surface-soft)] p-4"
                  >
                    <div className="text-sm font-semibold text-[var(--anchor-deep)]">
                      {solution.solution_label}
                    </div>
                    {solution.comment && (
                      <div className="mt-1 whitespace-pre-wrap text-xs text-[var(--text-primary)]">
                        {solution.comment}
                      </div>
                    )}
                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      {(solution.attachments || []).length === 0 ? (
                        <div className="rounded-xl border border-[var(--border-default)] bg-white p-3 text-xs text-[var(--anchor-gray)]">
                          {t("noFiles")}
                        </div>
                      ) : (
                        solution.attachments.map((att) => {
                          const signed = attachmentByPath.get(att.path);
                          return (
                            <AttachmentLink
                              key={att.path}
                              filename={att.filename}
                              path={att.path}
                              url={signed?.url ?? null}
                              contentType={att.contentType}
                            />
                          );
                        })
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="relative p-5 sm:p-6">
            <div className="pointer-events-none select-none opacity-40">
            <div className="ds-caption mb-4">{t("leadActions")}</div>
            <div className="rounded-[14px] border border-black/10 bg-[var(--surface-soft)]">
              <button
                type="button"
                onClick={() => setAssignRepExpanded((v) => !v)}
                aria-expanded={assignRepExpanded}
                className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
              >
                <span className="text-sm font-semibold text-black">{t("assignRep")}</span>
                <span className="shrink-0 text-[11px] text-black/40">{assignRepExpanded ? "▴" : "▾"}</span>
              </button>
              {assignRepExpanded && (
                <div className="px-4 pb-4">
                  <div className="grid gap-1 text-sm text-[var(--anchor-gray)]">
                    {currentUserName && (
                      <div><span className="font-medium text-black">{currentUserName}</span></div>
                    )}
                    {currentUserEmail ? <div>{currentUserEmail}</div> : <div>{t("unknown")}</div>}
                  </div>
                </div>
              )}
            </div>

            {error && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="mt-5 grid gap-2">
              <Button
                onClick={syncNetSuite}
                disabled={syncing}
                className="w-full"
              >
                {syncing ? t("syncing") : t("syncToNetSuite")}
              </Button>
            </div>
            {syncMsg && (
              <div className="mt-3 text-xs text-[var(--anchor-gray)]">{syncMsg}</div>
            )}

            {/* NetSuite sync status — merged into the actions card */}
            <div className="mt-6 border-t border-[var(--border-default)] pt-5">
              <div className="ds-caption mb-3">NetSuite</div>
              <dl className="grid gap-2 text-xs">
                <Row label={t("syncStatus")} value={lead.netsuite_sync_status || "pending"} />
                <Row label="Company" value={lead.netsuite_company_id || "—"} />
                <Row label="Contact" value={lead.netsuite_contact_id || "—"} />
              </dl>
            </div>
            </div>

            {/* Whole section is not live yet */}
            <div className="absolute inset-0 flex items-start justify-center pt-16">
              <span className="rounded-full bg-[var(--surface-strong)] px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--anchor-gray)]">
                Coming soon
              </span>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Subcomponents
// ────────────────────────────────────────────────────────────────────────────

function Field({
  label,
  value,
  multiline = false,
}: {
  label: string;
  value: string | null | undefined;
  multiline?: boolean;
}) {
  const v = value && String(value).trim().length > 0 ? value : "—";
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-[var(--anchor-gray)]">
        {label}
      </dt>
      <dd
        className={`mt-1 text-sm text-[var(--text-primary)] ${
          multiline ? "whitespace-pre-wrap" : "break-words"
        }`}
      >
        {v}
      </dd>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-[var(--anchor-gray)]">{label}</dt>
      <dd className="min-w-0 truncate text-right font-medium text-[var(--text-primary)]" title={value}>
        {value}
      </dd>
    </div>
  );
}

const STATUS_STYLES: Record<string, string> = {
  new: "bg-[var(--anchor-mint)] text-[var(--anchor-deep)]",
  assigned: "bg-amber-100 text-amber-800",
  contacted: "bg-blue-100 text-blue-800",
  qualified: "bg-indigo-100 text-indigo-800",
  closed_won: "bg-[var(--anchor-green)] text-white",
  closed_lost: "bg-[var(--surface-strong)] text-[var(--anchor-gray)]",
};

function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_STYLES[status] ?? "bg-[var(--surface-soft)] text-[var(--anchor-deep)]";
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${cls}`}>
      {status.replace("_", " ")}
    </span>
  );
}

const IMAGE_EXTS = new Set(["jpg", "jpeg", "png", "gif", "webp", "heic", "heif", "svg"]);

function isImage(filename: string, contentType?: string) {
  if (contentType && contentType.startsWith("image/")) return true;
  const ext = filename.toLowerCase().split(".").pop() || "";
  return IMAGE_EXTS.has(ext);
}

function AttachmentLink({
  filename,
  path,
  url,
  contentType,
}: {
  filename: string;
  path: string;
  url: string | null;
  contentType?: string;
}) {
  const showThumb = !!url && isImage(filename, contentType);
  const isDisabled = !url;

  return (
    <a
      href={url || "#"}
      target="_blank"
      rel="noopener noreferrer"
      aria-disabled={isDisabled || undefined}
      onClick={(e) => {
        if (isDisabled) e.preventDefault();
      }}
      className={`block overflow-hidden rounded-xl border border-[var(--border-default)] bg-white transition-colors hover:bg-[var(--surface-soft)] ${
        isDisabled ? "cursor-not-allowed opacity-60" : ""
      }`}
    >
      {showThumb && (
        <div className="aspect-[16/10] w-full overflow-hidden bg-[var(--surface-soft)]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url!}
            alt={filename}
            className="h-full w-full object-cover"
            loading="lazy"
          />
        </div>
      )}
      <div className="p-3">
        <div className="truncate text-sm font-semibold text-[var(--anchor-deep)]">{filename}</div>
        <div className="mt-1 truncate text-[11px] text-[var(--anchor-gray)]">{path}</div>
      </div>
    </a>
  );
}
