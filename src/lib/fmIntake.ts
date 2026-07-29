<<<<<<< HEAD
// Shared review-workflow vocabulary for FM intake submissions (the "decide"
// side). Used by the admin API + the back-office UI so the values never drift.
=======
// Shared Project Intake (FM) status vocabulary. Used by the admin API + the
// back-office UI so the values never drift.
//
// Two states only, matching consults: an intake is either unclaimed or it
// belongs to somebody. Status is DERIVED from the assignee (statusForAssignee)
// rather than chosen independently. The earlier four-step review workflow
// (new → in_review → recommended → closed) was retired in
// 20260729_000001_consult_assignment.sql. `review_notes` stayed — the notes are
// still useful independently of who owns the intake.
>>>>>>> a793af67077ac9a21d787700dec76bb40baeba7e

export type FmIntakeStatus = {
  key: string;
  label: string;
};

<<<<<<< HEAD
// Workflow: new → in review → recommended → closed.
export const FM_INTAKE_STATUSES: FmIntakeStatus[] = [
  { key: "new", label: "New" },
  { key: "in_review", label: "In review" },
  { key: "recommended", label: "Recommended" },
  { key: "closed", label: "Closed" },
=======
export const FM_INTAKE_STATUSES: FmIntakeStatus[] = [
  { key: "new", label: "New" },
  { key: "assigned", label: "Assigned" },
>>>>>>> a793af67077ac9a21d787700dec76bb40baeba7e
];

export const FM_INTAKE_STATUS_KEYS = FM_INTAKE_STATUSES.map((s) => s.key);

export function isFmIntakeStatus(key: string): boolean {
  return FM_INTAKE_STATUS_KEYS.includes(key);
}

export function fmIntakeStatusLabel(key: string | null | undefined): string {
  if (!key) return "New";
  return FM_INTAKE_STATUSES.find((s) => s.key === key)?.label || key;
}

<<<<<<< HEAD
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
=======
/** The only writer of status: an assignee means assigned, nothing means new. */
export function statusForAssignee(assigneeId: string | null | undefined): string {
  return assigneeId ? "assigned" : "new";
}

// Scannable colored pill classes for a status.
export function fmIntakeStatusPill(key: string | null | undefined): string {
  return key === "assigned"
    ? "bg-[var(--anchor-mint)] text-[var(--anchor-deep)]"
    : "bg-[var(--surface-strong)] text-[var(--anchor-gray)]";
>>>>>>> a793af67077ac9a21d787700dec76bb40baeba7e
}
