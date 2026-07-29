"use client";

import { Card } from "@/app/components/ui/Card";
import Button from "@/app/components/ui/Button";

/* ============================================================================
 * The NetSuite push panel, shared by consults and Project Intakes.
 *
 * The integration is built but not commissioned — there are no credentials yet.
 * Until `configured` is true (server-reported from isNetSuiteConfigured()), the
 * whole card renders inert and greyed under a "Coming soon" badge rather than
 * offering a button that can only fail. Populating the six NETSUITE_* vars is
 * all it takes to switch it on; there's no flag to flip.
 *
 * Pass `onSync` where the push is actually wired (consults). Omit it where it
 * isn't yet (Project Intakes) and the panel renders read-only — the status rows
 * still show, so the surface looks the same in both places.
 * ==========================================================================*/

type Props = {
  /** From the API's `netsuiteConfigured`. Never the credentials themselves. */
  configured: boolean;
  syncMode: "manual" | "automatic";
  syncStatus: string | null | undefined;
  companyId: string | null | undefined;
  contactId: string | null | undefined;
  /** Omit to render without a push button (integration not wired for this type). */
  onSync?: () => void;
  syncing?: boolean;
  syncMsg?: string | null;
  /** Copy for the labels, so this doesn't need the translation hook. */
  labels: {
    heading: string;
    syncButton: string;
    syncing: string;
    syncMode: string;
    syncModeManual: string;
    syncModeAutomatic: string;
    syncStatus: string;
  };
};

export default function NetSuitePanel({
  configured,
  syncMode,
  syncStatus,
  companyId,
  contactId,
  onSync,
  syncing = false,
  syncMsg,
  labels,
}: Props) {
  return (
    <Card className="relative p-5 sm:p-6">
      <div
        className={configured ? "" : "pointer-events-none select-none opacity-40"}
        aria-hidden={!configured}
      >
        <div className="ds-caption mb-4">{labels.heading}</div>

        {/* Manual sync only. In automatic mode a rep's records sync on their
            own, so the button disappears. */}
        {onSync && syncMode === "manual" && (
          <div className="grid gap-2">
            <Button onClick={onSync} disabled={syncing || !configured} className="w-full">
              {syncing ? labels.syncing : labels.syncButton}
            </Button>
          </div>
        )}
        {syncMsg && <div className="mt-3 text-xs text-[var(--anchor-gray)]">{syncMsg}</div>}

        <dl className={`grid gap-2 text-xs ${onSync && syncMode === "manual" ? "mt-6" : ""}`}>
          <Row
            label={labels.syncMode}
            value={syncMode === "automatic" ? labels.syncModeAutomatic : labels.syncModeManual}
          />
          <Row label={labels.syncStatus} value={syncStatus || "pending"} />
          <Row label="Company" value={companyId || "—"} />
          <Row label="Contact" value={contactId || "—"} />
        </dl>
      </div>

      {!configured && (
        <div className="absolute inset-0 flex items-start justify-center pt-16">
          <span className="rounded-full bg-[var(--surface-strong)] px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-[var(--anchor-gray)]">
            Coming soon
          </span>
        </div>
      )}
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-[var(--anchor-gray)]">{label}</dt>
      <dd
        className="min-w-0 truncate text-right font-medium text-[var(--text-primary)]"
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}
