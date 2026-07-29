/* Strategy-board constants — client + server safe (no server-only).
 *
 * Category and status values are the SAME strings the Anchor Internal Portal's
 * Strategy Board writes to mkt_idea, since both surfaces read the same rows.
 * Only the Tailwind classes are app-local. */

export const IDEA_STATUSES = [
  { value: "inbox", label: "Inbox" },
  { value: "considering", label: "Considering" },
  { value: "planned", label: "Planned" },
  { value: "in_progress", label: "In progress" },
  { value: "done", label: "Done" },
] as const;
export type IdeaStatus = (typeof IDEA_STATUSES)[number]["value"] | "parked";

/** Categories an idea gets sorted into as it comes in. */
export const IDEA_CATEGORIES = [
  { value: "campaign", label: "Campaign", cls: "bg-[#e6f4ea] text-[#1e6b3a]" },
  { value: "social", label: "Social", cls: "bg-[#eaf0fb] text-[#2f5b9c]" },
  { value: "email", label: "Email", cls: "bg-[#efe9fb] text-[#5b3fa0]" },
  { value: "event", label: "Event / Tradeshow", cls: "bg-[#fdf3e2] text-[#8a6d3b]" },
  { value: "ad", label: "Ad", cls: "bg-[#fbeaea] text-[#9c3f3f]" },
  { value: "content", label: "Content", cls: "bg-[#e9f6f7] text-[#2f7c85]" },
  { value: "partnership", label: "Partnership", cls: "bg-[#f2eee6] text-[#7a6a4f]" },
  { value: "website", label: "Website", cls: "bg-[#eef0f2] text-[#54595e]" },
  { value: "other", label: "Other", cls: "bg-[#eef0f2] text-[#54595e]" },
] as const;
export type IdeaCategory = (typeof IDEA_CATEGORIES)[number]["value"];

export const CATEGORY_META: Record<string, { label: string; cls: string }> = Object.fromEntries(
  IDEA_CATEGORIES.map((c) => [c.value, { label: c.label, cls: c.cls }])
);

/* ── Pitch review (source='pitch') ──────────────────────────────────────── */

export const REVIEW_STATUSES = [
  { value: "pending", label: "Pending review", cls: "bg-[#eef0f2] text-[#54595e]" },
  { value: "needs_info", label: "Needs info", cls: "bg-[#fdf3e2] text-[#8a6d3b]" },
  { value: "approved", label: "Approved", cls: "bg-[#e6f4ea] text-[#1e6b3a]" },
  { value: "declined", label: "Declined", cls: "bg-[#fbeaea] text-[#9c3f3f]" },
] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number]["value"];

export const REVIEW_META: Record<string, { label: string; cls: string }> = Object.fromEntries(
  REVIEW_STATUSES.map((r) => [r.value, { label: r.label, cls: r.cls }])
);

/** Comment kinds on the two-way thread. */
export const COMMENT_KINDS = ["comment", "info_request", "info_response", "decision"] as const;
export type CommentKind = (typeof COMMENT_KINDS)[number];

export function categoryLabel(value: string | null | undefined): string {
  return CATEGORY_META[String(value ?? "")]?.label ?? "Other";
}

export function reviewLabel(value: string | null | undefined): string {
  return REVIEW_META[String(value ?? "")]?.label ?? "—";
}
