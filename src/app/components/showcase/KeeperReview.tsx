"use client";

import { useMemo, useState } from "react";
import Button from "@/app/components/ui/Button";
import { Alert } from "@/app/components/ui/Alert";
import { Textarea } from "@/app/components/ui/Field";
import Sheet from "@/app/components/ui/Sheet";
import { Segmented } from "@/app/components/ui/kit";
import { Badge } from "@/app/components/showcase/ShowcaseBadges";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { MAX_NOTE, showcaseFetch, type KeeperReview } from "@/lib/showcase/client";

/* ============================================================================
 * The keeper's approve / deny on a pending stop or photo somebody else filed.
 *
 * A RECOMMENDATION FOR AN ADMIN, never a decision: approving doesn't put
 * anything on the site and denying doesn't take anything off. The admin sees it
 * beside Publish and Decline on anchorp.com and makes the call. Every piece of
 * copy here says so, because "Approve" on its own reads like "publish".
 * ==========================================================================*/

type Target = { stopId: string } | { photoId: string };
type Verdict = KeeperReview["verdict"];

function useKeeperReview(target: Target, onChanged: () => Promise<void>) {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send(verdict: Verdict | "clear", note = "") {
    setBusy(true);
    setError(null);
    const result = await showcaseFetch(supabase, "/api/showcase/review", {
      method: "POST",
      body: { ...target, verdict, note },
    });
    if (!result.ok) {
      setBusy(false);
      setError(result.error);
      return false;
    }
    await onChanged();
    setBusy(false);
    return true;
  }

  return { busy, error, send };
}

/** "You approved", "Warren denied" — the verdict as a badge. */
export function KeeperBadge({ review }: { review: KeeperReview }) {
  const who = review.mine ? "You" : (review.by ?? "Keeper");
  return (
    <Badge tone={review.verdict === "approve" ? "green" : "red"}>
      {who} {review.verdict === "approve" ? "approved" : "denied"}
    </Badge>
  );
}

/** The full control, for a stop: explanation, Approve / Deny, and the reason. */
export function StopReview({
  stopId,
  review,
  onChanged,
}: {
  stopId: string;
  review: KeeperReview | null;
  onChanged: () => Promise<void>;
}) {
  const { busy, error, send } = useKeeperReview({ stopId }, onChanged);
  const [denying, setDenying] = useState(false);

  return (
    <div className="grid gap-3">
      <p className="text-sm text-[var(--anchor-gray)]">
        {review
          ? "Sent to admin with your recommendation. Nothing changes on the site until an admin publishes or declines it."
          : "Someone else filed this. Approve or deny it and admin sees your call before deciding. Nothing changes on the site until they do."}
      </p>

      <Segmented<Verdict>
        ariaLabel="Your review"
        full
        value={review?.verdict ?? null}
        onChange={(v) => {
          if (busy) return;
          if (v === "deny") setDenying(true);
          else if (review?.verdict !== "approve") void send("approve");
        }}
        options={[
          { value: "approve", label: "Approve" },
          { value: "deny", label: "Deny" },
        ]}
      />

      {review?.note && (
        <p className="rounded-lg bg-[var(--surface-strong)] p-2 text-sm text-[var(--anchor-deep)]">
          <span className="font-semibold">{review.mine ? "Your reason" : `${review.by ?? "Keeper"}'s reason`}: </span>
          {review.note}
        </p>
      )}
      {review && (
        <div>
          <Button
            variant="ghost"
            className="!px-2 !py-1 text-xs"
            onClick={() => void send("clear")}
            disabled={busy}
          >
            {busy ? "Saving…" : "Withdraw my review"}
          </Button>
        </div>
      )}
      {error && <Alert tone="error">{error}</Alert>}

      <DenySheet
        key={denying ? "open" : "closed"}
        open={denying}
        what="stop"
        initial={review?.verdict === "deny" ? (review.note ?? "") : ""}
        busy={busy}
        error={error}
        onClose={() => setDenying(false)}
        onDeny={async (note) => {
          if (await send("deny", note)) setDenying(false);
        }}
      />
    </div>
  );
}

/** The compact control under a photo tile. */
export function PhotoReview({
  photoId,
  review,
  onChanged,
}: {
  photoId: string;
  review: KeeperReview | null;
  onChanged: () => Promise<void>;
}) {
  const { busy, error, send } = useKeeperReview({ photoId }, onChanged);
  const [denying, setDenying] = useState(false);

  return (
    <div className="grid gap-1">
      {review ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <KeeperBadge review={review} />
          <button
            type="button"
            onClick={() => void send("clear")}
            disabled={busy}
            className="text-xs font-semibold text-[var(--anchor-gray)] disabled:opacity-50"
          >
            Undo
          </button>
        </div>
      ) : (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void send("approve")}
            disabled={busy}
            className="text-xs font-semibold text-[var(--anchor-green)] disabled:opacity-50"
          >
            Approve
          </button>
          <button
            type="button"
            onClick={() => setDenying(true)}
            disabled={busy}
            className="text-xs font-semibold text-red-700 disabled:opacity-50"
          >
            Deny
          </button>
        </div>
      )}
      {error && !denying && <span className="text-xs text-red-700">{error}</span>}

      <DenySheet
        key={denying ? "open" : "closed"}
        open={denying}
        what="photo"
        initial=""
        busy={busy}
        error={error}
        onClose={() => setDenying(false)}
        onDeny={async (note) => {
          if (await send("deny", note)) setDenying(false);
        }}
      />
    </div>
  );
}

function DenySheet({
  open,
  what,
  initial,
  busy,
  error,
  onClose,
  onDeny,
}: {
  open: boolean;
  what: "stop" | "photo";
  initial: string;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onDeny: (note: string) => void;
}) {
  const [note, setNote] = useState(initial);

  return (
    <Sheet
      open={open}
      onClose={() => {
        if (!busy) onClose();
      }}
      title={`Deny this ${what}?`}
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={() => onDeny(note.trim())} disabled={busy}>
            {busy ? "Sending…" : "Deny"}
          </Button>
        </div>
      }
    >
      <p className="text-sm text-[var(--anchor-deep)]">
        Admin sees your reason and makes the final call. It stays in their queue until they do.
      </p>
      <label className="mt-3 grid gap-1.5 text-sm">
        <span className="font-semibold">
          Why? <span className="font-normal text-[var(--anchor-gray)]">(optional, for admin)</span>
        </span>
        <Textarea rows={3} value={note} maxLength={MAX_NOTE} onChange={(e) => setNote(e.target.value)} />
      </label>
      {error && <Alert tone="error" className="mt-3">{error}</Alert>}
    </Sheet>
  );
}
