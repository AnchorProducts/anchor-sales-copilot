"use client";

import { useEffect } from "react";

export type OemPerson = {
  key: string;
  name: string;
  email: string | null;
  type: string; // Sales rep / Tech rep / Consultant
  oems: string[];
  signedUp: boolean;
  uses: number;
  leads: number;
  reports: number;
  profileId: string | null;
};

export function OemPeopleModal({
  open,
  title,
  subtitle,
  people,
  emptyMessage,
  onClose,
  onDownloadPdf,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  people: OemPerson[];
  emptyMessage: string;
  onClose: () => void;
  onDownloadPdf?: (p: OemPerson) => void;
}) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-xl sm:max-w-2xl sm:rounded-3xl">
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border-default)] px-5 py-4 sm:px-6">
          <div>
            <h3 className="text-lg font-bold text-[var(--anchor-deep)] sm:text-xl">{title}</h3>
            {subtitle && <p className="mt-0.5 text-xs text-[var(--anchor-gray)] sm:text-sm">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1.5 text-[var(--anchor-gray)] hover:bg-[var(--surface-soft)] hover:text-[var(--anchor-deep)]"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="6" y1="18" x2="18" y2="6" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 sm:px-6">
          {people.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--border-default)] p-8 text-center text-sm text-[var(--anchor-gray)]">
              {emptyMessage}
            </div>
          ) : (
            <ul className="divide-y divide-[var(--border-default)]">
              {people.map((p) => (
                <li key={p.key} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="truncate text-sm font-semibold text-[var(--anchor-deep)] sm:text-base">
                        {p.name}
                      </span>
                      <span className="rounded-full bg-[#dbeafe] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#1e3a8a]">
                        {p.type}
                      </span>
                      {p.oems.slice(0, 3).map((o) => (
                        <span key={o} className="rounded-full bg-[var(--surface-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--anchor-deep)]">
                          {o}
                        </span>
                      ))}
                      {p.oems.length > 3 && (
                        <span className="text-[10px] text-[var(--anchor-gray)]">+{p.oems.length - 3}</span>
                      )}
                      {!p.signedUp && (
                        <span className="rounded-full bg-black/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-black/55">
                          Not signed up
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-[var(--anchor-gray)]">{p.email || "no email"}</div>
                  </div>
                  <div className="flex shrink-0 items-center justify-between gap-3 sm:justify-end">
                    <div className="flex shrink-0 items-center gap-4 text-center">
                      <Stat label="uses" value={p.uses} />
                      <Stat label="leads" value={p.leads} />
                      <Stat label="reps" value={p.reports} />
                    </div>
                    {onDownloadPdf && p.signedUp && p.profileId && (
                      <button
                        type="button"
                        data-track-id="oem-people-modal-pdf"
                        onClick={() => onDownloadPdf(p)}
                        className="shrink-0 rounded-lg border border-[var(--anchor-green)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--anchor-green)] hover:bg-[var(--anchor-green)] hover:text-white"
                      >
                        PDF
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-[var(--border-default)] bg-[var(--surface-soft)] px-5 py-3 sm:px-6">
          <span className="text-xs text-[var(--anchor-gray)]">{people.length} {people.length === 1 ? "person" : "people"}</span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[var(--border-default)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--anchor-gray)] hover:text-[var(--anchor-deep)]"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-sm font-bold tabular-nums text-[var(--anchor-deep)]">{value.toLocaleString()}</div>
      <div className="text-[10px] uppercase tracking-wide text-[var(--anchor-gray)]">{label}</div>
    </div>
  );
}
