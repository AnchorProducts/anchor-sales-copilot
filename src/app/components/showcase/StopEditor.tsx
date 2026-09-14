"use client";

import { useMemo, useState } from "react";
import Button from "@/app/components/ui/Button";
import { Card } from "@/app/components/ui/Card";
import { Alert } from "@/app/components/ui/Alert";
import { Input, Textarea } from "@/app/components/ui/Field";
import Sheet from "@/app/components/ui/Sheet";
import { PhotoTray, usePhotoUploads } from "@/app/components/showcase/PhotoTray";
import { Badge, PhotoTile, ReviewNote, StatusBadge } from "@/app/components/showcase/ShowcaseBadges";
import { supabaseBrowser } from "@/lib/supabase/browser";
import {
  MAX_NOTE,
  MAX_TEXT,
  formatDay,
  showcaseFetch,
  type ScheduleStop,
  type StopPhoto,
  type StopStatus,
} from "@/lib/showcase/client";

/* ============================================================================
 * One stop, everything about it — keepers only.
 *
 * Editable: date, city, event, note; photos added (always reviewed) and photos
 * removed while they aren't live. Status, "requested" and live photos are shown
 * but never become inputs — the website ignores them and a database trigger
 * puts them back regardless.
 *
 * An edit to a published stop's details is on the public page the moment it
 * saves — no re-review — so the screen says so above the button.
 *
 * Save does both halves: the details, then any new photos. New photos sit in
 * the tray until then, so leaving with Cancel is the only way to lose them.
 * ==========================================================================*/

export type Flash = { tone: "success" | "error"; text: string };

const REMOVE_STOP_WARNING: Record<StopStatus, string> = {
  published: "This stop is live on the website. Removing it takes it and its photos off the site.",
  pending: "Marketing hasn't reviewed this stop yet. Removing it takes it out of their queue.",
  declined: "This stop was declined and isn't on the site. Removing it deletes it for good.",
};

export default function StopEditor({
  stop,
  onBack,
  onDone,
  onChanged,
}: {
  stop: ScheduleStop;
  onBack: () => void;
  onDone: (result: Flash) => void;
  /** Reload the schedule and stay on this stop. */
  onChanged: () => Promise<void>;
}) {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const uploads = usePhotoUploads();

  const [date, setDate] = useState(stop.date);
  const [city, setCity] = useState(stop.city);
  const [event, setEvent] = useState(stop.event);
  const [note, setNote] = useState(stop.note ?? "");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [removingPhoto, setRemovingPhoto] = useState<StopPhoto | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const live = stop.status === "published";

  // Only what changed is sent. On a live stop every field that goes up is a
  // live edit, so an untouched one shouldn't ride along.
  const changes = useMemo(() => {
    const c: Record<string, string> = {};
    if (date !== stop.date) c.date = date;
    if (city.trim() !== stop.city) c.city = city.trim();
    if (event.trim() !== stop.event) c.event = event.trim();
    if (note.trim() !== (stop.note ?? "")) c.note = note.trim();
    return c;
  }, [date, city, event, note, stop]);

  const detailsDirty = Object.keys(changes).length > 0;
  const newPhotos = uploads.paths.length;
  const dirty = detailsDirty || newPhotos > 0;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!date) return setError("A date is required.");
    if (!city.trim()) return setError("A city is required.");
    if (!event.trim()) return setError("An event is required.");
    if (uploads.busy) return setError("Photos are still uploading — give them a moment.");
    if (uploads.failed) {
      return setError("Some photos didn't upload. Try them again or remove them before saving.");
    }
    if (!dirty) return onBack();

    setSaving(true);

    if (detailsDirty) {
      const result = await showcaseFetch(supabase, "/api/showcase/stops", {
        method: "PATCH",
        body: { id: stop.id, ...changes },
      });
      if (!result.ok) {
        setSaving(false);
        if (result.status === 404) {
          return onDone({ tone: "error", text: "That stop was removed while you were editing it." });
        }
        return setError(result.error); // everything typed and uploaded stays put
      }
    }

    if (newPhotos) {
      const result = await showcaseFetch(supabase, "/api/showcase/photos", {
        method: "POST",
        body: { stopId: stop.id, photoPaths: uploads.paths },
      });
      if (!result.ok) {
        setSaving(false);
        if (result.status === 404) {
          return onDone({ tone: "error", text: "That stop was removed while you were editing it." });
        }
        // The details may already be saved; reloading makes Save send only
        // what's left, which is the photos.
        if (detailsDirty) await onChanged();
        return setError(
          detailsDirty
            ? `Your changes were saved, but the photos didn't send: ${result.error} Tap Save to try the photos again.`
            : result.error
        );
      }
    }

    setSaving(false);
    uploads.clear();

    const parts = ["Saved."];
    if (detailsDirty && live) parts.push("The website shows the change now.");
    if (newPhotos) {
      parts.push(`${newPhotos} photo${newPhotos === 1 ? "" : "s"} sent to marketing for review.`);
    }
    onDone({ tone: "success", text: parts.join(" ") });
  }

  async function removePhoto() {
    if (!removingPhoto) return;
    setPhotoBusy(true);
    setPhotoError(null);
    const result = await showcaseFetch(supabase, "/api/showcase/photos", {
      method: "DELETE",
      body: { id: removingPhoto.id },
    });
    // 404 means it's already gone, which is what was asked for.
    if (!result.ok && result.status !== 404) {
      setPhotoBusy(false);
      setPhotoError(result.error);
      return;
    }
    await onChanged();
    setPhotoBusy(false);
    setRemovingPhoto(null);
  }

  async function removeStop() {
    setDeleting(true);
    setDeleteError(null);
    const result = await showcaseFetch(supabase, "/api/showcase/stops", {
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

  const declinedWithReason = stop.photos.filter((p) => p.status === "declined" && p.reviewNote);

  return (
    <div className="grid gap-4">
      <div>
        <Button variant="ghost" className="!px-2" onClick={onBack} disabled={saving}>
          ← Back to showcase
        </Button>
      </div>

      <form onSubmit={save} className="grid gap-4">
        <Card className="border-t-4 border-t-[var(--anchor-green)] p-4 sm:p-5">
          <h2 className="text-lg font-semibold text-black">{stop.city}</h2>
          <div className="text-sm text-[var(--anchor-gray)]">
            {stop.event} · {formatDay(stop.date)}
          </div>

          {/* Read-only: these are marketing's, set on the website. */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
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
          </div>
        </Card>

        <Card className="p-4 sm:p-5">
          <h2 className="text-sm font-semibold text-black">
            Photos <span className="font-normal text-[var(--anchor-gray)]">{stop.photos.length}</span>
          </h2>
          <p className="mt-1 text-xs text-[var(--anchor-gray)]">
            Photos you add wait for marketing&rsquo;s review. Live photos can only be changed by
            marketing.
          </p>

          {stop.photos.length > 0 ? (
            <ul className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
              {stop.photos.map((photo) => (
                <li key={photo.id} className="grid content-start gap-1">
                  <PhotoTile photo={photo} />
                  {photo.status !== "published" && (
                    <button
                      type="button"
                      onClick={() => {
                        setPhotoError(null);
                        setRemovingPhoto(photo);
                      }}
                      className="justify-self-start text-xs font-semibold text-red-700"
                    >
                      Remove
                    </button>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-[var(--anchor-gray)]">No photos on this stop yet.</p>
          )}
          {declinedWithReason.map((p) => (
            <ReviewNote key={p.id} label="Photo declined" note={p.reviewNote ?? ""} />
          ))}

          <div className="mt-4">
            <PhotoTray uploads={uploads} label="Add photos" />
          </div>
        </Card>

        <Card className="p-4 sm:p-5">
          <div className="grid gap-3">
            {live && (
              <Alert tone="neutral">
                This stop is live. Changes to its details show on the website immediately. New photos
                wait for marketing.
              </Alert>
            )}
            {error && <Alert tone="error">{error}</Alert>}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={!dirty || saving || uploads.busy}>
                {saving
                  ? "Saving…"
                  : newPhotos && !detailsDirty
                    ? `Send ${newPhotos} photo${newPhotos === 1 ? "" : "s"} for review`
                    : "Save changes"}
              </Button>
              <Button variant="secondary" onClick={onBack} disabled={saving}>
                Cancel
              </Button>
            </div>
          </div>
        </Card>
      </form>

      <Card className="p-4 sm:p-5">
        <h2 className="text-sm font-semibold text-black">Remove this stop</h2>
        <p className="mt-1 text-sm text-[var(--anchor-gray)]">
          {live ? "Takes it and its photos off the website." : "Deletes it from the schedule."} This
          can&rsquo;t be undone.
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
        open={removingPhoto !== null}
        onClose={() => {
          if (!photoBusy) setRemovingPhoto(null);
        }}
        title="Remove this photo?"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setRemovingPhoto(null)} disabled={photoBusy}>
              Keep it
            </Button>
            <Button variant="destructive" onClick={() => void removePhoto()} disabled={photoBusy}>
              {photoBusy ? "Removing…" : "Remove photo"}
            </Button>
          </div>
        }
      >
        {removingPhoto && (
          <div className="grid grid-cols-[5rem_1fr] items-start gap-3">
            <PhotoTile photo={removingPhoto} />
            <p className="text-sm text-[var(--anchor-deep)]">
              {removingPhoto.status === "declined"
                ? "Marketing declined this photo. Removing it deletes it for good."
                : "It's waiting for marketing's review. Removing it takes it out of their queue."}{" "}
              This can&rsquo;t be undone.
            </p>
          </div>
        )}
        {photoError && <Alert tone="error" className="mt-3">{photoError}</Alert>}
      </Sheet>

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
            <Button variant="destructive" onClick={() => void removeStop()} disabled={deleting}>
              {deleting ? "Removing…" : "Remove stop"}
            </Button>
          </div>
        }
      >
        <p className="text-sm font-semibold text-[var(--anchor-deep)]">
          {stop.city} · {stop.event} · {formatDay(stop.date)}
        </p>
        <p className="mt-2 text-sm text-[var(--anchor-deep)]">
          {REMOVE_STOP_WARNING[stop.status]} This can&rsquo;t be undone.
        </p>
        {deleteError && <Alert tone="error" className="mt-3">{deleteError}</Alert>}
      </Sheet>
    </div>
  );
}
