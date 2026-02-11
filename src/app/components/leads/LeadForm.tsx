"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import Button from "@/app/components/ui/Button";
import { Card } from "@/app/components/ui/Card";
import { Alert } from "@/app/components/ui/Alert";
import { Input, Select, Textarea } from "@/app/components/ui/Field";

type FormState = {
  customer_company: string;
  details: string;
  project_address: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  roof_type: string;
  roof_brand: string;
  needed_month: string;
  needed_year: string;
  meeting_request_type: "none" | "video_call" | "site_visit";
  preferred_times: string;
  video_call_phone: string;
};

type SolutionOption = { key: string; label: string };

type SolutionInput = {
  selected: boolean;
  comment: string;
  files: File[];
};

const ROOF_TYPES = ["KEE", "PVC", "TPO", "EDPM", "APP", "SBS", "SBS TORCH", "Coatings"];
const ROOF_BRANDS = ["Carlisle", "GAF", "IB"];
const COUNTRIES = [
  { value: "US", label: "United States" },
  { value: "CA", label: "Canada" },
  { value: "MX", label: "Mexico" },
];

const US_STATES = [
  "AL", "AK", "AZ", "AR", "CA", "CO", "CT", "DE", "FL", "GA", "HI", "ID", "IL", "IN", "IA", "KS", "KY", "LA", "ME", "MD", "MA", "MI", "MN", "MS", "MO", "MT", "NE", "NV", "NH", "NJ", "NM", "NY", "NC", "ND", "OH", "OK", "OR", "PA", "RI", "SC", "SD", "TN", "TX", "UT", "VT", "VA", "WA", "WV", "WI", "WY",
] as const;

const SOLUTION_OPTIONS: SolutionOption[] = [
  { key: "solar", label: "Solar / PV Racking" },
  { key: "snow-retention", label: "Snow Retention" },
  { key: "pipe-frame-attached", label: "Attached Pipe-Frame (Roof-Mounted H-Frame)" },
  { key: "duct-securement", label: "Duct Securement" },
  { key: "hvac-securement", label: "HVAC / RTU Securement" },
  { key: "elevated-stack-roof", label: "Elevated Stack (Roof-Mounted)" },
  { key: "elevated-stack-wall", label: "Elevated Stack (Wall / Parapet)" },
  { key: "roof-box", label: "Roof Box" },
  { key: "wall-box", label: "Wall / Parapet Box" },
  { key: "roof-pipe", label: "Roof Pipe Support" },
  { key: "roof-stairs-walkways", label: "Roof Stairs / Walkways" },
  { key: "roof-guardrail", label: "Roof Guardrail" },
  { key: "roof-ladder", label: "Roof Ladder" },
  { key: "equipment-screen", label: "Equipment Screen" },
  { key: "signage", label: "Signage" },
  { key: "weather-station", label: "Weather Station" },
  { key: "light-mount", label: "Light Mount" },
  { key: "camera-mount", label: "Camera Mount" },
  { key: "electrical-disconnect", label: "Electrical Disconnect" },
  { key: "guy-wire", label: "Guy Wire Securement" },
];

function clean(v: string) {
  return v.trim();
}

function buildInitialSolutions() {
  return Object.fromEntries(
    SOLUTION_OPTIONS.map((opt) => [opt.key, { selected: false, comment: "", files: [] as File[] }])
  ) as Record<string, SolutionInput>;
}

export default function LeadForm() {
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);

  const [form, setForm] = useState<FormState>({
    customer_company: "",
    details: "",
    project_address: "",
    city: "",
    state: "",
    zip: "",
    country: "US",
    roof_type: "",
    roof_brand: "",
    needed_month: "",
    needed_year: "",
    meeting_request_type: "none",
    preferred_times: "",
    video_call_phone: "",
  });

  const [solutions, setSolutions] = useState<Record<string, SolutionInput>>(buildInitialSolutions());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const years = useMemo(() => {
    const now = new Date().getFullYear();
    return Array.from({ length: 8 }, (_, i) => String(now + i));
  }, []);

  const selectedSolutions = useMemo(
    () => SOLUTION_OPTIONS.filter((opt) => solutions[opt.key]?.selected),
    [solutions]
  );

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function toggleSolution(solutionKey: string) {
    setSolutions((prev) => {
      const current = prev[solutionKey];
      if (!current) return prev;
      return {
        ...prev,
        [solutionKey]: {
          ...current,
          selected: !current.selected,
          comment: !current.selected ? current.comment : current.comment,
          files: !current.selected ? current.files : current.files,
        },
      };
    });
  }

  function updateSolutionComment(solutionKey: string, comment: string) {
    setSolutions((prev) => {
      const current = prev[solutionKey];
      if (!current) return prev;
      return { ...prev, [solutionKey]: { ...current, comment } };
    });
  }

  function addSolutionFiles(solutionKey: string, newFiles: File[]) {
    if (!newFiles.length) return;
    setSolutions((prev) => {
      const current = prev[solutionKey];
      if (!current) return prev;
      return {
        ...prev,
        [solutionKey]: {
          ...current,
          files: [...current.files, ...newFiles],
        },
      };
    });
  }

  function removeSolutionFile(solutionKey: string, fileIndex: number) {
    setSolutions((prev) => {
      const current = prev[solutionKey];
      if (!current) return prev;
      return {
        ...prev,
        [solutionKey]: {
          ...current,
          files: current.files.filter((_, idx) => idx !== fileIndex),
        },
      };
    });
  }

  function validate() {
    if (!clean(form.customer_company)) return "Customer company is required.";
    if (!clean(form.details)) return "Lead details are required.";
    if (!clean(form.project_address)) return "Project address is required.";
    if (!clean(form.city) || !clean(form.state) || !clean(form.zip) || !clean(form.country)) {
      return "Project city, state, zip, and country are required.";
    }
    if (!clean(form.roof_type)) return "Roof type is required.";
    if (!clean(form.roof_brand)) return "Brand is required.";
    if (!clean(form.needed_month) || !clean(form.needed_year)) {
      return "Needed around month and year are required.";
    }
    if (selectedSolutions.length === 0) {
      return "Select at least one solution type.";
    }

    for (const option of selectedSolutions) {
      const entry = solutions[option.key];
      if (!entry || entry.files.length === 0) {
        return `Add at least one photo or video for ${option.label}.`;
      }
    }

    if (form.meeting_request_type !== "none" && !clean(form.preferred_times)) {
      return "Please add preferred meeting/site visit times.";
    }
    if (form.meeting_request_type !== "none" && !clean(form.video_call_phone)) {
      return "Please add a contact phone number for scheduling.";
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
      fd.append("project_address", form.project_address);
      fd.append("city", form.city);
      fd.append("state", form.state);
      fd.append("zip", form.zip);
      fd.append("country", form.country);
      fd.append("roof_type", form.roof_type);
      fd.append("roof_brand", form.roof_brand);
      fd.append("needed_month", form.needed_month);
      fd.append("needed_year", form.needed_year);
      fd.append("meeting_request_type", form.meeting_request_type);
      fd.append("preferred_times", form.preferred_times);
      fd.append("video_call_phone", form.video_call_phone);

      let solutionIndex = 0;
      for (const option of selectedSolutions) {
        const entry = solutions[option.key];
        fd.append(`solution_${solutionIndex}_key`, option.key);
        fd.append(`solution_${solutionIndex}_label`, option.label);
        fd.append(`solution_${solutionIndex}_comment`, entry.comment);
        for (const file of entry.files) {
          fd.append(`solution_${solutionIndex}_files`, file);
        }
        solutionIndex += 1;
      }

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
        project_address: "",
        city: "",
        state: "",
        zip: "",
        country: "US",
        roof_type: "",
        roof_brand: "",
        needed_month: "",
        needed_year: "",
        meeting_request_type: "none",
        preferred_times: "",
        video_call_phone: "",
      });
      setSolutions(buildInitialSolutions());
      setSubmitting(false);
    } catch (e: any) {
      setError(e?.message || "Failed to submit lead.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <Card className="border-t-4 border-t-[var(--anchor-green)] p-5">
      <div className="text-sm font-semibold text-black">Submit a Job Lead</div>
      <div className="mt-1 text-sm text-[var(--anchor-gray)]">
        Select solution type(s), add photos/videos for each, and include scheduling availability.
      </div>

      <div className="mt-4 grid gap-3">
        <label className="grid gap-1 text-sm">
          <span className="font-semibold">Customer Company Name *</span>
          <Input
            value={form.customer_company}
            onChange={(e) => update("customer_company", e.target.value)}
            className="h-10 px-3 text-sm"
            placeholder="Company name"
          />
        </label>

        <label className="grid gap-1 text-sm">
          <span className="font-semibold">Lead Details / Job Description *</span>
          <Textarea
            value={form.details}
            onChange={(e) => update("details", e.target.value)}
            className="min-h-[120px] px-3 py-2 text-sm"
            placeholder="Describe the job, scope, and timeline..."
          />
        </label>

        <label className="grid gap-1 text-sm">
          <span className="font-semibold">Project Address *</span>
          <Input
            value={form.project_address}
            onChange={(e) => update("project_address", e.target.value)}
            className="h-10 px-3 text-sm"
            placeholder="Street address"
          />
        </label>

        <div className="grid gap-3 sm:grid-cols-4">
          <label className="grid gap-1 text-sm sm:col-span-2">
            <span className="font-semibold">City *</span>
            <Input
              value={form.city}
              onChange={(e) => update("city", e.target.value)}
              className="h-10 px-3 text-sm"
              placeholder="City"
            />
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-semibold">State *</span>
            <Select
              value={form.state}
              onChange={(e) => update("state", e.target.value)}
              className="h-10 px-3 text-sm"
            >
              <option value="">Select state</option>
              {US_STATES.map((state) => (
                <option key={state} value={state}>
                  {state}
                </option>
              ))}
            </Select>
          </label>
          <label className="grid gap-1 text-sm">
            <span className="font-semibold">Zip *</span>
            <Input
              value={form.zip}
              onChange={(e) => update("zip", e.target.value)}
              className="h-10 px-3 text-sm"
              placeholder="Zip"
            />
          </label>
        </div>

        <label className="grid gap-1 text-sm">
          <span className="font-semibold">Country *</span>
          <Select
            value={form.country}
            onChange={(e) => update("country", e.target.value)}
            className="h-10 px-3 text-sm"
          >
            {COUNTRIES.map((country) => (
              <option key={country.value} value={country.value}>
                {country.label}
              </option>
            ))}
          </Select>
        </label>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm">
            <span className="font-semibold">Roof Type *</span>
            <Select
              value={form.roof_type}
              onChange={(e) => update("roof_type", e.target.value)}
              className="h-10 px-3 text-sm"
            >
              <option value="">Select roof type</option>
              {ROOF_TYPES.map((roofType) => (
                <option key={roofType} value={roofType}>
                  {roofType}
                </option>
              ))}
            </Select>
          </label>

          <label className="grid gap-1 text-sm">
            <span className="font-semibold">Brand *</span>
            <Select
              value={form.roof_brand}
              onChange={(e) => update("roof_brand", e.target.value)}
              className="h-10 px-3 text-sm"
            >
              <option value="">Select brand</option>
              {ROOF_BRANDS.map((brand) => (
                <option key={brand} value={brand}>
                  {brand}
                </option>
              ))}
            </Select>
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm">
            <span className="font-semibold">Needed Around Month *</span>
            <Select
              value={form.needed_month}
              onChange={(e) => update("needed_month", e.target.value)}
              className="h-10 px-3 text-sm"
            >
              <option value="">Select month</option>
              {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
                <option key={month} value={String(month)}>
                  {new Date(2000, month - 1, 1).toLocaleString("en-US", { month: "long" })}
                </option>
              ))}
            </Select>
          </label>

          <label className="grid gap-1 text-sm">
            <span className="font-semibold">Needed Around Year *</span>
            <Select
              value={form.needed_year}
              onChange={(e) => update("needed_year", e.target.value)}
              className="h-10 px-3 text-sm"
            >
              <option value="">Select year</option>
              {years.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </Select>
          </label>
        </div>

        <div className="rounded-[14px] border border-black/10 bg-[var(--surface-soft)] p-4">
          <div className="text-sm font-semibold text-black">Solution Types *</div>
          <div className="mt-1 text-[12px] text-[var(--anchor-gray)]">
            Check one or more, then upload photos/videos and comments for each selected solution.
          </div>

          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {SOLUTION_OPTIONS.map((option) => (
              <label key={option.key} className="flex items-center gap-2 rounded-xl border border-black/10 bg-white p-2 text-sm">
                <input
                  type="checkbox"
                  checked={solutions[option.key]?.selected || false}
                  onChange={() => toggleSolution(option.key)}
                />
                <span>{option.label}</span>
              </label>
            ))}
          </div>

          {selectedSolutions.length > 0 && (
            <div className="mt-4 grid gap-3">
              {selectedSolutions.map((option) => {
                const entry = solutions[option.key];
                return (
                  <div key={option.key} className="rounded-xl border border-black/10 bg-white p-3">
                    <div className="text-sm font-semibold text-black">{option.label}</div>
                    <div className="mt-2 grid gap-2">
                      <label className="grid gap-1 text-sm">
                        <span className="font-semibold">Photos / Videos *</span>
                        <input
                          type="file"
                          multiple
                          accept="image/*,video/*"
                          onChange={(e) => addSolutionFiles(option.key, Array.from(e.target.files || []))}
                          className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm"
                        />
                        {entry.files.length > 0 && (
                          <div className="text-[12px] text-black/60">{entry.files.length} file(s) selected</div>
                        )}
                      </label>

                      {entry.files.length > 0 && (
                        <div className="grid gap-1">
                          {entry.files.map((file, fileIndex) => (
                            <div
                              key={`${file.name}-${file.size}-${file.lastModified}-${fileIndex}`}
                              className="flex items-center justify-between rounded-lg border border-black/10 px-2 py-1 text-[12px]"
                            >
                              <span className="truncate pr-3">{file.name}</span>
                              <Button
                                onClick={() => removeSolutionFile(option.key, fileIndex)}
                                className="px-2 py-0.5 text-[11px]"
                                variant="secondary"
                              >
                                Remove
                              </Button>
                            </div>
                          ))}
                        </div>
                      )}

                      <label className="grid gap-1 text-sm">
                        <span className="font-semibold">Comments</span>
                        <Textarea
                          value={entry.comment}
                          onChange={(e) => updateSolutionComment(option.key, e.target.value)}
                          className="min-h-[80px] px-3 py-2 text-sm"
                          placeholder="Add notes specific to this solution type"
                        />
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="rounded-[14px] border border-black/10 bg-[var(--surface-soft)] p-4">
          <div className="text-sm font-semibold text-black">Scheduling Request (Video Call or Site Visit)</div>
          <div className="mt-1 text-[12px] text-[var(--anchor-gray)]">
            This goes to the assigned regional sales rep so they can send scheduling availability (Calendly-style flow).
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm">
              <span className="font-semibold">Request Type</span>
              <Select
                value={form.meeting_request_type}
                onChange={(e) => update("meeting_request_type", e.target.value as FormState["meeting_request_type"])}
                className="h-10 px-3 text-sm"
              >
                <option value="none">No scheduling request</option>
                <option value="video_call">Video call</option>
                <option value="site_visit">Site visit</option>
              </Select>
            </label>

            <label className="grid gap-1 text-sm">
              <span className="font-semibold">Best Contact Phone</span>
              <Input
                value={form.video_call_phone}
                onChange={(e) => update("video_call_phone", e.target.value)}
                className="h-10 px-3 text-sm"
                placeholder="(555) 555-5555"
              />
            </label>
          </div>

          <label className="mt-3 grid gap-1 text-sm">
            <span className="font-semibold">Preferred Availability (for video call/site visit)</span>
            <Textarea
              value={form.preferred_times}
              onChange={(e) => update("preferred_times", e.target.value)}
              className="min-h-[90px] px-3 py-2 text-sm"
              placeholder="List date/time options with timezone, one per line"
            />
          </label>
        </div>
      </div>

      {error && (
        <Alert className="mt-4" tone="error">{error}</Alert>
      )}
      {success && (
        <Alert className="mt-4" tone="success">{success}</Alert>
      )}

      <div className="mt-4 flex gap-2">
        <Button
          type="submit"
          disabled={submitting}
          className="px-4 py-2 text-[12px]"
          variant="primary"
        >
          {submitting ? "Submitting…" : "Submit lead"}
        </Button>
      </div>
      </Card>
    </form>
  );
}
