"use client";

import { Card } from "@/app/components/ui/Card";
import { fmIntakeStatusLabel, fmIntakeStatusPill } from "@/lib/fmIntake";

// Read-only view of a single Project Intake (FM) submission — the customer/
// project summary, every nested payload section, and its attachments. Shared by
// the internal-rep detail page. (The admin back-office page renders its own copy
// alongside the review/decision panel.)

type Attachment = {
  path: string;
  filename: string;
  content_type: string;
  size: number;
  url: string | null;
};

export function fmtDateTime(s: string | null | undefined) {
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
  if (typeof value === "object") return <PayloadObject obj={value as Record<string, unknown>} />;
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

function Field({ label, value, full }: { label: string; value: unknown; full?: boolean }) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-[var(--anchor-gray)]">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-line text-sm text-black">
        {isEmpty(value) ? "—" : String(value)}
      </dd>
    </div>
  );
}

export default function IntakeDetailView({ detail }: { detail: any }) {
  const name = [detail.first_name, detail.last_name].filter(Boolean).join(" ") || "—";
  const attachments: Attachment[] = Array.isArray(detail.attachments) ? detail.attachments : [];
  const payload: Record<string, unknown> = detail.payload || {};
  const cust = (payload.customer || {}) as Record<string, unknown>;
  const sectionEntries = Object.entries(payload).filter(([k, v]) => k !== "customer" && !isEmpty(v));

  return (
    <div className="space-y-4">
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-lg font-bold text-[var(--anchor-deep)]">{name}</h2>
          {detail.company_name && (
            <span className="text-sm text-[var(--anchor-gray)]">· {detail.company_name}</span>
          )}
          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${fmIntakeStatusPill(detail.status)}`}>
            {fmIntakeStatusLabel(detail.status)}
          </span>
        </div>
        <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
          <Field label="Email" value={detail.email} />
          <Field label="Phone" value={detail.phone} />
          <Field label="Project" value={detail.project_name} />
          <Field label="Address" value={detail.project_address} full />
          <Field label="State / region" value={detail.state || detail.region_code} />
          <Field label="Equipment scope" value={(detail.equipment || []).join(", ")} full />
          <Field label="FM project?" value={cust.fmProject} />
          <Field label="FM insured?" value={cust.fmInsured} />
          {!isEmpty(cust.fmIndexRecord) && <Field label="FM Index-Record #" value={cust.fmIndexRecord} />}
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
                  <div className="truncate px-1.5 py-1 text-[10px] text-[var(--anchor-gray)]">{a.filename}</div>
                </a>
              );
            })}
          </div>
        </Card>
      )}

      {detail.review_notes && (
        <Card className="border-t-4 border-t-[var(--anchor-green)] p-4">
          <h3 className="mb-1 text-sm font-bold uppercase tracking-wide text-[var(--anchor-deep)]">
            Anchor review notes
          </h3>
          <p className="whitespace-pre-line text-sm text-black">{detail.review_notes}</p>
          {detail.reviewed_by_name && (
            <p className="mt-2 text-[11px] text-[var(--anchor-gray)]">
              Reviewed by {detail.reviewed_by_name}
              {detail.reviewed_at ? ` · ${fmtDateTime(detail.reviewed_at)}` : ""}
            </p>
          )}
        </Card>
      )}
    </div>
  );
}
