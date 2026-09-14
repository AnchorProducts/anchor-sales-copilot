"use client";

import { useMemo, useState } from "react";
import Button from "@/app/components/ui/Button";
import { Card } from "@/app/components/ui/Card";
import { Alert } from "@/app/components/ui/Alert";
import { Input, Textarea } from "@/app/components/ui/Field";
import Sheet from "@/app/components/ui/Sheet";
import { PhotoPicker, usePhotoUpload } from "@/app/components/showcase/PhotoPicker";
import { Badge, ReviewNote, StatusBadge } from "@/app/components/showcase/ShowcaseBadges";
import { supabaseBrowser } from "@/lib/supabase/browser";
import {
  MAX_NOTE,
  MAX_TEXT,
  formatDay,
  showcaseFetch,
  type ScheduleStop,
  type StopStatus,
} from "@/lib/showcase/client";

/* ============================================================================
 * Edit one stop on the schedule — keepers only.
 *
 * Editable: date, city, event, note, and a photo that isn't on the site yet.
 * Status, "requested" and a live photo are shown but never become inputs; the
 * website ignores them and a database trigger puts them back regardless.
 *
 * An edit to a published stop is on the public page the moment it saves — no
 * re-review — so the screen says so above the button.
 * ==========================================================================*/

export type Flash = { tone: "success" | "error"; text: string };

const REMOVE_WARNING: Record<StopStatus, string> = {
  published: "This stop is live on the website. Removing it takes it off the site.",
  pending: "Marketing hasn't reviewed this stop yet. Removing it takes it out of their queue.",
  declined: "This stop was declined and isn't on the site. Removing it deletes it for good.",
};

export default function StopEditor({
  stop,
  onBack,
  onDone,
}: {
  stop: ScheduleStop;
  onBack: () => void;
  onDone: (result: Flash) => void;
}) {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const { photo, pick, retry, clear } = usePhotoUpload();

  const [date, setDate] = useState(stop.date);
  const [city, setCity] = useState(stop.city);
  const [event, setEvent] = useState(stop.event);
  const [note, setNote] = useState(stop.note ?? "");
  const [removeWaiting, setRemoveWaiting] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const live = stop.status === "published";

  // Only what changed is sent. On a live stop every field that goes up is a
  // live edit, so an untouched one shouldn't ride along.
  const textChanges = useMemo(() => {
    const c: Record<string, string> = {};
    if (date !== stop.date) c.date = date;
    if (city.trim() !== stop.city) c.city = city.trim();
    if (event.trim() !== stop.event) c.event = event.trim();
    if (note.trim() !== (stop.note ?? "")) c.note = note.trim();
    return c;
  }, [date, city, event, note, stop]);

  const photoPath = photo.kind === "ready" ? photo.path : removeWaiting ? "" : undefined;
  const dirty = Object.keys(textChanges).length > 0 || photoPath !== undefined;

  function pickPhoto(file: File) {
    setRemoveWaiting(false);
    return pick(file);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!date) return setError("A date is required.");
    if (!city.trim()) return setError("A city is required.");
    if (!event.trim()) return setError("An event is required.");
    if (photo.kind === "uploading") return setError("The photo is still uploading — give it a moment.");
    if (photo.kind === "error") {
      return setError("The photo didn't upload. Try it again or remove it before saving.");
    }
    if (!dirty) return onBack();

    setSaving(true);
    const result = await showcaseFetch<{ ok?: boolean }>(supabase, "/api/showcase/stops", {
      method: "PATCH",
      body: { id: stop.id, ...textChanges, ...(photoPath !== undefined ? { photoPath } : {}) },
    });
    setSaving(false);

    if (result.ok) {
      const parts = ["Saved."];
      if (live && Object.keys(textChanges).length) parts.push("The website shows the change now.");
      if (photoPath) parts.push("The photo goes to marketing for review.");
      return onDone({ tone: "success", text: parts.join(" ") });
    }
    if (result.status === 404) {
      return onDone({ tone: "error", text: "That stop was removed while you were editing it." });
    }
    // Everything typed stays put so a retry is one tap.
    setError(result.error);
  }

  async function remove() {
    setDeleting(true);
    setDeleteError(null);
    const result = await showcaseFetch<{ ok?: boolean }>(supabase, "/api/showcase/stops", {
      method: "DELETE",
      body: { id: stop.id },
    });
    setDeleting(false);
    if (!result.ok) {
      setDeleteError(result.error);
      return;
    }
    setConfirming(false);
    onDone({ tone: "success", text: live ? "Stop removed. It's off the website." : "Stop removed." });
  }

  return (
    <div className="grid gap-4">
      <div>
        <Button variant="ghost" className="!px-2" onClick={onBack} disabled={saving}>
          ← Back to schedule
        </Button>
      </div>

      <form onSubmit={save}>
        <Card className="border-t-4 border-t-[var(--anchor-green)] p-4 sm:p-5">
          <div className="text-sm font-semibold text-black">Edit stop</div>

          {/* Read-only: these are marketing's, set on the website. */}
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <StatusBadge status={stop.status} />
            {stop.requested && <Badge tone="gray">Requested</Badge>}
            {stop.mine && <span className="text-xs text-[var(--anchor-gray)]">Filed by you</span>}
          </div>
          <p className="mt-2 text-xs text-[var(--anchor-gray)]">
            Status and &ldquo;Requested&rdquo; are set by marketing on anchorp.com.
          </p>
          {stop.reviewNote && <ReviewNote note={stop.reviewNote} />}

          <div className="mt-5 grid gap-4">
            <label className="grid gap-1.5 text-sm">
              <span className="font-semibold">Date</span>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
            </label>

            <label className="grid gap-1.5 text-sm">
              <span className="font-semibold">City</span>
              <Input value={city} maxLength={MAX_TEXT} onChange={(e) => setCity(e.target.value)} required />
            </label>

            <label className="grid gap-1.5 text-sm">
              <span className="font-semibold">Event</span>
              <Input value={event} maxLength={MAX_TEXT} onChange={(e) => setEvent(e.target.value)} required />
            </label>

            <label className="grid gap-1.5 text-sm">
              <span className="font-semibold">
                Note <span className="font-normal text-[var(--anchor-gray)]">(optional)</span>
              </span>
              <Textarea rows={3} value={note} maxLength={MAX_NOTE} onChange={(e) => setNote(e.target.value)} />
            </label>

            <div className="grid gap-2 text-sm">
              <span className="font-semibold">Photo</span>

              {stop.photo === "published" ? (
                <>
                  {stop.photoUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={stop.photoUrl}
                      alt={`${stop.event}, ${stop.city}`}
                      className="max-h-64 w-full rounded-xl object-cover"
                    />
                  )}
                  <span className="text-xs text-[var(--anchor-gray)]">
                    This photo is on the website. To change or remove it, ask marketing.
                  </span>
                </>
              ) : stop.photo === "waiting" && photo.kind === "none" ? (
                removeWaiting ? (
                  <div className="flex flex-wrap items-center gap-2 rounded-xl border border-black/10 p-3">
                    <span className="flex-1 text-sm">
                      The photo awaiting review will be removed when you save.
                    </span>
                    <Button variant="ghost" className="!px-3 !py-1 text-xs" onClick={() => setRemoveWaiting(false)}>
                      Undo
                    </Button>
                  </div>
                ) : (
                  <div className="grid gap-2 rounded-xl border border-black/10 p-3">
                    <span className="flex flex-wrap items-center gap-2">
                      <Badge tone="amber">Awaiting marketing review</Badge>
                      <span className="text-xs text-[var(--anchor-gray)]">Not on the site yet.</span>
                    </span>
                    <div className="flex flex-wrap gap-2">
                      <PhotoPicker
                        photo={photo}
                        onPick={pickPhoto}
                        onRetry={retry}
                        onRemove={clear}
                        label="Replace"
                      />
                      <Button variant="ghost" onClick={() => setRemoveWaiting(true)}>
                        Remove
                      </Button>
                    </div>
                  </div>
                )
              ) : (
                <PhotoPicker
                  photo={photo}
                  onPick={pickPhoto}
                  onRetry={retry}
                  onRemove={clear}
                  label="Add photo"
                  hint={
                    stop.photo === "waiting"
                      ? "Replaces the photo awaiting review. Remove this one to keep the original."
                      : "Marketing reviews the photo before it goes on the site."
                  }
                />
              )}
            </div>

            {live && (
              <Alert tone="neutral">This stop is live. Changes show on the website immediately.</Alert>
            )}
            {error && <Alert tone="error">{error}</Alert>}

            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={!dirty || saving || photo.kind === "uploading"}>
                {saving ? "Saving…" : "Save changes"}
              </Button>
              <Button variant="secondary" onClick={onBack} disabled={saving}>
                Cancel
              </Button>
            </div>
          </div>
        </Card>
      </form>

      <Card className="p-4 sm:p-5">
        <div className="text-sm font-semibold text-black">Remove this stop</div>
        <p className="mt-1 text-sm text-[var(--anchor-gray)]">
          {live ? "Takes it off the website." : "Deletes it from the schedule."} This can&rsquo;t be
          undone.
        </p>
        <Button
          variant="destructive"
          className="mt-3"
          onClick={() => {
            setDeleteError(null);
            setConfirming(true);
          }}
        >
          Remove stop
        </Button>
      </Card>

      <Sheet
        open={confirming}
        onClose={() => {
          if (!deleting) setConfirming(false);
        }}
        title="Remove this stop?"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setConfirming(false)} disabled={deleting}>
              Keep it
            </Button>
            <Button variant="destructive" onClick={() => void remove()} disabled={deleting}>
              {deleting ? "Removing…" : "Remove stop"}
            </Button>
          </div>
        }
      >
        <p className="text-sm font-semibold text-[var(--anchor-deep)]">
          {stop.city} · {stop.event} · {formatDay(stop.date)}
        </p>
        <p className="mt-2 text-sm text-[var(--anchor-deep)]">
          {REMOVE_WARNING[stop.status]} This can&rsquo;t be undone.
        </p>
        {deleteError && <Alert tone="error" className="mt-3">{deleteError}</Alert>}
      </Sheet>
    </div>
  );
}
