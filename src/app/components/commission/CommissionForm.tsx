"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import Button from "@/app/components/ui/Button";
import { Card } from "@/app/components/ui/Card";
import { Alert } from "@/app/components/ui/Alert";
import { Input, Select, Textarea } from "@/app/components/ui/Field";
import { MultiSelect } from "@/app/components/ui/MultiSelect";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { ROOF_BRANDS } from "@/lib/roofing/options";
import { US_STATES } from "@/lib/sales/states";
import { SOLUTION_CATALOG, SOLUTION_CATEGORIES } from "@/lib/solutions/solutionCatalog";
import { trackEvent } from "@/lib/analytics/track";

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

const OTHER_ITEMS = SOLUTION_CATALOG.map((s) => s.label);

const OTHER_ITEMS_SECTIONS = SOLUTION_CATEGORIES.map((category) => {
  const items = SOLUTION_CATALOG.filter((s) => s.category === category.key);
  return {
    heading: category.label,
    options: items.map((s) => s.label),
    comingSoon: items.length > 0 && items.every((s) => s.comingSoon),
  };
}).filter((sec) => sec.options.length > 0);

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
  const { t } = useTranslation();
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
        setForm((f) => ({ ...f, company_placing_order: resolved.company! }));
      }
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

      trackEvent("commission_submitted", { claimId: json?.id ?? null });
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
        <div className="text-sm font-semibold text-black">{t("commissionClaimFormTitle")}</div>
        <div className="mt-1 text-[12px] text-[var(--anchor-gray)]">
          {t("commissionFormDesc")}{" "}
          <span className="font-semibold text-black">{t("lateRequestsNote")}</span>
        </div>

        {profile && (
          <div className="mt-4 rounded-[14px] border border-black/10 bg-[var(--surface-soft)] p-4">
            <div className="text-sm font-semibold text-black">{t("repFirmIndividual")}</div>
            <div className="mt-2 grid gap-1 text-sm text-[var(--anchor-gray)]">
              {profile.full_name && <div><span className="font-medium text-black">{profile.full_name}</span></div>}
              {profile.company && <div>{profile.company}</div>}
              {profile.phone && <div>{profile.phone}</div>}
              {profile.email && <div>{profile.email}</div>}
            </div>
            <div className="mt-2 text-[11px] text-black/40">{t("yourContactInfo")}</div>
          </div>
        )}

        <div className="mt-5 grid gap-5">
          <label className="flex items-start gap-3 rounded-[14px] border border-black/10 bg-[var(--surface-soft)] p-4 cursor-pointer">
            <input type="checkbox" checked={form.certified} onChange={(e) => update("certified", e.target.checked)} className="mt-0.5 shrink-0" />
            <span className="text-sm">{t("certifyText")}</span>
          </label>

          <div className="rounded-[14px] border border-black/10 bg-[var(--surface-soft)] p-4">
            <div className="grid gap-4">
              <div>
                <div className="mb-2 text-sm">{t("unawareQuestion")}</div>
                <div className="flex gap-4 text-sm">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="unaware_other_salesperson" value="yes" checked={form.unaware_other_salesperson === "yes"} onChange={() => update("unaware_other_salesperson", "yes")} />
                    <span className="font-semibold">{t("yes")}</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="unaware_other_salesperson" value="no" checked={form.unaware_other_salesperson === "no"} onChange={() => update("unaware_other_salesperson", "no")} />
                    <span className="font-semibold">{t("no")}</span>
                  </label>
                </div>
              </div>
              <div>
                <div className="mb-2 text-sm">{t("specifierQuestion")}</div>
                <div className="flex gap-4 text-sm">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="specifier_assisted" value="yes" checked={form.specifier_assisted === "yes"} onChange={() => update("specifier_assisted", "yes")} />
                    <span className="font-semibold">{t("yes")}</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="specifier_assisted" value="no" checked={form.specifier_assisted === "no"} onChange={() => update("specifier_assisted", "no")} />
                    <span className="font-semibold">{t("no")}</span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          <label className="grid gap-1 text-sm">
            <span className="font-semibold">{t("estimatedOrderDate")}</span>
            <Input type="date" value={form.estimated_order_date} onChange={(e) => update("estimated_order_date", e.target.value)} className="min-h-[44px] w-full px-3 py-2 text-sm" />
          </label>

          {!profile?.company && (
            <label className="grid gap-1 text-sm">
              <span className="font-semibold">{t("companyPlacingOrder")}</span>
              <Input value={form.company_placing_order} onChange={(e) => update("company_placing_order", e.target.value)} className="h-10 px-3 text-sm" placeholder={t("companyPlaceholder")} />
            </label>
          )}

          <div className="grid grid-cols-3 gap-3">
            <label className="col-span-2 grid gap-1 text-sm">
              <span className="font-semibold">{t("shipCity")}</span>
              <Input value={form.order_city} onChange={(e) => update("order_city", e.target.value)} className="h-10 px-3 text-sm" placeholder={t("cityPlain")} />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-semibold">{t("shipState")}</span>
              <Select value={form.order_state} onChange={(e) => update("order_state", e.target.value)} className="h-10 px-3 text-sm">
                <option value="">{t("selectState")}</option>
                {US_STATES.map((s) => (<option key={s} value={s}>{s}</option>))}
              </Select>
            </label>
          </div>

          <label className="grid gap-1 text-sm">
            <span className="font-semibold">{t("uAnchorsOrdered")}</span>
            <MultiSelect options={U_ANCHOR_OPTIONS} value={form.u_anchors_ordered} onChange={(v) => update("u_anchors_ordered", v)} placeholder={t("selectUAnchors")} />
          </label>

          <label className="grid gap-1 text-sm">
            <span className="font-semibold">{t("qty")}</span>
            <Input value={form.qty} onChange={(e) => update("qty", e.target.value)} className="h-10 px-3 text-sm" placeholder={t("qty")} />
          </label>

          <label className="grid gap-1 text-sm">
            <span className="font-semibold">{t("roofBrand")}</span>
            <MultiSelect options={ROOF_BRANDS} value={form.roof_brand} onChange={(v) => update("roof_brand", v)} placeholder={t("selectBrands")} />
          </label>

          <label className="grid gap-1 text-sm">
            <span className="font-semibold">{t("otherItemsOrdered")}</span>
            <MultiSelect options={OTHER_ITEMS} sections={OTHER_ITEMS_SECTIONS} value={form.other_items} onChange={(v) => update("other_items", v)} placeholder={t("selectSolutions")} />
          </label>

          <label className="grid gap-1 text-sm">
            <span className="font-semibold">{t("shipToAddress")}</span>
            <Input value={form.ship_to_address} onChange={(e) => update("ship_to_address", e.target.value)} className="h-10 px-3 text-sm" placeholder={t("streetAddress")} />
          </label>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <label className="col-span-2 grid gap-1 text-sm">
              <span className="font-semibold">{t("shipCity")}</span>
              <Input value={form.ship_city} onChange={(e) => update("ship_city", e.target.value)} className="h-10 px-3 text-sm" placeholder={t("cityPlain")} />
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-semibold">{t("shipState")}</span>
              <Select value={form.ship_state} onChange={(e) => update("ship_state", e.target.value)} className="h-10 px-3 text-sm">
                <option value="">{t("selectState")}</option>
                {US_STATES.map((s) => (<option key={s} value={s}>{s}</option>))}
              </Select>
            </label>
            <label className="grid gap-1 text-sm">
              <span className="font-semibold">{t("zipCode")}</span>
              <Input value={form.ship_zip} onChange={(e) => update("ship_zip", e.target.value)} className="h-10 px-3 text-sm" placeholder={t("zipPlain")} />
            </label>
          </div>

          <label className="grid gap-1 text-sm">
            <span className="font-semibold">{t("projectDescription")}</span>
            <Textarea value={form.project_description} onChange={(e) => update("project_description", e.target.value)} className="min-h-[120px] px-3 py-2 text-sm" placeholder={t("describeProject")} />
          </label>
        </div>

        {error && <Alert className="mt-4" tone="error">{error}</Alert>}
        {success && <Alert className="mt-4" tone="success">{t("commissionSubmitted")}</Alert>}

        <div className="mt-5 flex gap-2">
          <Button type="submit" disabled={submitting} className="px-4 py-2 text-[12px]" variant="primary">
            {submitting ? t("submitting") : t("submitCommissionClaim")}
          </Button>
        </div>
      </Card>
    </form>
  );
}
