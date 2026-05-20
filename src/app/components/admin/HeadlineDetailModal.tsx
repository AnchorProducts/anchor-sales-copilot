"use client";

import { useEffect } from "react";

export type DetailUserRow = {
  id: string;
  full_name: string | null;
  email: string;
  role?: string | null;
  manufacturer?: string | null;
  events: {
    total7: number;
    total30: number;
    lastSeen: string | null;
  };
};

function fmtRelative(iso: string | null): string {
  if (!iso) return "Never";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return `${Math.floor(d / 7)}w ago`;
}

function isInternal(u: DetailUserRow) {
  return u.role === "anchor_rep" || u.role === "admin";
}

export function HeadlineDetailModal({
  open,
  title,
  subtitle,
  users,
  emptyMessage,
  onClose,
  onDownloadPdf,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  users: DetailUserRow[];
  emptyMessage: string;
  onClose: () => void;
  onDownloadPdf?: (id: string) => void;
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
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border-default)] px-5 py-4 sm:px-6">
          <div>
            <h3 className="text-lg font-bold text-[var(--anchor-deep)] sm:text-xl">{title}</h3>
            {subtitle && (
              <p className="mt-0.5 text-xs text-[var(--anchor-gray)] sm:text-sm">{subtitle}</p>
            )}
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

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 sm:px-6">
          {users.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[var(--border-default)] p-8 text-center text-sm text-[var(--anchor-gray)]">
              {emptyMessage}
            </div>
          ) : (
            <ul className="divide-y divide-[var(--border-default)]">
              {users.map((u) => (
                <li key={u.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="truncate text-sm font-semibold text-[var(--anchor-deep)] sm:text-base">
                        {u.full_name || u.email}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                          isInternal(u)
                            ? "bg-[var(--anchor-mint)]/50 text-[var(--anchor-deep)]"
                            : "bg-[var(--surface-soft)] text-[var(--anchor-gray)]"
                        }`}
                      >
                        {isInternal(u) ? "Internal" : "External"}
                      </span>
                      {u.manufacturer && (
                        <span className="rounded-full bg-[var(--surface-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--anchor-deep)]">
                          {u.manufacturer}
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-[var(--anchor-gray)]">
                      {u.email}
                      {u.events.lastSeen && ` · last seen ${fmtRelative(u.events.lastSeen)}`}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center justify-between gap-3 sm:justify-end">
                    <div className="flex shrink-0 items-center gap-4 text-center">
                      <Stat label="7d" value={u.events.total7} />
                      <Stat label="30d" value={u.events.total30} />
                    </div>
                    {onDownloadPdf && (
                      <button
                        type="button"
                        data-track-id="headline-detail-pdf"
                        onClick={() => onDownloadPdf(u.id)}
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

        {/* Footer */}
        <div className="flex items-center justify-end border-t border-[var(--border-default)] bg-[var(--surface-soft)] px-5 py-3 sm:px-6">
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
      <div className="text-sm font-bold tabular-nums text-[var(--anchor-deep)]">
        {value.toLocaleString()}
      </div>
      <div className="text-[10px] uppercase tracking-wide text-[var(--anchor-gray)]">{label}</div>
    </div>
  );
}
