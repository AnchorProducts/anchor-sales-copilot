"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
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
  customer_company: string;
  details: string;
  project_address: string;
  city: string;
  state: string;
  zip: string;
  country: string;
  roof_type: string[];
  roof_brand: string[];
  preferred_contact_method: "email" | "phone_call" | "phone_text";
};

type SolutionOption = { key: string; label: string };

type SolutionInput = {
  selected: boolean;
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

function clean(v: string) {
  return v.trim();
}

function buildInitialSolutions() {
  return Object.fromEntries(
    SOLUTION_OPTIONS.map((opt) => [opt.key, { selected: false, comment: "", files: [] as File[] }])
  ) as Record<string, SolutionInput>;
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
      const resolved: UserProfile = data
        ? {
            full_name: (data as any).full_name || null,
            company: (data as any).company || null,
            phone: (data as any).phone || null,
            email: (data as any).email || user.email || null,
          }
        : { full_name: null, company: null, phone: null, email: user.email || null };
      setProfile(resolved);
      if (resolved.company) {
        setForm((f) => ({ ...f, customer_company: resolved.company! }));
      }
    })();
  }, [supabase]);

  const [form, setForm] = useState<FormState>({
    customer_company: "",
    details: "",
    project_address: "",
    city: "",
    state: "",
    zip: "",
    country: "US",
    roof_type: [],
    roof_brand: [],
    preferred_contact_method: "email",
  });

  const [solutions, setSolutions] = useState<Record<string, SolutionInput>>(buildInitialSolutions());
  const [otherLabel, setOtherLabel] = useState("");
  const [contractors, setContractors] = useState<Contractor[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Continuous slider 0-599, divided into 6 buckets of 100 each.
  const [timelinePos, setTimelinePos] = useState(50);
  const timelineIdx = Math.min(TIMELINE_OPTIONS.length - 1, Math.floor(timelinePos / 100));
  const timelineSlug = TIMELINE_OPTIONS[timelineIdx].value;

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

  function addContractor() {
    setContractors((prev) => [
      ...prev,
      { name: "", company: "", role: "", phone: "", email: "" },
    ]);
  }

  function removeContractor(index: number) {
    setContractors((prev) => prev.filter((_, i) => i !== index));
  }

  function updateContractor<K extends keyof Contractor>(index: number, key: K, value: Contractor[K]) {
    setContractors((prev) =>
      prev.map((c, i) => (i === index ? { ...c, [key]: value } : c))
    );
  }

  function validate() {
    if (!clean(form.customer_company)) return "Customer company is required.";
    if (!clean(form.details)) return "REC details are required.";
    if (!clean(form.project_address)) return "Project address is required.";
    if (!clean(form.city) || !clean(form.state) || !clean(form.zip) || !clean(form.country)) {
      return "Project city, state, zip, and country are required.";
    }
    if (!form.roof_type.length) return "Roof type is required.";
    if (!form.roof_brand.length) return "Brand is required.";
    if (selectedSolutions.length === 0) {
      return "Select at least one solution type.";
    }

    if (selectedSolutions.some((o) => o.key === "other") && !otherLabel.trim()) {
      return "Please describe the other solution type.";
    }

    for (const option of selectedSolutions) {
      const entry = solutions[option.key];
      const displayLabel = option.key === "other" ? (otherLabel.trim() || "Other") : option.label;
      if (!entry || entry.files.length === 0) {
        return `Add at least one photo or video for ${displayLabel}.`;
      }
    }

    if (form.preferred_contact_method === "phone_call" || form.preferred_contact_method === "phone_text") {
      if (!clean(profile?.phone || "")) {
        return "Add a phone number to your profile to use a phone contact method.";
      }
    }
    if (form.preferred_contact_method === "email" && !clean(profile?.email || "")) {
      return "Your profile is missing an email address.";
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
      fd.append("roof_type", form.roof_type.join(", "));
      fd.append("roof_brand", form.roof_brand.join(", "));
      fd.append("project_timeline", timelineSlug);
      fd.append("preferred_contact_method", form.preferred_contact_method);

      fd.append("submitter_name", profile?.full_name || "");
      fd.append("submitter_company", profile?.company || "");
      fd.append("submitter_phone", profile?.phone || "");
      fd.append("contractors", JSON.stringify(contractors));

      let solutionIndex = 0;
      for (const option of selectedSolutions) {
        const entry = solutions[option.key];
        fd.append(`solution_${solutionIndex}_key`, option.key);
        fd.append(`solution_${solutionIndex}_label`, option.key === "other" ? (otherLabel.trim() || "Other") : option.label);
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
        setError(json?.error || "Failed to submit REC.");
        setSubmitting(false);
        return;
      }

      trackEvent("lead_submitted", { leadId: json?.id ?? null });
      setSuccess("REC submitted. Thanks!");
      setForm({
        customer_company: "",
        details: "",
        project_address: "",
        city: "",
        state: "",
        zip: "",
        country: "US",
        roof_type: [],
        roof_brand: [],
            preferred_contact_method: "email",
      });
      setSolutions(buildInitialSolutions());
      setOtherLabel("");
      setContractors([]);
      setTimelinePos(50);
      setSubmitting(false);
    } catch (e: any) {
      setError(e?.message || "Failed to submit REC.");
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <Card className="border-t-4 border-t-[var(--anchor-green)] p-4 sm:p-5">
        <div className="text-sm font-semibold text-black">{t("projectIdentifierTitle")}</div>
        <div className="mt-1 text-sm text-[var(--anchor-gray)]">{t("projectIdentifierFormDesc")}</div>

        {profile && (
          <div className="mt-4 rounded-[14px] border border-black/10 bg-[var(--surface-soft)] p-4">
            <div className="text-sm font-semibold text-black">{t("submittedBy")}</div>
            <div className="mt-2 grid gap-1 text-sm text-[var(--anchor-gray)]">
              {profile.full_name && <div><span className="font-medium text-black">{profile.full_name}</span></div>}
              {profile.company && <div>{profile.company}</div>}
              {profile.phone && <div>{profile.phone}</div>}
              {profile.email && <div>{profile.email}</div>}
            </div>
            <div className="mt-2 text-[11px] text-black/40">
              {t("yourContactInfo")}
            </div>
          </div>
        )}

        <div className="mt-4 grid gap-4">
          {!profile?.company && (
            <label className="grid gap-1.5 text-sm">
              <span className="font-semibold">{t("customerCompanyName")}</span>
              <Input
                value={form.customer_company}
                onChange={(e) => update("customer_company", e.target.value)}
                className="h-11 px-3 text-sm"
                placeholder={t("projectOwnerPlaceholder")}
              />
            </label>
          )}

          <label className="grid gap-1.5 text-sm">
            <span className="font-semibold">{t("projectDetailsJob")}</span>
            <Textarea value={form.details} onChange={(e) => update("details", e.target.value)} className="min-h-[120px] px-3 py-3 text-sm" placeholder={t("describeJob")} />
          </label>

          <label className="grid gap-1.5 text-sm">
            <span className="font-semibold">{t("projectAddress")}</span>
            <Input value={form.project_address} onChange={(e) => update("project_address", e.target.value)} className="h-11 px-3 text-sm" placeholder={t("jobSiteStreetAddress")} />
          </label>

          <div className="grid gap-3">
            <label className="grid gap-1.5 text-sm">
              <span className="font-semibold">{t("city")}</span>
              <Input value={form.city} onChange={(e) => update("city", e.target.value)} className="h-11 px-3 text-sm" placeholder={t("cityPlain")} />
            </label>
            <div className="grid grid-cols-2 gap-3">
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
              </label>
            </div>
          </div>

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
            <span className="font-semibold">{t("brand")}</span>
            <MultiSelect options={ROOF_BRANDS} value={form.roof_brand} onChange={(v) => update("roof_brand", v)} placeholder={t("selectBrands")} />
          </label>

          <div className="grid gap-2 text-sm">
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

          {/* ── Solution Types ─────────────────────────────────────────────── */}
          <div className="rounded-[14px] border border-black/10 bg-[var(--surface-soft)] p-4">
            <div className="text-sm font-semibold text-black">{t("solutionTypes")}</div>
            <div className="mt-1 text-[12px] text-[var(--anchor-gray)]">{t("selectOneOrMore")}</div>

            <div className="mt-3">
              <MultiSelect
                options={SOLUTION_OPTIONS.map((o) => o.label)}
                sections={SOLUTION_SECTIONS_WITH_OTHER}
                value={SOLUTION_OPTIONS.filter((o) => solutions[o.key]?.selected).map((o) => o.label)}
                onChange={(labels) => setSolutions((prev) => { const next = { ...prev }; for (const opt of SOLUTION_OPTIONS) { next[opt.key] = { ...next[opt.key], selected: labels.includes(opt.label) }; } return next; })}
                placeholder={t("selectSolutionTypes")}
              />
            </div>

            {selectedSolutions.length > 0 && (
              <div className="mt-4 grid gap-3">
                {selectedSolutions.map((option) => {
                  const entry = solutions[option.key];
                  return (
                    <div key={option.key} className="rounded-xl border border-black/10 bg-white p-4">
                      <div className="text-sm font-semibold text-black">{option.label}</div>
                      <div className="mt-3 grid gap-3">
                        {option.key === "other" && (
                          <label className="grid gap-1.5 text-sm">
                            <span className="font-semibold">{t("solutionNameDesc")}</span>
                            <Input value={otherLabel} onChange={(e) => setOtherLabel(e.target.value)} className="h-11 px-3 text-sm" placeholder={t("describeSolutionType")} />
                          </label>
                        )}
                        <div className="grid gap-1.5 text-sm">
                          <span className="font-semibold">{t("photosVideos")}</span>
                          <label className="cursor-pointer">
                            <input type="file" multiple accept="image/*,video/*" onChange={(e) => addSolutionFiles(option.key, Array.from(e.target.files || []))} className="sr-only" />
                            <div className="flex flex-col items-center gap-2 rounded-xl border-2 border-dashed border-black/15 bg-[var(--surface-soft)] px-4 py-6 text-center transition-colors active:border-[var(--anchor-green)] active:bg-[#F0FDF4]">
                              <div className="flex items-center gap-2 text-black/30">
                                <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>
                                <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="6" width="15" height="12" rx="2"/><path d="m22 8-5 4 5 4V8z"/></svg>
                              </div>
                              <div><span className="text-sm font-semibold" style={{ color: "var(--anchor-green)" }}>{t("tapToUpload")}</span></div>
                              <div className="text-[11px] text-black/35">{t("photosVideosAccepted")}</div>
                            </div>
                          </label>
                          {entry.files.length > 0 && <div className="text-[12px] text-black/60">{entry.files.length} file(s) selected</div>}
                        </div>

                        {entry.files.length > 0 && (
                          <div className="grid gap-2">
                            {entry.files.map((file, fileIndex) => (
                              <div key={`${file.name}-${file.size}-${file.lastModified}-${fileIndex}`} className="flex items-center justify-between rounded-lg border border-black/10 px-3 py-2 text-[12px]">
                                <span className="truncate pr-3">{file.name}</span>
                                <Button onClick={() => removeSolutionFile(option.key, fileIndex)} className="shrink-0 px-3 py-1.5 text-[12px]" variant="secondary">{t("remove")}</Button>
                              </div>
                            ))}
                          </div>
                        )}

                        <label className="grid gap-1.5 text-sm">
                          <span className="font-semibold">{t("comments")}</span>
                          <Textarea value={entry.comment} onChange={(e) => updateSolutionComment(option.key, e.target.value)} className="min-h-[88px] px-3 py-3 text-sm" placeholder={t("addNotes")} />
                        </label>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Best way to contact ────────────────────────────────────────── */}
          <div className="rounded-[14px] border border-black/10 bg-[var(--surface-soft)] p-4">
            <div className="text-sm font-semibold text-black">{t("bestWayToContact")}</div>
            <div className="mt-1 text-[12px] text-[var(--anchor-gray)]">{t("bestWayToContactDesc")}</div>
            <div className="mt-3 grid gap-2">
              {(() => {
                const phone = clean(profile?.phone || "");
                const email = clean(profile?.email || "");
                const options: Array<{
                  value: FormState["preferred_contact_method"];
                  labelKey: "contactEmail" | "contactPhoneCall" | "contactPhoneText";
                  display: string;
                  disabled: boolean;
                }> = [
                  { value: "email", labelKey: "contactEmail", display: email || t("notSet"), disabled: !email },
                  { value: "phone_call", labelKey: "contactPhoneCall", display: phone || t("notSet"), disabled: !phone },
                  { value: "phone_text", labelKey: "contactPhoneText", display: phone || t("notSet"), disabled: !phone },
                ];
                return (
                  <>
                    {options.map((opt) => (
                      <label
                        key={opt.value}
                        className={`flex items-start gap-3 rounded-lg border border-black/10 bg-white px-3 py-3 text-sm ${opt.disabled ? "opacity-50" : "cursor-pointer hover:border-[var(--anchor-green)]"}`}
                      >
                        <input
                          type="radio"
                          name="preferred_contact_method"
                          value={opt.value}
                          checked={form.preferred_contact_method === opt.value}
                          onChange={() => update("preferred_contact_method", opt.value)}
                          disabled={opt.disabled}
                          className="mt-0.5 h-4 w-4 shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="font-semibold">{t(opt.labelKey)}</div>
                          <div className="truncate text-[12px] text-[var(--anchor-gray)]">{opt.display}</div>
                        </div>
                      </label>
                    ))}
                    {!phone && (
                      <div className="text-[12px] text-[var(--anchor-gray)]">
                        {t("addPhoneInSettings")}{" "}
                        <Link href="/dashboard/settings" className="underline text-[var(--anchor-green)]">
                          {t("settings")}
                        </Link>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </div>

          {/* ── Contractors ────────────────────────────────────────────────── */}
          <div className="rounded-[14px] border border-black/10 bg-[var(--surface-soft)] p-4">
            <div className="text-sm font-semibold text-black">{t("contractorsOnProject")}</div>
            <div className="mt-1 text-[12px] text-[var(--anchor-gray)]">{t("addContactInfoContractors")}</div>

            {contractors.length > 0 && (
              <div className="mt-3 grid gap-3">
                {contractors.map((contractor, index) => (
                  <div key={index} className="rounded-xl border border-black/10 bg-white p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="text-sm font-semibold text-black">{t("contractor")} {index + 1}</div>
                      <Button onClick={() => removeContractor(index)} className="px-3 py-1.5 text-[12px]" variant="secondary">{t("remove")}</Button>
                    </div>
                    <div className="grid gap-3">
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
          </div>
        </div>

        {error && <Alert className="mt-4" tone="error">{error}</Alert>}
        {success && <Alert className="mt-4" tone="success">{t("leadSubmittedThanks")}</Alert>}

        <div className="mt-5">
          <Button type="submit" disabled={submitting} className="w-full py-3 text-sm sm:w-auto sm:px-6" variant="primary">
            {submitting ? t("submitting") : t("submitLead")}
          </Button>
        </div>
      </Card>
    </form>
  );
}
