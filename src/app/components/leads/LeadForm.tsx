"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import Button from "@/app/components/ui/Button";
import { Card } from "@/app/components/ui/Card";
import { Alert } from "@/app/components/ui/Alert";
import { Input, Select, Textarea } from "@/app/components/ui/Field";
import { MultiSelect } from "@/app/components/ui/MultiSelect";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { ROOF_BRANDS, ROOF_TYPES } from "@/lib/roofing/options";
import { US_STATES } from "@/lib/sales/states";
import {
  SOLUTION_CATALOG,
  SOLUTION_CATEGORIES,
} from "@/lib/solutions/solutionCatalog";
import { trackEvent } from "@/lib/analytics/track";

type FormState = {
  project_name: string;
  project_address: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  roof_type: string[];
  roof_brand: string[];
};

type SolutionEntry = {
  id: string;
  solution_key: string;
  solution_label: string;
  other_label: string;
  comment: string;
  files: File[];
};

type Contractor = {
  name: string;
  company: string;
  role: string;
  phone: string;
  email: string;
};

const COUNTRIES = [
  { value: "US", label: "United States" },
  { value: "CA", label: "Canada" },
  { value: "MX", label: "Mexico" },
];

const TIMELINE_OPTIONS = [
  { value: "immediate", labelKey: "timelineImmediate" as const },
  { value: "2_4_weeks", labelKey: "timeline_2_4_weeks" as const },
  { value: "2_3_months", labelKey: "timeline_2_3_months" as const },
  { value: "3_6_months", labelKey: "timeline_3_6_months" as const },
  { value: "6_12_months", labelKey: "timeline_6_12_months" as const },
  { value: "over_1_year", labelKey: "timelineOver1Year" as const },
];

type SolutionOption = { key: string; label: string };

const SOLUTION_OPTIONS: SolutionOption[] = [
  ...SOLUTION_CATALOG.map((s) => ({ key: s.key, label: s.label })),
  { key: "other", label: "Other" },
];

const SOLUTION_SECTIONS = SOLUTION_CATEGORIES.map((category) => {
  const items = SOLUTION_CATALOG.filter((s) => s.category === category.key);
  return {
    heading: category.label,
    options: items.map((s) => s.label),
    comingSoon: items.length > 0 && items.every((s) => s.comingSoon),
  };
}).filter((sec) => sec.options.length > 0);

const SOLUTION_SECTIONS_WITH_OTHER = [
  ...SOLUTION_SECTIONS,
  { heading: "Other", options: ["Other"] },
];

// Commission-claim-only options (mirrors CommissionForm) for the optional
// "also file my Anchor commission claim" section.
const U_ANCHOR_OPTIONS = [
  "U2000 KEE", "U2000 PVC", "U2000 TPO", "U2200 Plate", "U2400 EPDM", "U2400 KEE",
  "U2400 PVC", "U2400 TPO", "U2600 APP", "U2600 SBS", "U2600 SBS Torch", "U2800 Coatings",
  "U3200 Plate", "U3400 EPDM", "U3400 KEE", "U3400 PVC", "U3400 TPO", "U3600 APP",
  "U3600 SBS", "U3600 SBS Torch", "U3800 Coatings",
];
const OTHER_ITEMS = SOLUTION_CATALOG.map((s) => s.label);

type ClaimState = {
  certified: boolean;
  disclosure: "" | "correct" | "multiple";
  additional_salespeople: string;
  estimated_order_date: string;
  u_anchors_ordered: string[];
  qty: string;
  other_items: string[];
};

const INITIAL_CLAIM: ClaimState = {
  certified: false,
  disclosure: "",
  additional_salespeople: "",
  estimated_order_date: "",
  u_anchors_ordered: [],
  qty: "",
  other_items: [],
};

function clean(v: string) {
  return v.trim();
}

function newSolutionEntry(): SolutionEntry {
  return {
    id: (typeof crypto !== "undefined" && "randomUUID" in crypto)
      ? crypto.randomUUID()
      : `sol-${Math.random().toString(36).slice(2, 10)}`,
    solution_key: "",
    solution_label: "",
    other_label: "",
    comment: "",
    files: [],
  };
}

type UserProfile = {
  full_name: string | null;
  company: string | null;
  phone: string | null;
  email: string | null;
};

export default function LeadForm() {
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const { t } = useTranslation();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [submittedByExpanded, setSubmittedByExpanded] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      const user = userData.user;
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("full_name,company,phone,email")
        .eq("id", user.id)
        .maybeSingle();
      const row = data as { full_name?: string | null; company?: string | null; phone?: string | null; email?: string | null } | null;
      const resolved: UserProfile = row
        ? {
            full_name: row.full_name || null,
            company: row.company || null,
            phone: row.phone || null,
            email: row.email || user.email || null,
          }
        : { full_name: null, company: null, phone: null, email: user.email || null };
      setProfile(resolved);
    })();
  }, [supabase]);

  const [form, setForm] = useState<FormState>({
    project_name: "",
    project_address: "",
    city: "",
    state: "",
    zip: "",
    country: "US",
    roof_type: [],
    roof_brand: [],
  });

  const [solutions, setSolutions] = useState<SolutionEntry[]>(() => [newSolutionEntry()]);
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [followUp, setFollowUp] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [timelinePos, setTimelinePos] = useState(50);
  const timelineIdx = Math.min(TIMELINE_OPTIONS.length - 1, Math.floor(timelinePos / 100));
  const timelineSlug = TIMELINE_OPTIONS[timelineIdx].value;

  // Anchor commission: any user can file a commission claim with this consult.
  const [fileCommission, setFileCommission] = useState(false);
  const [claim, setClaim] = useState<ClaimState>(INITIAL_CLAIM);

  function updateClaim<K extends keyof ClaimState>(key: K, value: ClaimState[K]) {
    setClaim((c) => ({ ...c, [key]: value }));
  }

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function updateSolution(id: string, patch: Partial<SolutionEntry>) {
    setSolutions((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  function addSolutionEntry() {
    setSolutions((prev) => [...prev, newSolutionEntry()]);
  }

  function removeSolutionEntry(id: string) {
    setSolutions((prev) => (prev.length <= 1 ? prev : prev.filter((s) => s.id !== id)));
  }

  function addSolutionFiles(id: string, newFiles: File[]) {
    if (!newFiles.length) return;
    setSolutions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, files: [...s.files, ...newFiles] } : s))
    );
  }

  function removeSolutionFile(id: string, fileIndex: number) {
    setSolutions((prev) =>
      prev.map((s) =>
        s.id === id ? { ...s, files: s.files.filter((_, i) => i !== fileIndex) } : s
      )
    );
  }

  function addContractor() {
    setContractors((prev) => [...prev, { name: "", company: "", role: "", phone: "", email: "" }]);
  }

  function removeContractor(index: number) {
    setContractors((prev) => prev.filter((_, i) => i !== index));
  }

  function updateContractor<K extends keyof Contractor>(index: number, key: K, value: Contractor[K]) {
    setContractors((prev) => prev.map((c, i) => (i === index ? { ...c, [key]: value } : c)));
  }

  function validate() {
    if (!clean(form.project_name)) return "Project name is required.";
    if (!clean(form.project_address)) return "Project site address is required.";
    if (!clean(form.city) || !clean(form.state) || !clean(form.zip) || !clean(form.country)) {
      return "Project city, state, zip, and country are required.";
    }
    if (!form.roof_type.length) return "Roof type is required.";
    if (!form.roof_brand.length) return "Roof brand is required.";

    if (solutions.length === 0) return "Add at least one solution.";
    for (const entry of solutions) {
      if (!entry.solution_label) {
        return "Select a solution type for each solution.";
      }
      if (entry.solution_key === "other" && !clean(entry.other_label)) {
        return "Describe the other solution type.";
      }
      if (entry.files.length === 0) {
        const label = entry.solution_key === "other" ? (clean(entry.other_label) || "Other") : entry.solution_label;
        return `Add at least one photo or video for ${label}.`;
      }
    }

    if (fileCommission) {
      if (!claim.certified) return "Please certify the commission claim before submitting.";
      if (!claim.disclosure) return "Confirm the salesperson disclosure for the commission claim.";
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
      // Reuse the existing leads-table column for the project name so the
      // server schema stays unchanged. The label changed from "Customer
      // Company" to "Project Name" only at the UI layer.
      fd.append("customer_company", form.project_name);
      fd.append("project_name", form.project_name);
      fd.append("details", followUp);
      fd.append("project_address", form.project_address);
      fd.append("city", form.city);
      fd.append("state", form.state);
      fd.append("zip", form.zip);
      fd.append("country", form.country);
      fd.append("roof_type", form.roof_type.join(", "));
      fd.append("roof_brand", form.roof_brand.join(", "));
      fd.append("project_timeline", timelineSlug);
      // Default to "email" — the form no longer collects this. Server still
      // requires a valid contact method to email the assigned rep.
      fd.append("preferred_contact_method", "email");
      fd.append("project_follow_up", followUp);

      fd.append("submitter_name", profile?.full_name || "");
      fd.append("submitter_company", profile?.company || "");
      fd.append("submitter_phone", profile?.phone || "");
      fd.append("contractors", JSON.stringify(contractors));

      solutions.forEach((entry, idx) => {
        const labelOut =
          entry.solution_key === "other"
            ? (clean(entry.other_label) || "Other")
            : entry.solution_label;
        fd.append(`solution_${idx}_key`, entry.solution_key);
        fd.append(`solution_${idx}_label`, labelOut);
        fd.append(`solution_${idx}_comment`, entry.comment);
        for (const file of entry.files) {
          fd.append(`solution_${idx}_files`, file);
        }
      });

      const res = await fetch("/api/leads", {
        method: "POST",
        body: fd,
      });

      const text = await res.text();
      const json = text ? JSON.parse(text) : {};

      if (!res.ok) {
        setError(json?.error || "Failed to submit consult.");
        setSubmitting(false);
        return;
      }

      trackEvent("lead_submitted", {
        leadId: json?.id ?? null,
        state: form.state || null,
        // OEM is not yet collected; tracked as null for forward-compatible
        // aggregation (analytics phase 2 will populate this).
        oem: null,
      });

      // Anchor commission: file the claim alongside the consult, reusing the
      // REC's project/roof/address fields and the inline claim-only inputs.
      let claimNote = "";
      if (fileCommission) {
        try {
          const cRes = await fetch("/api/commission", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              certified: claim.certified,
              unaware_other_salesperson:
                claim.disclosure === "correct" ? "yes" : claim.disclosure === "multiple" ? "no" : null,
              additional_salespeople: claim.disclosure === "multiple" ? claim.additional_salespeople : null,
              estimated_order_date: claim.estimated_order_date || null,
              job_name: form.project_name,
              company_placing_order: form.project_name, // reused from the REC
              order_city: form.city,
              order_state: form.state,
              u_anchors_ordered: claim.u_anchors_ordered.join(", "),
              qty: claim.qty,
              roof_type: form.roof_type.join(", "),
              roof_brand: form.roof_brand.join(", "),
              other_items: claim.other_items.join(", "),
              ship_to_address: form.project_address,
              ship_city: form.city,
              ship_state: form.state,
              ship_zip: form.zip,
              project_description: followUp,
            }),
          });
          const cJson = await cRes.json().catch(() => ({}));
          if (!cRes.ok) {
            claimNote = ` Note: the consult saved, but the commission claim failed (${cJson?.error || "unknown error"}). You can file it from the Commission Claim form.`;
          } else if (cJson?.emailStatus === "failed" || cJson?.emailStatus === "skipped") {
            claimNote = " Commission claim filed (recipient email pending).";
          } else {
            claimNote = " Commission claim filed.";
          }
        } catch {
          claimNote = " Note: the consult saved, but the commission claim could not be filed. You can file it from the Commission Claim form.";
        }
      }

      setSuccess("Consult submitted. Thanks!" + claimNote);
      setForm({
        project_name: "",
        project_address: "",
        city: "",
        state: "",
        zip: "",
        country: "US",
        roof_type: [],
        roof_brand: [],
      });
      setSolutions([newSolutionEntry()]);
      setContractors([]);
      setFollowUp("");
      setTimelinePos(50);
      setFileCommission(false);
      setClaim(INITIAL_CLAIM);
      setSubmitting(false);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to submit consult.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <Card className="border-t-4 border-t-[var(--anchor-green)] p-4 sm:p-5">
        {profile && (
          <div className="rounded-[14px] border border-black/10 bg-[var(--surface-soft)]">
            <button
              type="button"
              onClick={() => setSubmittedByExpanded((v) => !v)}
              aria-expanded={submittedByExpanded}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
            >
              <span className="text-sm font-semibold text-black">{t("submittedBy")}</span>
              <span className="shrink-0 text-[11px] text-black/40">{submittedByExpanded ? "▴" : "▾"}</span>
            </button>
            {submittedByExpanded && (
              <div className="px-4 pb-4">
                <div className="grid gap-1 text-sm text-[var(--anchor-gray)]">
                  {profile.full_name && <div><span className="font-medium text-black">{profile.full_name}</span></div>}
                  {profile.company && <div>{profile.company}</div>}
                  {profile.phone && <div>{profile.phone}</div>}
                  {profile.email && <div>{profile.email}</div>}
                </div>
                <div className="mt-2 text-[11px] text-black/40">{t("yourContactInfo")}</div>
              </div>
            )}
          </div>
        )}

        <div className="mt-4 grid grid-cols-1 gap-4">
          <label data-tutorial="rec-project" className="grid gap-1.5 text-sm">
            <span className="font-semibold">Project Name *</span>
            <Input
              value={form.project_name}
              onChange={(e) => update("project_name", e.target.value)}
              className="h-11 px-3 text-sm"
              placeholder="Project name"
            />
          </label>

          <label className="grid gap-1.5 text-sm">
            <span className="font-semibold">Project Site Address *</span>
            <Input
              value={form.project_address}
              onChange={(e) => update("project_address", e.target.value)}
              className="h-11 px-3 text-sm"
              placeholder={t("jobSiteStreetAddress")}
            />
          </label>

          <label className="grid gap-1.5 text-sm">
            <span className="font-semibold">{t("city")}</span>
            <Input value={form.city} onChange={(e) => update("city", e.target.value)} className="h-11 px-3 text-sm" placeholder={t("cityPlain")} />
          </label>

          <label className="grid gap-1.5 text-sm">
            <span className="font-semibold">{t("state")}</span>
            <Select value={form.state} onChange={(e) => update("state", e.target.value)} className="h-11 px-3 text-sm">
              <option value="">{t("statePlain")}</option>
              {US_STATES.map((state) => (<option key={state} value={state}>{state}</option>))}
            </Select>
          </label>

          <label className="grid gap-1.5 text-sm">
            <span className="font-semibold">{t("zip")}</span>
            <Input value={form.zip} onChange={(e) => update("zip", e.target.value)} className="h-11 px-3 text-sm" placeholder={t("zipPlain")} />
            {clean(form.state).toUpperCase() === "TX" && (
              <span className="text-[11px] text-[var(--anchor-gray)]">
                Required for Texas — the ZIP routes this to the correct Anchor rep (Greater Houston &amp; Gulf Coast vs. the rest of TX).
              </span>
            )}
          </label>

          <label className="grid gap-1.5 text-sm">
            <span className="font-semibold">{t("country")}</span>
            <Select value={form.country} onChange={(e) => update("country", e.target.value)} className="h-11 px-3 text-sm">
              {COUNTRIES.map((country) => (<option key={country.value} value={country.value}>{country.label}</option>))}
            </Select>
          </label>

          <label className="grid gap-1.5 text-sm">
            <span className="font-semibold">{t("roofType")}</span>
            <MultiSelect options={ROOF_TYPES} value={form.roof_type} onChange={(v) => update("roof_type", v)} placeholder={t("selectRoofTypes")} />
          </label>

          <label className="grid gap-1.5 text-sm">
            <span className="font-semibold">Roof Brand *</span>
            <MultiSelect options={ROOF_BRANDS} value={form.roof_brand} onChange={(v) => update("roof_brand", v)} placeholder={t("selectBrands")} />
          </label>

          <div className="grid grid-cols-1 gap-2 text-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold">{t("projectTimeline")}</span>
              <span className="shrink-0 font-semibold text-[var(--anchor-green)]">
                {t(TIMELINE_OPTIONS[timelineIdx].labelKey)}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={TIMELINE_OPTIONS.length * 100 - 1}
              step={1}
              value={timelinePos}
              onChange={(e) => setTimelinePos(Number(e.target.value))}
              className="w-full accent-[var(--anchor-green)]"
              aria-label={t("projectTimeline")}
            />
            <div
              className="grid gap-1 text-[10px] leading-tight text-[var(--anchor-gray)] sm:text-[11px]"
              style={{ gridTemplateColumns: `repeat(${TIMELINE_OPTIONS.length}, minmax(0, 1fr))` }}
            >
              {TIMELINE_OPTIONS.map((opt, i) => (
                <div
                  key={opt.value}
                  className={`text-center break-words ${i === timelineIdx ? "font-semibold text-[var(--anchor-green)]" : ""}`}
                >
                  {t(opt.labelKey)}
                </div>
              ))}
            </div>
          </div>

          {/* ── Solution Types (repeatable) ─────────────────────────────────── */}
          <div data-tutorial="rec-solutions" className="rounded-[14px] border border-black/10 bg-[var(--surface-soft)] p-4">
            <div className="text-sm font-semibold text-black">Solution Type *</div>
            <div className="mt-1 text-[12px] text-[var(--anchor-gray)]">
              Pick a solution type, attach a picture, and add notes. Add another for each solution on the project.
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3">
              {solutions.map((entry, idx) => (
                <div key={entry.id} className="rounded-xl border border-black/10 bg-white p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="text-sm font-semibold text-black">Solution {idx + 1}</div>
                    {solutions.length > 1 && (
                      <Button onClick={() => removeSolutionEntry(entry.id)} className="px-3 py-1.5 text-[12px]" variant="secondary">
                        {t("remove")}
                      </Button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 gap-3">
                    <SolutionTypeSelect
                      value={entry.solution_label}
                      onChange={(label) => {
                        const opt = SOLUTION_OPTIONS.find((o) => o.label === label);
                        updateSolution(entry.id, {
                          solution_key: opt ? opt.key : "",
                          solution_label: label,
                        });
                      }}
                    />

                    {entry.solution_key === "other" && (
                      <label className="grid gap-1.5 text-sm">
                        <span className="font-semibold">{t("solutionNameDesc")}</span>
                        <Input
                          value={entry.other_label}
                          onChange={(e) => updateSolution(entry.id, { other_label: e.target.value })}
                          className="h-11 px-3 text-sm"
                          placeholder={t("describeSolutionType")}
                        />
                      </label>
                    )}

                    <div className="grid gap-1.5 text-sm">
                      <span className="font-semibold">{t("photosVideos")}</span>
                      <label className="cursor-pointer">
                        <input
                          type="file"
                          multiple
                          accept="image/*,video/*"
                          onChange={(e) => addSolutionFiles(entry.id, Array.from(e.target.files || []))}
                          className="sr-only"
                        />
                        <div className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-black/15 bg-[var(--surface-soft)] px-4 py-6 text-center transition-colors active:border-[var(--anchor-green)] active:bg-[#F0FDF4]">
                          <div className="flex items-center gap-2 text-black/30">
                            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>
                            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="15" height="12" rx="2"/><path d="m22 8-5 4 5 4V8z"/></svg>
                          </div>
                          <div><span className="text-sm font-semibold" style={{ color: "var(--anchor-green)" }}>{t("tapToUpload")}</span></div>
                          <div className="text-[11px] text-black/35">{t("photosVideosAccepted")}</div>
                        </div>
                      </label>
                      {entry.files.length > 0 && (
                        <div className="text-[12px] text-black/60">{entry.files.length} file(s) selected</div>
                      )}
                    </div>

                    {entry.files.length > 0 && (
                      <div className="grid gap-2">
                        {entry.files.map((file, fileIndex) => (
                          <div
                            key={`${file.name}-${file.size}-${file.lastModified}-${fileIndex}`}
                            className="flex items-center justify-between rounded-lg border border-black/10 px-3 py-2 text-[12px]"
                          >
                            <span className="truncate pr-3">{file.name}</span>
                            <Button onClick={() => removeSolutionFile(entry.id, fileIndex)} className="shrink-0 px-3 py-1.5 text-[12px]" variant="secondary">
                              {t("remove")}
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}

                    <label className="grid gap-1.5 text-sm">
                      <span className="font-semibold">Notes</span>
                      <Textarea
                        value={entry.comment}
                        onChange={(e) => updateSolution(entry.id, { comment: e.target.value })}
                        className="min-h-[88px] px-3 py-3 text-sm"
                        placeholder={t("addNotes")}
                      />
                    </label>
                  </div>
                </div>
              ))}
            </div>

            <Button onClick={addSolutionEntry} className="mt-3 w-full py-3 text-sm sm:w-auto sm:px-4" variant="secondary">
              + Add Another Solution
            </Button>
          </div>

          {/* ── Contractors + Project Follow Up ─────────────────────────────── */}
          <div data-tutorial="rec-contractors" className="rounded-[14px] border border-black/10 bg-[var(--surface-soft)] p-4">
            <div className="text-sm font-semibold text-black">{t("contractorsOnProject")}</div>
            <div className="mt-1 text-[12px] text-[var(--anchor-gray)]">
              Add contact info for any contractors involved. Follow-up will be directed to the contractor, not the submitter.
            </div>

            {contractors.length > 0 && (
              <div className="mt-3 grid grid-cols-1 gap-3">
                {contractors.map((contractor, index) => (
                  <div key={index} className="rounded-xl border border-black/10 bg-white p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="text-sm font-semibold text-black">{t("contractor")} {index + 1}</div>
                      <Button onClick={() => removeContractor(index)} className="px-3 py-1.5 text-[12px]" variant="secondary">{t("remove")}</Button>
                    </div>
                    <div className="grid grid-cols-1 gap-3">
                      <label className="grid gap-1.5 text-sm">
                        <span className="font-semibold">{t("fullName")}</span>
                        <Input value={contractor.name} onChange={(e) => updateContractor(index, "name", e.target.value)} className="h-11 px-3 text-sm" placeholder={t("fullNamePlain")} />
                      </label>
                      <label className="grid gap-1.5 text-sm">
                        <span className="font-semibold">{t("company")}</span>
                        <Input value={contractor.company} onChange={(e) => updateContractor(index, "company", e.target.value)} className="h-11 px-3 text-sm" placeholder={t("companyPlaceholder")} />
                      </label>
                      <label className="grid gap-1.5 text-sm">
                        <span className="font-semibold">{t("roleTrade")}</span>
                        <Input value={contractor.role} onChange={(e) => updateContractor(index, "role", e.target.value)} className="h-11 px-3 text-sm" placeholder={t("roleExample")} />
                      </label>
                      <label className="grid gap-1.5 text-sm">
                        <span className="font-semibold">{t("phone")}</span>
                        <Input value={contractor.phone} onChange={(e) => updateContractor(index, "phone", e.target.value)} className="h-11 px-3 text-sm" placeholder={t("phonePlaceholder")} />
                      </label>
                      <label className="grid gap-1.5 text-sm">
                        <span className="font-semibold">{t("email")}</span>
                        <Input value={contractor.email} onChange={(e) => updateContractor(index, "email", e.target.value)} className="h-11 px-3 text-sm" placeholder={t("emailExample")} />
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <Button onClick={addContractor} className="mt-3 w-full py-3 text-sm sm:w-auto sm:px-4" variant="secondary">
              {t("addContractor")}
            </Button>

            <label className="mt-4 grid gap-1.5 text-sm">
              <span className="font-semibold">Project Follow Up</span>
              <Textarea
                value={followUp}
                onChange={(e) => setFollowUp(e.target.value)}
                className="min-h-[88px] px-3 py-3 text-sm"
                placeholder="Notes for the Anchor Products rep to follow up with the contractor on (timing, decision maker, scope, etc.)."
              />
            </label>
          </div>
        </div>

        <div className="mt-5 rounded-[14px] border border-[var(--anchor-green)]/40 bg-[var(--anchor-mint)]/20 p-4">
            <label className="flex cursor-pointer items-start gap-3">
              <input
                type="checkbox"
                checked={fileCommission}
                onChange={(e) => setFileCommission(e.target.checked)}
                className="mt-0.5 shrink-0"
              />
              <span className="text-sm">
                <span className="font-semibold text-[var(--anchor-deep)]">Also file my Anchor commission claim</span>
                <span className="mt-0.5 block text-xs text-[var(--anchor-gray)]">
                  We&apos;ll reuse this consult&apos;s project, roof, and address details — just add the few claim-specific fields below.
                </span>
              </span>
            </label>

            {fileCommission && (
              <div className="mt-4 grid grid-cols-1 gap-5">
                <label className="flex cursor-pointer items-start gap-3 rounded-[14px] border border-black/10 bg-white p-4">
                  <input type="checkbox" checked={claim.certified} onChange={(e) => updateClaim("certified", e.target.checked)} className="mt-0.5 shrink-0" />
                  <span className="text-sm">{t("certifyText")}</span>
                </label>

                <div className="rounded-[14px] border border-black/10 bg-white p-4">
                  <div className="text-sm">I am not aware of any additional salesperson or entity that had a role in securing this sale.</div>
                  <div className="mt-3 grid gap-2 text-sm">
                    <label className="flex cursor-pointer items-start gap-2">
                      <input type="radio" name="rec_disclosure" className="mt-1" checked={claim.disclosure === "correct"} onChange={() => updateClaim("disclosure", "correct")} />
                      <span>Correct</span>
                    </label>
                    <label className="flex cursor-pointer items-start gap-2">
                      <input type="radio" name="rec_disclosure" className="mt-1" checked={claim.disclosure === "multiple"} onChange={() => updateClaim("disclosure", "multiple")} />
                      <span>There were multiple salespeople involved – List Additional Salespeople</span>
                    </label>
                    {claim.disclosure === "multiple" && (
                      <Textarea
                        value={claim.additional_salespeople}
                        onChange={(e) => updateClaim("additional_salespeople", e.target.value)}
                        className="min-h-[80px] px-3 py-2 text-sm"
                        placeholder="List the additional salesperson(s) or entities that had a role in securing this sale."
                      />
                    )}
                  </div>
                </div>

                <label className="grid gap-1 text-sm">
                  <span className="font-semibold">{t("estimatedOrderDate")}</span>
                  <Input type="date" value={claim.estimated_order_date} onChange={(e) => updateClaim("estimated_order_date", e.target.value)} className="block min-h-[44px] w-full min-w-0 max-w-full px-3 py-2 text-sm" />
                </label>

                <label className="grid gap-1 text-sm">
                  <span className="font-semibold">{t("uAnchorsOrdered")}</span>
                  <MultiSelect options={U_ANCHOR_OPTIONS} value={claim.u_anchors_ordered} onChange={(v) => updateClaim("u_anchors_ordered", v)} placeholder={t("selectUAnchors")} />
                </label>

                <label className="grid gap-1 text-sm">
                  <span className="font-semibold">Approximate Quantity Ordered</span>
                  <Input value={claim.qty} onChange={(e) => updateClaim("qty", e.target.value)} className="h-10 px-3 text-sm" placeholder="Approximate quantity ordered" />
                </label>

                <label className="grid gap-1 text-sm">
                  <span className="font-semibold">Other Items</span>
                  <MultiSelect options={OTHER_ITEMS} value={claim.other_items} onChange={(v) => updateClaim("other_items", v)} placeholder="Select other items" />
                </label>
              </div>
            )}
          </div>

        {error && <Alert className="mt-4" tone="error">{error}</Alert>}
        {success && <Alert className="mt-4" tone="success">{success}</Alert>}

        <div className="mt-5">
          <Button data-tutorial="rec-submit" type="submit" disabled={submitting} className="w-full py-3 text-sm sm:w-auto sm:px-6" variant="primary">
            {submitting ? t("submitting") : t("submitLead")}
          </Button>
        </div>
      </Card>
    </form>
  );
}

function SolutionTypeSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (label: string) => void;
}) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="font-semibold">Solution Type *</span>
      <MultiSelect
        options={SOLUTION_OPTIONS.map((o) => o.label)}
        sections={SOLUTION_SECTIONS_WITH_OTHER}
        value={value ? [value] : []}
        onChange={(labels) => {
          // Single-select behaviour: take the last picked label so the
          // existing MultiSelect chrome works as a typeahead dropdown.
          const next = labels.find((l) => l !== value) || labels[0] || "";
          onChange(next);
        }}
        placeholder="Select a solution type"
      />
    </label>
  );
}
