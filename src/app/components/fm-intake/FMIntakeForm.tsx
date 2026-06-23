"use client";

import { useState } from "react";
import { Card } from "@/app/components/ui/Card";
import { Input, Select, Textarea } from "@/app/components/ui/Field";
import Button from "@/app/components/ui/Button";

// ── Field-config driven rendering ───────────────────────────────────────────
type FieldDef = {
  key: string;
  label: string;
  kind?: "text" | "date" | "yesno";
  placeholder?: string;
  full?: boolean;
};

type Values = Record<string, string>;

const labelCls =
  "block text-[11px] font-semibold uppercase tracking-wide text-[var(--anchor-gray)]";

function FieldGrid({
  fields,
  values,
  onChange,
}: {
  fields: FieldDef[];
  values: Values;
  onChange: (key: string, value: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      {fields.map((f) => (
        <label key={f.key} className={f.full ? "sm:col-span-2" : ""}>
          <span className={labelCls}>{f.label}</span>
          {f.kind === "yesno" ? (
            <Select
              value={values[f.key] ?? ""}
              onChange={(e) => onChange(f.key, e.target.value)}
              className="mt-1 h-11 w-full text-sm"
            >
              <option value="">Select…</option>
              <option value="Yes">Yes</option>
              <option value="No">No</option>
            </Select>
          ) : (
            <Input
              type={f.kind === "date" ? "date" : "text"}
              value={values[f.key] ?? ""}
              placeholder={f.placeholder}
              onChange={(e) => onChange(f.key, e.target.value)}
              className="mt-1 h-11 w-full text-sm"
            />
          )}
        </label>
      ))}
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-4 sm:p-5">
      <h2 className="text-base font-bold text-[var(--anchor-deep)] sm:text-lg">{title}</h2>
      {description && <p className="mt-1 text-sm text-[var(--anchor-gray)]">{description}</p>}
      <div className="mt-4">{children}</div>
    </Card>
  );
}

function LinkButton({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border-default)] bg-white px-3 py-2 text-xs font-semibold text-[var(--anchor-deep)] transition hover:bg-[var(--anchor-mint)]/40"
    >
      {children} <span aria-hidden>↗</span>
    </a>
  );
}

// ── Field configs ───────────────────────────────────────────────────────────
const BUILDING_FIELDS: FieldDef[] = [
  { key: "roofDeckType", label: "Roof Deck Type" },
  { key: "roofDeckThickness", label: "Roof Deck Thickness (in.)" },
  { key: "coverboardType", label: "Coverboard Type" },
  { key: "coverboardThickness", label: "Coverboard Thickness (in.)" },
  { key: "insulationType", label: "Insulation Type" },
  { key: "installationYear", label: "Installation Year / Roof Age", kind: "date" },
  { key: "membraneTypeColor", label: "Roof Membrane Type and Color", full: true },
  { key: "membraneManufacturer", label: "Membrane Manufacturer" },
  { key: "underWarranty", label: "Under Warranty?", kind: "yesno" },
];

const ENGINEERING_FIELDS: FieldDef[] = [
  { key: "designCriteria", label: "Design Criteria (e.g. IBC – 2021/2024)", full: true },
  { key: "designWindSpeed", label: "Design Wind Speed (FM Data Sheet 1-28, mph)" },
  { key: "buildingCode", label: "Building Code (e.g. ASCE 7-16/7-22)" },
  { key: "buildingHeight", label: "Building Height (ft.)" },
  { key: "buildingWidth", label: "Building Width (ft.)" },
  { key: "buildingLength", label: "Building Length (ft.)" },
  { key: "riskCategory", label: "Risk Category" },
  { key: "exposureCategory", label: "Exposure Category" },
];

const HVAC_FIELDS: FieldDef[] = [
  { key: "curbWidth", label: "Curb Width (in.)" },
  { key: "curbHeight", label: "Curb Height (in.)" },
  { key: "curbLength", label: "Curb Length (in.)" },
  { key: "unitWidth", label: "Unit Width (in.)" },
  { key: "unitHeight", label: "Unit Height (in.)" },
  { key: "unitLength", label: "Unit Length (in.)" },
  { key: "unitWeight", label: "Unit Weight (lbs.)" },
  { key: "totalUnits", label: "Total # of Units with these Dimensions" },
];

const PIPE_STACK_FIELDS: FieldDef[] = [
  { key: "pipeStackHeight", label: "Pipe Stack Height (in.)" },
  { key: "pipeStackDiameter", label: "Pipe Stack Diameter (in.)" },
  { key: "heightFirstGuy", label: "Height to First Set of Guy Wires (in.)" },
  { key: "heightOptionalGuy", label: "Height to Optional Set of Guy Wires (in.)" },
  { key: "pipeWallThickness", label: "Pipe Wall Thickness (in.)" },
  { key: "quantity", label: "Quantity of Pipe Stacks" },
];

const AIR_DUCT_FIELDS: FieldDef[] = [
  { key: "widthOfInsulation", label: "Width of Insulation (in.)" },
  { key: "heightOfDuctSupport", label: "Height of Duct Support (in.)" },
  { key: "heightOfInsulation", label: "Height of Insulation (in.)" },
  { key: "ductWidth", label: "Duct Width (in.)" },
  { key: "crossMemberHeight", label: "Cross Member Height (in.)" },
  { key: "overallHeight", label: "Overall Height (in.)" },
  { key: "overallLengthPerSection", label: "Overall Length per Duct Section (in.)" },
  { key: "ductHeight", label: "Duct Height (in.)" },
  { key: "overallWeightPerSection", label: "Overall Weight per Section" },
];

const SNOW_FIELDS: FieldDef[] = [
  { key: "roofSnowLoad", label: "Roof Snow Load (lbs.)" },
  { key: "numRoofSections", label: "# of Roof Sections Receiving Snow Load" },
  { key: "roofPitch", label: "Roof Pitch (e.g. 1/12 – 12/12)" },
  { key: "widthOfSections", label: "Width of Sections (ft-in)" },
  { key: "eaveToRidge", label: "Eave to Ridge Distance (ft-in)" },
];

const GUARDRAIL_FIELDS: FieldDef[] = [
  { key: "totalLength", label: "Total Length of Guardrail Needed (ft-in)" },
  { key: "numberOfGates", label: "Number of Gates Needed" },
  { key: "numberOfCornerSections", label: "Number of Corner Sections" },
];

const LADDER_FIELDS: FieldDef[] = [
  { key: "fixedLadderSeries", label: "Fixed Ladder Series" },
  { key: "walkwayLength", label: "Walkway Length (ft-in)" },
  { key: "lengthOfLadder", label: "Length of Ladder Needed (ft-in)" },
];

const EQUIPMENT_OPTIONS = [
  "HVAC",
  "Pipe Stack",
  "Air Duct",
  "Snow Retention",
  "Guardrail",
  "Roof Ladder",
] as const;

const MAX_REPEAT = 3;
const blank = (): Values => ({});

export default function FMIntakeForm() {
  const [customer, setCustomer] = useState<Values>({});
  const [buildings, setBuildings] = useState<Values[]>([blank()]);
  const [engineering, setEngineering] = useState<Values>({});
  const [equipment, setEquipment] = useState<string[]>([]);
  const [hvacUnits, setHvacUnits] = useState<Values[]>([blank()]);
  const [pipeStacks, setPipeStacks] = useState<Values[]>([blank()]);
  const [airDuct, setAirDuct] = useState<Values>({});
  const [snow, setSnow] = useState<Values>({});
  const [guardrail, setGuardrail] = useState<Values>({});
  const [roofLadder, setRoofLadder] = useState<Values>({});
  const [files, setFiles] = useState<File[]>([]);
  const [comments, setComments] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const has = (key: string) => equipment.includes(key);
  const toggleEquipment = (key: string) =>
    setEquipment((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]));

  // Generic helpers for the repeating array sections.
  const updateItem = (
    setter: React.Dispatch<React.SetStateAction<Values[]>>,
    idx: number,
    key: string,
    value: string
  ) => setter((cur) => cur.map((it, i) => (i === idx ? { ...it, [key]: value } : it)));
  const addItem = (setter: React.Dispatch<React.SetStateAction<Values[]>>) =>
    setter((cur) => (cur.length >= MAX_REPEAT ? cur : [...cur, blank()]));
  const removeItem = (setter: React.Dispatch<React.SetStateAction<Values[]>>, idx: number) =>
    setter((cur) => (cur.length <= 1 ? cur : cur.filter((_, i) => i !== idx)));

  const customerFields: FieldDef[] = [
    { key: "firstName", label: "First Name" },
    { key: "lastName", label: "Last Name" },
    { key: "phone", label: "Phone Number" },
    { key: "email", label: "Email" },
    { key: "companyName", label: "Company Name" },
    { key: "projectName", label: "Project Name / Building Name or #", full: true },
    { key: "projectAddress", label: "Project / Building Address", full: true },
    { key: "latLong", label: "Project Latitude and Longitude", full: true },
    { key: "requestedDeliveryDate", label: "Requested Delivery Date", kind: "date" },
    { key: "engineeringStampNeeded", label: "Engineering Stamp Needed?", kind: "yesno" },
    { key: "fmInsured", label: "FM Insured?", kind: "yesno" },
    ...(customer.fmInsured === "Yes"
      ? [{ key: "fmIndexRecord", label: "FM Index-Record #" } as FieldDef]
      : []),
  ];

  function repeatBlock(
    title: string,
    noun: string,
    items: Values[],
    setter: React.Dispatch<React.SetStateAction<Values[]>>,
    fields: FieldDef[]
  ) {
    return (
      <div className="space-y-4">
        {items.map((item, idx) => (
          <div key={idx} className="rounded-xl border border-[var(--border-default)] p-3 sm:p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-[var(--anchor-deep)]">
                {noun} {idx + 1}
              </span>
              {items.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeItem(setter, idx)}
                  className="text-xs font-semibold text-red-600 hover:underline"
                >
                  Remove
                </button>
              )}
            </div>
            <FieldGrid
              fields={fields}
              values={item}
              onChange={(k, v) => updateItem(setter, idx, k, v)}
            />
          </div>
        ))}
        {items.length < MAX_REPEAT && (
          <Button variant="secondary" onClick={() => addItem(setter)} className="text-sm">
            + Add another {noun.toLowerCase()}
          </Button>
        )}
        <p className="text-[11px] text-[var(--anchor-gray)]">Up to {MAX_REPEAT} {title}.</p>
      </div>
    );
  }

  async function submit() {
    setError(null);
    if (!String(customer.firstName || "").trim() || !String(customer.lastName || "").trim()) {
      setError("First and last name are required.");
      return;
    }
    if (!String(customer.email || "").trim() && !String(customer.phone || "").trim()) {
      setError("Enter an email or a phone number.");
      return;
    }
    const payload = {
      customer,
      buildings,
      engineering,
      equipment,
      hvac: has("HVAC") ? hvacUnits : [],
      pipeStacks: has("Pipe Stack") ? pipeStacks : [],
      airDuct: has("Air Duct") ? airDuct : null,
      snowRetention: has("Snow Retention") ? snow : null,
      guardrail: has("Guardrail") ? guardrail : null,
      roofLadder: has("Roof Ladder") ? roofLadder : null,
      additionalComments: comments,
    };
    setSaving(true);
    try {
      const fd = new FormData();
      fd.append("payload", JSON.stringify(payload));
      for (const f of files) fd.append("files", f);
      const res = await fetch("/api/fm-intake", { method: "POST", body: fd });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(json?.error || "Failed to submit. Please try again.");
        return;
      }
      if (json?.attachment_error) {
        setError(`Saved, but some files didn't upload: ${json.attachment_error}`);
      }
      setSubmitted(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (e: any) {
      setError(e?.message || "Failed to submit. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (submitted) return <SubmittedScreen />;

  return (
    <div className="space-y-4">
      {error && (
        <Card className="border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</Card>
      )}

      <Section
        title="Section 1: Customer Information"
        description="Complete all required fields. First and last name plus an email or phone are required."
      >
        <FieldGrid
          fields={customerFields}
          values={customer}
          onChange={(k, v) => setCustomer((c) => ({ ...c, [k]: v }))}
        />
      </Section>

      <Section
        title="Section 2: Existing Roof Details"
        description="Enter the roof details for each building. Add up to 3 buildings."
      >
        {repeatBlock("buildings", "Building", buildings, setBuildings, BUILDING_FIELDS)}
      </Section>

      <Section
        title="Section 3: Engineering Criteria"
        description="If known — AP Engineering will also review."
      >
        <FieldGrid
          fields={ENGINEERING_FIELDS}
          values={engineering}
          onChange={(k, v) => setEngineering((s) => ({ ...s, [k]: v }))}
        />
        <div className="mt-4 flex flex-wrap gap-2">
          <LinkButton href="https://ascehazardtool.org/">ASCE Hazard Tool</LinkButton>
          <LinkButton href="https://www.fm.com/resources/fm-data-sheets">FM Data Sheets</LinkButton>
        </div>
      </Section>

      <Section
        title="Section 4: Roof-Mounted Equipment Scope"
        description="Select all equipment that applies. The matching sections below will appear."
      >
        <div className="flex flex-wrap gap-2">
          {EQUIPMENT_OPTIONS.map((opt) => {
            const active = has(opt);
            return (
              <button
                key={opt}
                type="button"
                onClick={() => toggleEquipment(opt)}
                className={`rounded-full px-3.5 py-2 text-sm font-semibold transition ${
                  active
                    ? "bg-[var(--anchor-deep)] text-white"
                    : "border border-[var(--border-default)] bg-white text-[var(--anchor-deep)] hover:bg-[var(--anchor-mint)]/40"
                }`}
              >
                {active ? "✓ " : ""}
                {opt}
              </button>
            );
          })}
        </div>
      </Section>

      {has("HVAC") && (
        <Section title="Section 5: HVAC – Existing Unit Details" description="Add up to 3 unit sizes.">
          {repeatBlock("units", "Unit", hvacUnits, setHvacUnits, HVAC_FIELDS)}
        </Section>
      )}

      {has("Pipe Stack") && (
        <Section
          title="Section 6: Pipe Stack Securement – Critical Dimensions"
          description="If stacks differ, add up to 3 sets of dimensions."
        >
          {repeatBlock("pipe stacks", "Pipe stack", pipeStacks, setPipeStacks, PIPE_STACK_FIELDS)}
        </Section>
      )}

      {has("Air Duct") && (
        <Section title="Section 7: Air Duct Securement">
          <FieldGrid
            fields={AIR_DUCT_FIELDS}
            values={airDuct}
            onChange={(k, v) => setAirDuct((s) => ({ ...s, [k]: v }))}
          />
        </Section>
      )}

      {has("Snow Retention") && (
        <Section
          title="Section 8: Snow Retention System – Critical Information"
          description="Please add a drawing, roof plan, or marked satellite view in the photos step to show where snow retention should go."
        >
          <FieldGrid
            fields={SNOW_FIELDS}
            values={snow}
            onChange={(k, v) => setSnow((s) => ({ ...s, [k]: v }))}
          />
        </Section>
      )}

      {has("Guardrail") && (
        <Section title="Section 9: AP x Kattsafe – Roof Mounted Guardrail Needs">
          <FieldGrid
            fields={GUARDRAIL_FIELDS}
            values={guardrail}
            onChange={(k, v) => setGuardrail((s) => ({ ...s, [k]: v }))}
          />
        </Section>
      )}

      {has("Roof Ladder") && (
        <Section title="Section 10: AP x Kattsafe – Fixed Roof Ladder Needs">
          <FieldGrid
            fields={LADDER_FIELDS}
            values={roofLadder}
            onChange={(k, v) => setRoofLadder((s) => ({ ...s, [k]: v }))}
          />
        </Section>
      )}

      <Section
        title="Customer Images – Site and Equipment Photos"
        description="Please include a site satellite/aerial image with marked areas, plus equipment photos. You can attach images and product data sheets (PDF)."
      >
        <div className="mb-3">
          <LinkButton href="https://www.google.com/maps">Open Google Maps</LinkButton>
        </div>
        <label className={labelCls}>Site and equipment photos / data sheets</label>
        <input
          type="file"
          multiple
          accept="image/*,application/pdf"
          onChange={(e) => setFiles(Array.from(e.target.files || []))}
          className="mt-1 block w-full text-sm text-[var(--anchor-gray)] file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--anchor-deep)] file:px-3 file:py-2 file:text-sm file:font-semibold file:text-white"
        />
        {files.length > 0 && (
          <p className="mt-1 text-[11px] text-[var(--anchor-gray)]">
            {files.length} file{files.length === 1 ? "" : "s"} selected.
          </p>
        )}
        <p className="mt-1 text-[11px] text-[var(--anchor-gray)]">
          Accepted: JPG, PNG, WEBP, GIF, HEIC, PDF. Up to 25 files, 20 MB each.
        </p>

        <label className="mt-4 block">
          <span className={labelCls}>Additional comments / notes?</span>
          <Textarea
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            rows={4}
            className="mt-1 w-full text-sm"
            placeholder="Anything else the Anchor team should know…"
          />
        </label>
      </Section>

      <div className="flex items-center gap-3 pb-4">
        <Button onClick={submit} disabled={saving} className="text-sm">
          {saving ? "Submitting…" : "Submit intake form"}
        </Button>
        <span className="text-xs text-[var(--anchor-gray)]">
          Required: name + email or phone. Everything else is optional.
        </span>
      </div>
    </div>
  );
}

// "Form submitted!" confirmation, mirroring the PDF's closing screen.
function SubmittedScreen() {
  const steps = [
    { tag: "Complete ✅", title: "Form Submission" },
    { tag: "1–2 Business Days", title: "Anchor Products Review" },
    { tag: "3–5 Business Days", title: "Anchor Products Will Contact You" },
  ];
  return (
    <Card className="p-6 sm:p-8">
      <h1 className="text-2xl font-bold text-[var(--anchor-deep)] sm:text-3xl">Form submitted!</h1>
      <p className="mt-2 text-sm text-[var(--anchor-gray)]">
        Thank you. Anchor Products will review your submission, confirm receipt within 1–2 business
        days, and contact you regarding design or product recommendations.
      </p>

      <div className="mt-4 text-sm">
        <p className="font-semibold text-[var(--anchor-deep)]">For any questions, please contact us:</p>
        <p className="mt-1 text-[var(--anchor-gray)]">
          Phone:{" "}
          <a href="tel:8885752131" className="font-semibold text-[var(--anchor-green)] underline">
            (888) 575-2131
          </a>
        </p>
        <p className="text-[var(--anchor-gray)]">
          Website:{" "}
          <a
            href="https://www.anchorp.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-[var(--anchor-green)] underline"
          >
            https://www.anchorp.com/
          </a>
        </p>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-2 sm:grid-cols-3">
        {steps.map((s) => (
          <div
            key={s.title}
            className="rounded-xl bg-[var(--anchor-deep)] px-4 py-4 text-center text-white"
          >
            <div className="text-[11px] font-semibold uppercase tracking-wide text-[var(--anchor-mint)]">
              {s.tag}
            </div>
            <div className="mt-1 text-sm font-bold leading-snug">{s.title}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}
