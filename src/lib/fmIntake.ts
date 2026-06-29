// Shared review-workflow vocabulary for FM intake submissions (the "decide"
// side). Used by the admin API + the back-office UI so the values never drift.

export type FmIntakeStatus = {
  key: string;
  label: string;
};

// Workflow: new → in review → recommended → closed.
export const FM_INTAKE_STATUSES: FmIntakeStatus[] = [
  { key: "new", label: "New" },
  { key: "in_review", label: "In review" },
  { key: "recommended", label: "Recommended" },
  { key: "closed", label: "Closed" },
];

export const FM_INTAKE_STATUS_KEYS = FM_INTAKE_STATUSES.map((s) => s.key);

export function isFmIntakeStatus(key: string): boolean {
  return FM_INTAKE_STATUS_KEYS.includes(key);
}

export function fmIntakeStatusLabel(key: string | null | undefined): string {
  if (!key) return "New";
  return FM_INTAKE_STATUSES.find((s) => s.key === key)?.label || key;
}

// Scannable colored pill classes for a status.
export function fmIntakeStatusPill(key: string | null | undefined): string {
  switch (key) {
    case "closed":
      return "bg-[var(--anchor-mint)] text-[var(--anchor-deep)]";
    case "recommended":
      return "bg-green-100 text-green-700";
    case "in_review":
      return "bg-amber-100 text-amber-800";
    default: // new
      return "bg-[var(--surface-strong)] text-[var(--anchor-gray)]";
  }
}
