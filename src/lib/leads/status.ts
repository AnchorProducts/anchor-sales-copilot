// Shared consult (lead) status vocabulary — client + server safe.
//
// Two states only: a consult is either sitting unclaimed or it belongs to
// somebody. Status is DERIVED from the assignee (see statusForAssignee) rather
// than chosen independently, so the badge can never contradict the assignment.
// Mirrors the leads_status_check constraint — change both together.

export type LeadStatus = { key: string; label: string };

export const LEAD_STATUSES: LeadStatus[] = [
  { key: "new", label: "New" },
  { key: "assigned", label: "Assigned" },
];

export const LEAD_STATUS_KEYS = LEAD_STATUSES.map((s) => s.key);

export function isLeadStatus(key: string): boolean {
  return LEAD_STATUS_KEYS.includes(key);
}

export function leadStatusLabel(key: string | null | undefined): string {
  if (!key) return "New";
  return LEAD_STATUSES.find((s) => s.key === key)?.label || key;
}

/** The only writer of status: an assignee means assigned, nothing means new. */
export function statusForAssignee(assigneeId: string | null | undefined): string {
  return assigneeId ? "assigned" : "new";
}

export function leadStatusPill(key: string | null | undefined): string {
  return key === "assigned"
    ? "bg-[var(--anchor-mint)] text-[var(--anchor-deep)]"
    : "bg-[var(--surface-strong)] text-[var(--anchor-gray)]";
}
