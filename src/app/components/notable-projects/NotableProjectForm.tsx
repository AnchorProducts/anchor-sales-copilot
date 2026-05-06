"use client";

import { useEffect, useRef, useState } from "react";
import Button from "@/app/components/ui/Button";
import { Card } from "@/app/components/ui/Card";
import { Alert } from "@/app/components/ui/Alert";
import { Input, Textarea } from "@/app/components/ui/Field";
import { useTranslation } from "@/lib/i18n/useTranslation";

type Photo = { id: string; file: File; previewUrl: string };

let photoSeq = 0;

export default function NotableProjectForm() {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [description, setDescription] = useState("");
  const [contact, setContact] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    return () => {
      photos.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleFiles(filesList: FileList | null) {
    if (!filesList || filesList.length === 0) return;
    const next: Photo[] = [];
    for (const file of Array.from(filesList)) {
      if (!file.type.startsWith("image/")) continue;
      next.push({
        id: `p${++photoSeq}`,
        file,
        previewUrl: URL.createObjectURL(file),
      });
    }
    if (next.length > 0) setPhotos((prev) => [...prev, ...next]);
  }

  function removePhoto(id: string) {
    setPhotos((prev) => {
      const target = prev.find((p) => p.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((p) => p.id !== id);
    });
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!name.trim()) return setError("Project name is required.");
    if (!location.trim()) return setError("Location is required.");
    if (!description.trim()) return setError("Description is required.");

    setSubmitting(true);
    try {
      const fd = new FormData();
      fd.append("name", name.trim());
      fd.append("location", location.trim());
      fd.append("description", description.trim());
      fd.append("contact", contact.trim());
      photos.forEach((p) => fd.append("photos", p.file, p.file.name));

      const res = await fetch("/api/notable-projects", { method: "POST", body: fd });
      const text = await res.text();
      const json = text ? JSON.parse(text) : {};

      if (!res.ok) {
        setError(json?.error || t("failedSubmitNotableProject"));
        setSubmitting(false);
        return;
      }

      setSuccess(t("notableProjectSubmitted"));
      photos.forEach((p) => URL.revokeObjectURL(p.previewUrl));
      setPhotos([]);
      setName("");
      setLocation("");
      setDescription("");
      setContact("");
      setSubmitting(false);
    } catch (e: any) {
      setError(e?.message || t("failedSubmitNotableProject"));
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <Card className="border-t-4 border-t-[var(--anchor-green)] p-4 sm:p-5">
        <div className="text-sm font-semibold text-black">{t("notableProjectTitle")}</div>
        <div className="mt-1 text-sm text-[var(--anchor-gray)]">{t("notableProjectFormDesc")}</div>

        <div className="mt-5 grid gap-4">
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-black">{t("projectName")}</span>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Northgate Plaza Roof Retrofit" />
          </label>

          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-black">{t("projectLocation")}</span>
            <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="City, state" />
          </label>

          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-black">{t("projectDescriptionLabel")}</span>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Scope, products used, anything notable about the install..."
              rows={5}
            />
          </label>

          <label className="grid gap-1.5 text-sm">
            <span className="font-medium text-black">{t("projectContact")}</span>
            <Input
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder={t("projectContactPlaceholder")}
            />
          </label>

          <div className="grid gap-2">
            <span className="text-sm font-medium text-black">Photos</span>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              className="hidden"
              onChange={(e) => {
                handleFiles(e.target.files);
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
            />

            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex h-12 items-center justify-center gap-2 rounded-[14px] border-2 border-dashed border-[var(--anchor-green)] bg-[var(--surface-soft)] text-sm font-semibold text-[var(--anchor-green)] transition hover:bg-white"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
              {photos.length === 0 ? t("takePhotos") : t("addMorePhotos")}
            </button>

            {photos.length > 0 && (
              <>
                <div className="text-xs text-[var(--anchor-gray)]">
                  {photos.length} {t("photosCount")}
                </div>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {photos.map((p) => (
                    <div key={p.id} className="group relative aspect-square overflow-hidden rounded-[10px] border border-black/10">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={p.previewUrl} alt="" className="h-full w-full object-cover" />
                      <button
                        type="button"
                        onClick={() => removePhoto(p.id)}
                        aria-label={t("removePhoto")}
                        className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-black/65 text-xs font-bold text-white"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {error && <Alert tone="error">{error}</Alert>}
          {success && <Alert tone="success">{success}</Alert>}

          <div className="mt-2 flex justify-end">
            <Button type="submit" disabled={submitting}>
              {submitting ? t("submitting") : t("submitNotableProject")}
            </Button>
          </div>
        </div>
      </Card>
    </form>
  );
}
