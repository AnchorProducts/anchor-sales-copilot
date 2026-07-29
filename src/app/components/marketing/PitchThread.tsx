"use client";

import { useState } from "react";
import type { CommentKind } from "@/lib/marketing/ideaConstants";

/* ============================================================================
 * The two-way pitch thread, shared by the submitter's "My Pitches" view and
 * marketing's "Submissions" inbox — both render the same mkt_idea_comment rows.
 * ==========================================================================*/

export type PitchComment = {
  id: string;
  idea_id: string;
  author_id: string | null;
  author_team: string | null;
  kind: CommentKind;
  body: string;
  created_at: string;
};

const KIND_META: Record<string, { label: string; cls: string }> = {
  info_request: { label: "Question from marketing", cls: "bg-[#fdf3e2] text-[#8a6d3b]" },
  info_response: { label: "Info provided", cls: "bg-[#eaf0fb] text-[#2f5b9c]" },
  decision: { label: "Decision", cls: "bg-[#e6f4ea] text-[#1e6b3a]" },
};

function fmt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function PitchThread({
  comments,
  currentUserId,
  authorName,
  replyKind,
  replyLabel,
  placeholder,
  onReply,
  disabled,
}: {
  comments: PitchComment[];
  currentUserId: string;
  /** Resolve an author id to a display name; falls back to "Marketing"/"You". */
  authorName?: (id: string | null) => string | null;
  /** Kind written when the reply box is used. */
  replyKind: CommentKind;
  replyLabel: string;
  placeholder: string;
  onReply: (body: string, kind: CommentKind) => Promise<boolean>;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  async function submit() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      const ok = await onReply(body, replyKind);
      if (ok) setDraft("");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-3">
      {comments.length > 0 && (
        <ul className="space-y-2">
          {comments.map((c) => {
            const meta = KIND_META[c.kind];
            const mine = c.author_id === currentUserId;
            const who = mine ? "You" : authorName?.(c.author_id) || (c.author_team ? "Marketing" : "Team");
            return (
              <li
                key={c.id}
                className={
                  "rounded-xl border border-[var(--border-default)] p-3 " +
                  (mine ? "bg-[var(--surface-soft)]" : "bg-white")
                }
              >
                <div className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-[var(--anchor-deep)]">{who}</span>
                  {meta && (
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${meta.cls}`}>
                      {meta.label}
                    </span>
                  )}
                  <span className="text-[11px] text-[var(--anchor-gray)]">{fmt(c.created_at)}</span>
                </div>
                <p className="whitespace-pre-wrap text-sm text-[var(--text-primary)]">{c.body}</p>
              </li>
            );
          })}
        </ul>
      )}

      {!disabled && (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <label className="flex-1">
            <span className="sr-only">{replyLabel}</span>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={2}
              placeholder={placeholder}
              className="w-full rounded-xl border border-[var(--border-default)] bg-white p-3 text-sm outline-none focus:border-[var(--anchor-green)]"
            />
          </label>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={sending || !draft.trim()}
            className="h-11 shrink-0 rounded-xl bg-[var(--anchor-green)] px-4 text-sm font-semibold text-white transition-opacity disabled:opacity-40"
          >
            {sending ? "Sending…" : replyLabel}
          </button>
        </div>
      )}
    </div>
  );
}
