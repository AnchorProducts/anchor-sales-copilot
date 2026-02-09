"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";

type FormState = {
  customer_company: string;
  details: string;
  city: string;
  state: string;
  zip: string;
  wants_video_call: boolean;
  preferred_times: string;
  video_call_phone: string;
};

function clean(v: string) {
  return v.trim();
}

export default function LeadForm() {
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);

  const [form, setForm] = useState<FormState>({
    customer_company: "",
    details: "",
    city: "",
    state: "",
    zip: "",
    wants_video_call: false,
    preferred_times: "",
    video_call_phone: "",
  });

  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function validate() {
    if (!clean(form.customer_company)) return "Customer company is required.";
    if (!clean(form.details)) return "Lead details are required.";
    if (!clean(form.city) || !clean(form.state) || !clean(form.zip)) {
      return "City, state, and zip are required.";
    }
    if (files.length === 0) return "Please upload at least one photo.";
    if (form.wants_video_call && !clean(form.preferred_times)) {
      return "Please add preferred meeting times.";
    }
    if (form.wants_video_call && !clean(form.video_call_phone)) {
      return "Please add a phone number for the video call request.";
    }
    return null;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    const msg = validate();
    if (msg) {
      setError(msg);
      return;
    }

    setSubmitting(true);

    try {
      const { data } = await supabase.auth.getUser();
      if (!data.user) {
        router.replace("/");
        return;
      }

      const fd = new FormData();
      fd.append("customer_company", form.customer_company);
      fd.append("details", form.details);
      fd.append("city", form.city);
      fd.append("state", form.state);
      fd.append("zip", form.zip);
      fd.append("wants_video_call", String(form.wants_video_call));
      fd.append("preferred_times", form.preferred_times);
      fd.append("video_call_phone", form.video_call_phone);

      for (const file of files) fd.append("photos", file);

      const res = await fetch("/api/leads", {
        method: "POST",
        body: fd,
      });

      const text = await res.text();
      const json = text ? JSON.parse(text) : {};

      if (!res.ok) {
        setError(json?.error || "Failed to submit lead.");
        setSubmitting(false);
        return;
      }

      setSuccess("Lead submitted. Thanks!");
      setForm({
        customer_company: "",
        details: "",
        city: "",
        state: "",
        zip: "",
        wants_video_call: false,
        preferred_times: "",
        video_call_phone: "",
      });
      setFiles([]);
      setSubmitting(false);
    } catch (e: any) {
      setError(e?.message || "Failed to submit lead.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="rounded-3xl border border-black/10 bg-white p-5 shadow-sm">
      <div className="text-sm font-semibold text-black">Submit a Job Lead</div>
      <div className="mt-1 text-sm text-[#76777B]">Provide as much detail as possible.</div>

      <div className="mt-4 grid gap-3">
        <label className="grid gap-1 text-sm">
          <span className="font-semibold">Customer Company Name *</span>
          <input
            value={form.customer_company}
            onChange={(e) => update("customer_company", e.target.value)}
            className="h-10 rounded-xl border border-black/10 bg-white px-3 text-sm outline-none focus:border-[#047835]"
            placeholder="Company name"
          />
        </label>

        <label className="grid gap-1 text-sm">
          <span className="font-semibold">Lead Details / Job Description *</span>
          <textarea
            value={form.details}
            onChange={(e) => update("details", e.target.value)}
            className="min-h-[120px] rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-[#047835]"
            placeholder="Describe the job, scope, and timeline..."
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="grid gap-1 text-sm">
            <span className="font-semibold">City *</span>
            <input
              value={form.city}
              onChange={(e) => update("city", e.target.value)}
              className="h-10 rounded-xl border border-black/10 bg-white px-3 text-sm outline-none focus:border-[#047835]"
              placeholder="City"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-semibold">State *</span>
            <input
              value={form.state}
              onChange={(e) => update("state", e.target.value)}
              className="h-10 rounded-xl border border-black/10 bg-white px-3 text-sm outline-none focus:border-[#047835]"
              placeholder="State"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-semibold">Zip *</span>
            <input
              value={form.zip}
              onChange={(e) => update("zip", e.target.value)}
              className="h-10 rounded-xl border border-black/10 bg-white px-3 text-sm outline-none focus:border-[#047835]"
              placeholder="Zip"
            />
          </label>
        </div>

        <label className="grid gap-1 text-sm">
          <span className="font-semibold">Photos *</span>
          <input
            type="file"
            multiple
            accept="image/*"
            onChange={(e) => setFiles(Array.from(e.target.files || []))}
            className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
          />
          {files.length > 0 && (
            <div className="text-[12px] text-black/60">{files.length} file(s) selected</div>
          )}
        </label>

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={form.wants_video_call}
            onChange={(e) => update("wants_video_call", e.target.checked)}
          />
          <span className="font-semibold">Request a Video Call</span>
        </label>

        {form.wants_video_call && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm">
              <span className="font-semibold">Preferred Meeting Times *</span>
              <textarea
                value={form.preferred_times}
                onChange={(e) => update("preferred_times", e.target.value)}
                className="min-h-[80px] rounded-xl border border-black/10 bg-white px-3 py-2 text-sm outline-none focus:border-[#047835]"
                placeholder="List a few options, one per line"
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-semibold">Phone Number (for Teams/FaceTime) *</span>
              <input
                value={form.video_call_phone}
                onChange={(e) => update("video_call_phone", e.target.value)}
                className="h-10 rounded-xl border border-black/10 bg-white px-3 text-sm outline-none focus:border-[#047835]"
                placeholder="(555) 555-5555"
              />
            </label>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="mt-4 rounded-2xl border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          {success}
        </div>
      )}

      <div className="mt-4 flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center justify-center rounded-xl bg-[#047835] px-4 py-2 text-[12px] font-semibold text-white disabled:opacity-60"
        >
          {submitting ? "Submitting…" : "Submit lead"}
        </button>
      </div>
    </form>
  );
}
