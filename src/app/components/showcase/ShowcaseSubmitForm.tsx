"use client";

import { useMemo, useState } from "react";
import Button from "@/app/components/ui/Button";
import { Card } from "@/app/components/ui/Card";
import { Alert } from "@/app/components/ui/Alert";
import { Input, Textarea } from "@/app/components/ui/Field";
import { PhotoPicker, usePhotoUpload } from "@/app/components/showcase/PhotoPicker";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { trackEvent } from "@/lib/analytics/track";
import { MAX_NOTE, MAX_TEXT, showcaseFetch, today } from "@/lib/showcase/client";

/* ============================================================================
 * File a mobile-showcase stop.
 *
 * Built for one person on a phone, often on a bad connection in a contractor's
 * yard. Two decisions follow from that:
 *
 *  1. The photo uploads the moment it is chosen, not on submit (PhotoPicker).
 *     The upload is the slow part; doing it up front means the submit is a
 *     small JSON POST.
 *  2. A failed submit KEEPS the form and the uploaded path. Retrying re-sends
 *     the form, not the photograph.
 *
 * Everything filed here is pending until marketing reviews it on anchorp.com —
 * keepers included. There is no other way onto the schedule.
 * ==========================================================================*/

export default function ShowcaseSubmitForm({ onFiled }: { onFiled: () => void }) {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const { photo, pick, retry, clear } = usePhotoUpload();

  const [date, setDate] = useState(today);
  const [city, setCity] = useState("");
  const [event, setEvent] = useState("");
  const [note, setNote] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!date) return setError("A date is required.");
    if (!city.trim()) return setError("A city is required.");
    if (!event.trim()) return setError("An event is required.");
    if (note.length > MAX_NOTE) return setError(`Keep the note under ${MAX_NOTE} characters.`);
    if (photo.kind === "uploading") return setError("The photo is still uploading — give it a moment.");
    if (photo.kind === "error") {
      return setError("The photo didn't upload. Try it again or remove it before filing.");
    }

    setSubmitting(true);
    const result = await showcaseFetch<{ id?: string }>(supabase, "/api/showcase/submit", {
      method: "POST",
      body: {
        date,
        city: city.trim(),
        event: event.trim(),
        note: note.trim(),
        photoPath: photo.kind === "ready" ? photo.path : "",
      },
    });
    setSubmitting(false);

    if (!result.ok) {
      // The form and the uploaded photo are deliberately left in place.
      setError(result.error);
      return;
    }

    trackEvent("showcase_stop_submitted", { stopId: result.data.id ?? null });
    setDate(today());
    setCity("");
    setEvent("");
    setNote("");
    clear();
    onFiled();
  }

  return (
    <form onSubmit={submit}>
      <Card className="border-t-4 border-t-[var(--anchor-green)] p-4 sm:p-5">
        <div className="text-sm font-semibold text-black">Where did the truck stop?</div>
        <div className="mt-1 text-sm text-[var(--anchor-gray)]">
          Marketing reviews every stop before it shows up on anchorp.com.
        </div>

        <div className="mt-5 grid gap-4">
          <label className="grid gap-1.5 text-sm">
            <span className="font-semibold">Date</span>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
          </label>

          <label className="grid gap-1.5 text-sm">
            <span className="font-semibold">City</span>
            <Input
              value={city}
              maxLength={MAX_TEXT}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Wichita, KS"
              required
            />
          </label>

          <label className="grid gap-1.5 text-sm">
            <span className="font-semibold">Event</span>
            <Input
              value={event}
              maxLength={MAX_TEXT}
              onChange={(e) => setEvent(e.target.value)}
              placeholder="Contractor yard visit"
              required
            />
          </label>

          <label className="grid gap-1.5 text-sm">
            <span className="font-semibold">
              Note <span className="font-normal text-[var(--anchor-gray)]">(optional)</span>
            </span>
            <Textarea
              rows={3}
              value={note}
              maxLength={MAX_NOTE}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ten crews came through."
            />
          </label>

          <div className="grid gap-2 text-sm">
            <span className="font-semibold">
              Photo <span className="font-normal text-[var(--anchor-gray)]">(optional, one)</span>
            </span>
            <PhotoPicker
              photo={photo}
              onPick={pick}
              onRetry={retry}
              onRemove={clear}
              hint="It uploads right away, so filing the stop stays quick on a slow connection."
            />
          </div>

          {error && <Alert tone="error">{error}</Alert>}

          <div>
            <Button type="submit" disabled={submitting || photo.kind === "uploading"}>
              {submitting ? "Filing…" : "File this stop"}
            </Button>
          </div>
        </div>
      </Card>
    </form>
  );
}
