"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Button from "@/app/components/ui/Button";
import { Card } from "@/app/components/ui/Card";
import { Alert } from "@/app/components/ui/Alert";
import { Input, Textarea } from "@/app/components/ui/Field";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { trackEvent } from "@/lib/analytics/track";

/* ============================================================================
 * File a mobile-showcase stop.
 *
 * Built for one person on a phone, often on a bad connection in a contractor's
 * yard. Two decisions follow from that:
 *
 *  1. The photo uploads the moment it is chosen, not on submit. The upload is
 *     the slow part; doing it up front means the submit is a small JSON POST.
 *  2. A failed submit KEEPS the uploaded path. Retrying re-sends the form, not
 *     the photograph.
 * ==========================================================================*/

const ALLOWED_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "heic", "heif"];
const MAX_NOTE = 1000;

type SubmissionStatus = "pending" | "published" | "declined";

type Submission = {
  id: string;
  date: string;
  city: string;
  event: string;
  note: string | null;
  status: SubmissionStatus;
  reviewNote: string | null;
  submittedAt: string;
};

type PhotoState =
  | { kind: "none" }
  | { kind: "uploading"; name: string; previewUrl: string }
  | { kind: "ready"; name: string; previewUrl: string; path: string }
  | { kind: "error"; name: string; previewUrl: string; message: string };

/** Today in the viewer's own timezone as yyyy-mm-dd — most stops are filed the
 *  day they happen, and a UTC-derived default is the wrong day all evening. */
function today(): string {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot === -1 ? "" : filename.slice(dot + 1).toLowerCase();
}

export default function ShowcaseSubmitForm() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [date, setDate] = useState(today);
  const [city, setCity] = useState("");
  const [event, setEvent] = useState("");
  const [note, setNote] = useState("");
  const [photo, setPhoto] = useState<PhotoState>({ kind: "none" });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [listError, setListError] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(true);

  // Revoke the latest preview URL on unmount without re-running the effect on
  // every photo change.
  const photoRef = useRef<PhotoState>(photo);
  useEffect(() => { photoRef.current = photo; }, [photo]);
  useEffect(() => {
    return () => {
      const p = photoRef.current;
      if (p.kind !== "none") URL.revokeObjectURL(p.previewUrl);
    };
  }, []);

  /** The caller's own Supabase token — the whole of the integration. */
  const authHeader = useCallback(async (): Promise<Record<string, string>> => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("Your session expired. Sign in again.");
    return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  }, [supabase]);

  const loadSubmissions = useCallback(async () => {
    setListError(null);
    try {
      const res = await fetch("/api/showcase/submit", {
        method: "GET",
        headers: await authHeader(),
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setListError(
          res.status === 401
            ? "Your anchorp.com account isn't authorized for the showcase yet — ask marketing to add you to Portal Access."
            : json?.error || "Couldn't load what you've filed."
        );
        setSubmissions([]);
        return;
      }
      setSubmissions(Array.isArray(json?.submissions) ? json.submissions : []);
    } catch (e) {
      setListError(e instanceof Error ? e.message : "Couldn't load what you've filed.");
    } finally {
      setListLoading(false);
    }
  }, [authHeader]);

  useEffect(() => { void loadSubmissions(); }, [loadSubmissions]);

  /* ── Photo: upload on choose, not on submit ──────────────────────────── */
  async function handleFile(file: File | null) {
    if (!file) return;

    const ext = extensionOf(file.name);
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      setError(`That file type isn't supported. Use ${ALLOWED_EXTENSIONS.join(", ")}.`);
      return;
    }

    setError(null);
    if (photo.kind !== "none") URL.revokeObjectURL(photo.previewUrl);
    const previewUrl = URL.createObjectURL(file);
    setPhoto({ kind: "uploading", name: file.name, previewUrl });

    try {
      const res = await fetch("/api/showcase/upload-url", {
        method: "POST",
        headers: await authHeader(),
        body: JSON.stringify({ filename: file.name }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          res.status === 401
            ? "Your anchorp.com account isn't authorized for the showcase yet — ask marketing to add you to Portal Access."
            : json?.error || "Couldn't get an upload link."
        );
      }

      // Straight to Supabase Storage. A phone photo is over Vercel's request
      // body limit, so this must not go back through our API.
      const { error: upErr } = await supabase.storage
        .from(String(json.bucket))
        .uploadToSignedUrl(String(json.path), String(json.token), file, {
          contentType: file.type || "application/octet-stream",
        });
      if (upErr) throw new Error(upErr.message);

      setPhoto({ kind: "ready", name: file.name, previewUrl, path: String(json.path) });
    } catch (e) {
      setPhoto({
        kind: "error",
        name: file.name,
        previewUrl,
        message: e instanceof Error ? e.message : "Upload failed.",
      });
    }
  }

  function clearPhoto() {
    if (photo.kind !== "none") URL.revokeObjectURL(photo.previewUrl);
    setPhoto({ kind: "none" });
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  /* ── Submit ──────────────────────────────────────────────────────────── */
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!date) return setError("A date is required.");
    if (!city.trim()) return setError("A city is required.");
    if (!event.trim()) return setError("An event is required.");
    if (note.length > MAX_NOTE) return setError(`Keep the note under ${MAX_NOTE} characters.`);
    if (photo.kind === "uploading") return setError("The photo is still uploading — give it a moment.");
    if (photo.kind === "error") {
      return setError("The photo didn't upload. Remove it or try it again before filing.");
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/showcase/submit", {
        method: "POST",
        headers: await authHeader(),
        body: JSON.stringify({
          date,
          city: city.trim(),
          event: event.trim(),
          note: note.trim(),
          photoPath: photo.kind === "ready" ? photo.path : "",
        }),
      });
      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        // The uploaded photo is deliberately left in place: retrying re-sends
        // the form, not the photograph.
        setError(
          res.status === 401
            ? "Your anchorp.com account isn't authorized for the showcase yet — ask marketing to add you to Portal Access."
            : json?.error || "Couldn't file that stop. Try again."
        );
        setSubmitting(false);
        return;
      }

      trackEvent("showcase_stop_submitted", { stopId: json?.id ?? null });
      setSuccess("Filed. Marketing will review it before it appears on the site.");
      setDate(today());
      setCity("");
      setEvent("");
      setNote("");
      clearPhoto();
      void loadSubmissions();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't file that stop. Try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid gap-4">
      <form onSubmit={submit}>
        <Card className="border-t-4 border-t-[var(--anchor-green)] p-4 sm:p-5">
          <div className="text-sm font-semibold text-black">Where did the truck stop?</div>
          <div className="mt-1 text-sm text-[var(--anchor-gray)]">
            Marketing reviews every stop before it shows up on anchorp.com.
          </div>

          <div className="mt-5 grid gap-4">
            <label className="grid gap-1.5 text-sm">
              <span className="font-semibold">Date</span>
              <Input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </label>

            <label className="grid gap-1.5 text-sm">
              <span className="font-semibold">City</span>
              <Input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Wichita, KS"
                required
              />
            </label>

            <label className="grid gap-1.5 text-sm">
              <span className="font-semibold">Event</span>
              <Input
                value={event}
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

            {/* ── Photo ─────────────────────────────────────────────────── */}
            <div className="grid gap-2 text-sm">
              <span className="font-semibold">
                Photo <span className="font-normal text-[var(--anchor-gray)]">(optional, one)</span>
              </span>

              {photo.kind === "none" ? (
                <>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => void handleFile(e.target.files?.[0] ?? null)}
                  />
                  <Button
                    variant="secondary"
                    onClick={() => fileInputRef.current?.click()}
                    className="justify-self-start"
                  >
                    Add a photo
                  </Button>
                  <span className="text-xs text-[var(--anchor-gray)]">
                    It uploads right away, so filing the stop stays quick on a slow connection.
                  </span>
                </>
              ) : (
                <PhotoPreview photo={photo} onRemove={clearPhoto} onRetry={() => fileInputRef.current?.click()} />
              )}
            </div>

            {error && <Alert tone="error">{error}</Alert>}
            {success && <Alert tone="success">{success}</Alert>}

            <div>
              <Button type="submit" disabled={submitting || photo.kind === "uploading"}>
                {submitting ? "Filing…" : "File this stop"}
              </Button>
            </div>
          </div>
        </Card>
      </form>

      <FiledList loading={listLoading} error={listError} submissions={submissions} />
    </div>
  );
}

/* ── Photo preview ──────────────────────────────────────────────────────────
 * HEIC is the default on an iPhone and most browsers won't render it in an
 * <img>. A broken image icon reads as "the upload failed", so a preview that
 * won't load falls back to a filename chip instead. */
function PhotoPreview({
  photo,
  onRemove,
  onRetry,
}: {
  photo: Exclude<PhotoState, { kind: "none" }>;
  onRemove: () => void;
  onRetry: () => void;
}) {
  const [previewFailed, setPreviewFailed] = useState(false);

  return (
    <div className="flex items-start gap-3 rounded-xl border border-black/10 p-3">
      <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-[var(--surface-strong)]">
        {previewFailed ? (
          <span className="px-1 text-center text-[10px] font-semibold text-[var(--anchor-gray)]">
            IMG
          </span>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photo.previewUrl}
            alt={photo.name}
            className="h-full w-full object-cover"
            onError={() => setPreviewFailed(true)}
          />
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-[var(--anchor-deep)]">{photo.name}</div>
        <div className="mt-0.5 text-xs">
          {photo.kind === "uploading" && (
            <span className="text-[var(--anchor-gray)]">Uploading…</span>
          )}
          {photo.kind === "ready" && <span className="text-[var(--anchor-green)]">Uploaded</span>}
          {photo.kind === "error" && <span className="text-red-700">{photo.message}</span>}
        </div>

        <div className="mt-2 flex gap-2">
          {photo.kind === "error" && (
            <Button variant="secondary" className="!px-3 !py-1 text-xs" onClick={onRetry}>
              Choose again
            </Button>
          )}
          {photo.kind !== "uploading" && (
            <Button variant="ghost" className="!px-3 !py-1 text-xs" onClick={onRemove}>
              Remove
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── What I've filed ───────────────────────────────────────────────────────
 * A decline with a reason is useless if nobody ever sees the reason, so the
 * review note is shown in full rather than behind a tap. */
function FiledList({
  loading,
  error,
  submissions,
}: {
  loading: boolean;
  error: string | null;
  submissions: Submission[];
}) {
  return (
    <Card className="p-4 sm:p-5">
      <div className="text-sm font-semibold text-black">What you&rsquo;ve filed</div>

      {loading ? (
        <div className="mt-3 text-sm text-[var(--anchor-gray)]">Loading…</div>
      ) : error ? (
        <Alert tone="error" className="mt-3">{error}</Alert>
      ) : submissions.length === 0 ? (
        <div className="mt-3 text-sm text-[var(--anchor-gray)]">
          Nothing yet. Stops you file show up here with their status.
        </div>
      ) : (
        <ul className="mt-3 grid gap-2">
          {submissions.map((s) => (
            <li key={s.id} className="rounded-xl border border-black/10 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold text-[var(--anchor-deep)]">{s.city}</span>
                <StatusPill status={s.status} />
              </div>
              <div className="mt-0.5 text-sm text-[var(--anchor-gray)]">
                {s.event} · {s.date}
              </div>
              {s.note && <div className="mt-1 text-sm text-[var(--anchor-gray)]">{s.note}</div>}
              {s.status === "declined" && s.reviewNote && (
                <div className="mt-2 rounded-lg bg-[var(--surface-strong)] p-2 text-sm text-[var(--anchor-deep)]">
                  <span className="font-semibold">Why: </span>
                  {s.reviewNote}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function StatusPill({ status }: { status: SubmissionStatus }) {
  const style =
    status === "published"
      ? "bg-[#e6f4ea] text-[#1e6b3a]"
      : status === "declined"
        ? "bg-[#fdecea] text-[#8a2c22]"
        : "bg-[#fdf3e2] text-[#8a6d3b]";
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${style}`}>
      {status}
    </span>
  );
}
