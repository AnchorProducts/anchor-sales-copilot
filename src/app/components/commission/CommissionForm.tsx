"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import Button from "@/app/components/ui/Button";
import { Card } from "@/app/components/ui/Card";
import { Alert } from "@/app/components/ui/Alert";
import { Input, Select, Textarea } from "@/app/components/ui/Field";
import { MultiSelect } from "@/app/components/ui/MultiSelect";

type UserProfile = {
  full_name: string | null;
  company: string | null;
  phone: string | null;
  email: string | null;
};

type FormState = {
  certified: boolean;
  unaware_other_salesperson: "yes" | "no" | "";
  specifier_assisted: "yes" | "no" | "";
  estimated_order_date: string;
  company_placing_order: string;
  order_city: string;
  order_state: string;
  u_anchors_ordered: string[];
  qty: string;
  roof_brand: string[];
  other_items: string[];
  ship_to_address: string;
  ship_city: string;
  ship_state: string;
  ship_zip: string;
  project_description: string;
};

const U_ANCHOR_OPTIONS = [
  "U2000 KEE",
  "U2000 PVC",
  "U2000 TPO",
  "U2200 Plate",
  "U2400 EPDM",
  "U2400 KEE",
  "U2400 PVC",
  "U2400 TPO",
  "U2600 APP",
  "U2600 SBS",
  "U2600 SBS Torch",
  "U2800 Coatings",
  "U3200 Plate",
  "U3400 EPDM",
  "U3400 KEE",
  "U3400 PVC",
  "U3400 TPO",
  "U3600 APP",
  "U3600 SBS",
  "U3600 SBS Torch",
  "U3800 Coatings",
];

const ROOF_BRANDS = ["Carlisle", "GAF", "IB", "Firestone", "Johns Manville", "Versico", "Other"];

const OTHER_ITEMS = [
  "Solar / PV Racking",
  "Snow Retention",
  "Attached Pipe-Frame (Roof-Mounted H-Frame)",
  "Duct Securement",
  "HVAC / RTU Securement",
  "Elevated Stack (Roof-Mounted)",
  "Elevated Stack (Wall / Parapet)",
  "Roof Box",
  "Wall / Parapet Box",
  "Roof Pipe Support",
  "Roof Stairs / Walkways",
  "Roof Guardrail",
  "Roof Ladder",
  "Equipment Screen",
  "Signage",
  "Weather Station",
  "Light Mount",
  "Camera Mount",
  "Electrical Disconnect",
  "Guy Wire Securement",
];

const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME",
  "MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA",
  "RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY",
];

const INITIAL_FORM: FormState = {
  certified: false,
  unaware_other_salesperson: "",
  specifier_assisted: "",
  estimated_order_date: "",
  company_placing_order: "",
  order_city: "",
  order_state: "",
  u_anchors_ordered: [],
  qty: "",
  roof_brand: [],
  other_items: [],
  ship_to_address: "",
  ship_city: "",
  ship_state: "",
  ship_zip: "",
  project_description: "",
};

export default function CommissionForm() {
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

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
      setProfile(
        data
          ? {
              full_name: (data as any).full_name || null,
              company: (data as any).company || null,
              phone: (data as any).phone || null,
              email: (data as any).email || user.email || null,
            }
          : { full_name: null, company: null, phone: null, email: user.email || null }
      );
    })();
  }, [supabase]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }


  function validate() {
    if (!form.certified) return "Please certify that you are the independent salesperson for this order.";
    if (!form.unaware_other_salesperson) return "Please answer the first YES/NO question.";
    if (!form.specifier_assisted) return "Please answer the second YES/NO question.";
    if (!form.company_placing_order.trim()) return "Company placing order is required.";
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
      const res = await fetch("/api/commission", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          certified: form.certified,
          unaware_other_salesperson: form.unaware_other_salesperson,
          specifier_assisted: form.specifier_assisted,
          estimated_order_date: form.estimated_order_date || null,
          company_placing_order: form.company_placing_order,
          order_city: form.order_city,
          order_state: form.order_state,
          u_anchors_ordered: form.u_anchors_ordered.join(", "),
          qty: form.qty,
          roof_brand: form.roof_brand.join(", "),
          other_items: form.other_items.join(", "),
          ship_to_address: form.ship_to_address,
          ship_city: form.ship_city,
          ship_state: form.ship_state,
          ship_zip: form.ship_zip,
          project_description: form.project_description,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json?.error || "Failed to submit claim.");
        setSubmitting(false);
        return;
      }

      setSuccess("Commission claim submitted successfully.");
      setForm(INITIAL_FORM);
    } catch (err: any) {
      setError(err?.message || "Failed to submit claim.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <Card className="border-t-4 border-t-[var(--anchor-green)] p-5">
        <div className="text-sm font-semibold text-black">Commission Claim Form</div>
        <div className="mt-1 text-[12px] text-[var(--anchor-gray)]">
          This form must be completed and submitted prior to order shipment for any commission to be calculated.{" "}
          <span className="font-semibold text-black">Late requests will not be considered.</span>
        </div>

        {/* Rep info – auto-populated from registration */}
        {profile && (
          <div className="mt-4 rounded-[14px] border border-black/10 bg-[var(--surface-soft)] p-4">
            <div className="text-sm font-semibold text-black">Rep Firm / Individual</div>
            <div className="mt-2 grid gap-1 text-sm text-[var(--anchor-gray)]">
              {profile.full_name && <div><span className="font-medium text-black">{profile.full_name}</span></div>}
              {profile.company && <div>{profile.company}</div>}
              {profile.phone && <div>{profile.phone}</div>}
              {profile.email && <div>{profile.email}</div>}
            </div>
            <div className="mt-2 text-[11px] text-black/40">
              Your contact information is pulled from your account. Update it in your profile settings.
            </div>
          </div>
        )}

        <div className="mt-5 grid gap-5">
          {/* Certification */}
          <label className="flex items-start gap-3 rounded-[14px] border border-black/10 bg-[var(--surface-soft)] p-4 cursor-pointer">
            <input
              type="checkbox"
              checked={form.certified}
              onChange={(e) => update("certified", e.target.checked)}
              className="mt-0.5 shrink-0"
            />
            <span className="text-sm">
              I hereby certify that I am the independent salesperson that was the primary point of contact for the below described order.
            </span>
          </label>

          {/* YES / NO questions */}
          <div className="rounded-[14px] border border-black/10 bg-[var(--surface-soft)] p-4">
            <div className="grid gap-4">
              <div>
                <div className="mb-2 text-sm">I am unaware of any other salesperson or entity that had a role in securing the sale.</div>
                <div className="flex gap-4 text-sm">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="unaware_other_salesperson"
                      value="yes"
                      checked={form.unaware_other_salesperson === "yes"}
                      onChange={() => update("unaware_other_salesperson", "yes")}
                    />
                    <span className="font-semibold">YES</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="unaware_other_salesperson"
                      value="no"
                      checked={form.unaware_other_salesperson === "no"}
                      onChange={() => update("unaware_other_salesperson", "no")}
                    />
                    <span className="font-semibold">NO</span>
                  </label>
                </div>
              </div>

              <div>
                <div className="mb-2 text-sm">The specifier was assisted by separate sales efforts other than my own.</div>
                <div className="flex gap-4 text-sm">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="specifier_assisted"
                      value="yes"
                      checked={form.specifier_assisted === "yes"}
                      onChange={() => update("specifier_assisted", "yes")}
                    />
                    <span className="font-semibold">YES</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="specifier_assisted"
                      value="no"
                      checked={form.specifier_assisted === "no"}
                      onChange={() => update("specifier_assisted", "no")}
                    />
                    <span className="font-semibold">NO</span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Order details row 1 */}
          <label className="grid gap-1 text-sm">
            <span className="font-semibold">Estimated Order Date</span>
            <Input
              type="date"
              value={form.estimated_order_date}
              onChange={(e) => update("estimated_order_date", e.target.value)}
              className="h-10 px-3 text-sm"
            />
          </label>

          <label className="grid gap-1 text-sm">
            <span className="font-semibold">Company Placing Order *</span>
            <Input
              value={form.company_placing_order}
              onChange={(e) => update("company_placing_order", e.target.value)}
              className="h-10 px-3 text-sm"
              placeholder="Company name"
            />
          </label>

          <div className="grid grid-cols-3 gap-3">
            <label className="col-span-2 grid gap-1 text-sm">
              <span className="font-semibold">City</span>
              <Input
                value={form.order_city}
                onChange={(e) => update("order_city", e.target.value)}
                className="h-10 px-3 text-sm"
                placeholder="City"
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-semibold">State</span>
              <Select
                value={form.order_state}
                onChange={(e) => update("order_state", e.target.value)}
                className="h-10 px-3 text-sm"
              >
                <option value="">Select state</option>
                {US_STATES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </Select>
            </label>
          </div>

          <label className="grid gap-1 text-sm">
            <span className="font-semibold">U-Anchor(s) Ordered</span>
            <MultiSelect
              options={U_ANCHOR_OPTIONS}
              value={form.u_anchors_ordered}
              onChange={(v) => update("u_anchors_ordered", v)}
              placeholder="Select U-Anchor model(s)"
            />
          </label>

          <label className="grid gap-1 text-sm">
            <span className="font-semibold">Qty</span>
            <Input
              value={form.qty}
              onChange={(e) => update("qty", e.target.value)}
              className="h-10 px-3 text-sm"
              placeholder="Qty"
            />
          </label>

          <label className="grid gap-1 text-sm">
            <span className="font-semibold">Roof Brand</span>
            <MultiSelect
              options={ROOF_BRANDS}
              value={form.roof_brand}
              onChange={(v) => update("roof_brand", v)}
              placeholder="Select brand(s)"
            />
          </label>

          <label className="grid gap-1 text-sm">
            <span className="font-semibold">Other Items Being Ordered</span>
            <MultiSelect
              options={OTHER_ITEMS}
              value={form.other_items}
              onChange={(v) => update("other_items", v)}
              placeholder="Select solution(s)"
            />
          </label>

          {/* Ship-to */}
          <label className="grid gap-1 text-sm">
            <span className="font-semibold">Ship To Address</span>
            <Input
              value={form.ship_to_address}
              onChange={(e) => update("ship_to_address", e.target.value)}
              className="h-10 px-3 text-sm"
              placeholder="Street address"
            />
          </label>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <label className="col-span-2 grid gap-1 text-sm">
              <span className="font-semibold">City</span>
              <Input
                value={form.ship_city}
                onChange={(e) => update("ship_city", e.target.value)}
                className="h-10 px-3 text-sm"
                placeholder="City"
              />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-semibold">State</span>
              <Select
                value={form.ship_state}
                onChange={(e) => update("ship_state", e.target.value)}
                className="h-10 px-3 text-sm"
              >
                <option value="">Select state</option>
                {US_STATES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </Select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-semibold">Zip Code</span>
              <Input
                value={form.ship_zip}
                onChange={(e) => update("ship_zip", e.target.value)}
                className="h-10 px-3 text-sm"
                placeholder="Zip"
              />
            </label>
          </div>

          <label className="grid gap-1 text-sm">
            <span className="font-semibold">Project Description</span>
            <Textarea
              value={form.project_description}
              onChange={(e) => update("project_description", e.target.value)}
              className="min-h-[120px] px-3 py-2 text-sm"
              placeholder="Describe the project..."
            />
          </label>
        </div>

        {error && <Alert className="mt-4" tone="error">{error}</Alert>}
        {success && <Alert className="mt-4" tone="success">{success}</Alert>}

        <div className="mt-5 flex gap-2">
          <Button
            type="submit"
            disabled={submitting}
            className="px-4 py-2 text-[12px]"
            variant="primary"
          >
            {submitting ? "Submitting…" : "Submit Claim"}
          </Button>
        </div>
      </Card>
    </form>
  );
}
