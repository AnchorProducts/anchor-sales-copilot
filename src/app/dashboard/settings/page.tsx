"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { AppNavbar } from "@/app/components/ui/AppNavbar";
import { Card } from "@/app/components/ui/Card";
import { Input, Select } from "@/app/components/ui/Field";
import { US_STATES } from "@/lib/sales/states";
import { Alert } from "@/app/components/ui/Alert";
import Button from "@/app/components/ui/Button";
import { useTranslation } from "@/lib/i18n/useTranslation";

export const dynamic = "force-dynamic";

type Theme = "light" | "dark" | "system";

function applyTheme(t: Theme) {
  const resolved =
    t === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"
      : t;
  document.documentElement.setAttribute("data-theme", resolved);
  localStorage.setItem("anchor-theme", t);
}

export default function SettingsPage() {
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const { t } = useTranslation();

  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [saveMsg, setSaveMsg]   = useState<string | null>(null);
  const [saveErr, setSaveErr]   = useState<string | null>(null);

  // Profile fields
  const [fullName, setFullName] = useState("");
  const [company, setCompany]   = useState("");
  const [phone, setPhone]       = useState("");
  const [email, setEmail]       = useState("");
  const [serviceState, setServiceState] = useState("");
  const [serviceZip, setServiceZip]     = useState("");

  // NetSuite sync (internal reps only)
  const [isInternalRep, setIsInternalRep] = useState(false);
  const [syncMode, setSyncMode]           = useState<"manual" | "automatic">("manual");
  const [savingSyncMode, setSavingSyncMode] = useState(false);

  // Preferences
  const [theme, setTheme]       = useState<Theme>("light");

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: ud } = await supabase.auth.getUser();
      if (!alive) return;
      if (!ud.user) { router.replace("/"); return; }

      setEmail(ud.user.email || "");

      const { data: prof } = await supabase
        .from("profiles")
        .select("full_name,company,phone,service_state,service_zip,role")
        .eq("id", ud.user.id)
        .maybeSingle();

      if (!alive) return;
      if (prof) {
        setFullName((prof as any).full_name || "");
        setCompany((prof as any).company   || "");
        setPhone((prof as any).phone       || "");
        setServiceState((prof as any).service_state || "");
        setServiceZip((prof as any).service_zip || "");
        const role = String((prof as any).role || "");
        setIsInternalRep(role === "admin" || role === "anchor_rep");
      }

      // Fetched separately so an un-migrated DB (missing column) can't blank the
      // whole profile load and hide the toggle. Defaults to manual on error.
      const { data: syncProf } = await supabase
        .from("profiles")
        .select("netsuite_sync_mode")
        .eq("id", ud.user.id)
        .maybeSingle();
      if (!alive) return;
      if (syncProf) {
        setSyncMode((syncProf as any).netsuite_sync_mode === "automatic" ? "automatic" : "manual");
      }

      // Load theme preference from localStorage
      try {
        setTheme((localStorage.getItem("anchor-theme") || "light") as Theme);
      } catch {}

      setLoading(false);
    })();
    return () => { alive = false; };
  }, [supabase, router]);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveMsg(null);
    setSaveErr(null);

    const { data: ud } = await supabase.auth.getUser();
    if (!ud.user) { setSaving(false); router.replace("/"); return; }

    // Texas is split by ZIP between reps, so a TX service area needs a ZIP for
    // us to show the right Anchor rep.
    const zip = serviceZip.replace(/\D/g, "").slice(0, 5);
    if (serviceState.trim().toUpperCase() === "TX" && zip.length < 5) {
      setSaving(false);
      setSaveErr("Enter your 5-digit ZIP code for Texas so we can match you to the right rep.");
      return;
    }

    const { error } = await supabase
      .from("profiles")
      .update({
        full_name: fullName.trim() || null,
        company:   company.trim()  || null,
        phone:     phone.trim()    || null,
        service_state: serviceState.trim() || null,
        service_zip: zip || null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", ud.user.id);

    setSaving(false);
    if (error) { setSaveErr(error.message); }
    else        { setSaveMsg("Profile updated."); setTimeout(() => setSaveMsg(null), 3000); }
  }

  async function changeSyncMode(mode: "manual" | "automatic") {
    if (mode === syncMode || savingSyncMode) return;
    const prev = syncMode;
    setSyncMode(mode); // optimistic
    setSavingSyncMode(true);
    setSaveErr(null);

    const { data: ud } = await supabase.auth.getUser();
    if (!ud.user) { setSavingSyncMode(false); router.replace("/"); return; }

    const { error } = await supabase
      .from("profiles")
      .update({ netsuite_sync_mode: mode, updated_at: new Date().toISOString() })
      .eq("id", ud.user.id);

    setSavingSyncMode(false);
    if (error) {
      setSyncMode(prev); // roll back
      setSaveErr(error.message);
    } else {
      setSaveMsg("Sync preference updated.");
      setTimeout(() => setSaveMsg(null), 3000);
    }
  }

  function handleThemeChange(t: Theme) {
    setTheme(t);
    applyTheme(t);
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/");
    router.refresh();
  }

  if (loading) {
    return (
      <main className="ds-page">
        <AppNavbar title={t("profileSettings")} menuItems={[{ label: t("dashboard"), href: "/dashboard" }]} />
        <div className="ds-container py-10 text-sm text-[var(--anchor-gray)]">{t("loading")}</div>
      </main>
    );
  }

  return (
    <main className="ds-page">
      <AppNavbar title={t("profileSettings")} menuItems={[{ label: t("dashboard"), href: "/dashboard" }]} />

      <div className="ds-container py-6 pb-[calc(2rem+env(safe-area-inset-bottom))] sm:py-10">
        <div className="mx-auto max-w-xl space-y-5">

          {/* ── Profile Information ──────────────────────────────── */}
          <Card data-tutorial="settings-profile" className="border-t-4 border-t-[var(--anchor-green)] p-5">
            <div className="text-sm font-semibold text-black">{t("profileInformation")}</div>
            <div className="mt-1 text-[12px] text-[var(--anchor-gray)]">{t("profileInformationDesc")}</div>

            <form onSubmit={saveProfile} className="mt-4 grid gap-4">
              <label className="grid gap-1.5 text-sm">
                <span className="font-semibold">{t("fullName")}</span>
                <Input value={fullName} onChange={(e) => setFullName(e.target.value)} className="h-11 px-3 text-sm" placeholder={t("fullNamePlaceholder")} />
              </label>

              <label className="grid gap-1.5 text-sm">
                <span className="font-semibold">{t("company")}</span>
                <Input value={company} onChange={(e) => setCompany(e.target.value)} className="h-11 px-3 text-sm" placeholder={t("companyPlaceholder")} />
              </label>

              <label className="grid gap-1.5 text-sm">
                <span className="font-semibold">{t("phone")}</span>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="h-11 px-3 text-sm" placeholder={t("phonePlaceholder")} type="tel" />
              </label>

              <label className="grid gap-1.5 text-sm">
                <span className="font-semibold">{t("serviceArea")}</span>
                <Select value={serviceState} onChange={(e) => setServiceState(e.target.value)} className="h-11 px-3 text-sm">
                  <option value="">{t("serviceAreaPlaceholder")}</option>
                  {US_STATES.map((s) => (<option key={s} value={s}>{s}</option>))}
                </Select>
                <span className="text-[11px] text-[var(--anchor-gray)]">{t("serviceAreaHint")}</span>
              </label>

              {serviceState.trim().toUpperCase() === "TX" && (
                <label className="grid gap-1.5 text-sm">
                  <span className="font-semibold">ZIP code</span>
                  <Input
                    value={serviceZip}
                    onChange={(e) => setServiceZip(e.target.value)}
                    className="h-11 px-3 text-sm"
                    placeholder="e.g. 77001"
                    inputMode="numeric"
                    maxLength={5}
                  />
                  <span className="text-[11px] text-[var(--anchor-gray)]">
                    Texas is covered by more than one rep — your ZIP tells us whether your rep is the Greater Houston &amp; Gulf Coast rep or the rest-of-Texas rep.
                  </span>
                </label>
              )}

              <label className="grid gap-1.5 text-sm">
                <span className="font-semibold">{t("email")}</span>
                <Input value={email} disabled className="h-11 px-3 text-sm opacity-60" />
                <span className="text-[11px] text-[var(--anchor-gray)]">{t("emailNote")}</span>
              </label>

              {saveErr && <Alert tone="error">{saveErr}</Alert>}
              {saveMsg && <Alert tone="success">{t("profileUpdated")}</Alert>}

              <Button type="submit" disabled={saving} variant="primary" className="w-full py-3 text-sm sm:w-auto sm:px-6">
                {saving ? t("saving") : t("saveChanges")}
              </Button>
            </form>
          </Card>

          {/* ── NetSuite sync (internal reps only) ───────────────── */}
          {isInternalRep && (
            <Card className="border-t-4 border-t-[var(--anchor-green)] p-5">
              <div className="text-sm font-semibold text-black">{t("netsuiteSync")}</div>
              <div className="mt-1 text-[12px] text-[var(--anchor-gray)]">{t("netsuiteSyncDesc")}</div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                {(["automatic", "manual"] as const).map((mode) => {
                  const active = syncMode === mode;
                  return (
                    <button
                      key={mode}
                      type="button"
                      onClick={() => changeSyncMode(mode)}
                      disabled={savingSyncMode}
                      aria-pressed={active}
                      className={[
                        "flex flex-col gap-1 rounded-2xl border p-4 text-left transition disabled:opacity-60",
                        active
                          ? "border-[var(--anchor-green)] bg-[#F0FDF4]"
                          : "border-black/10 bg-white hover:bg-[var(--surface-soft)]",
                      ].join(" ")}
                    >
                      <span className={["text-sm font-semibold", active ? "text-[var(--anchor-green)]" : "text-black"].join(" ")}>
                        {mode === "automatic" ? t("syncModeAutomatic") : t("syncModeManual")}
                      </span>
                      <span className="text-[12px] text-[var(--anchor-gray)]">
                        {mode === "automatic" ? t("syncModeAutomaticDesc") : t("syncModeManualDesc")}
                      </span>
                    </button>
                  );
                })}
              </div>
            </Card>
          )}

          {/* ── Appearance ───────────────────────────────────────── */}
          <Card data-tutorial="settings-appearance" className="border-t-4 border-t-[var(--anchor-green)] p-5">
            <div className="text-sm font-semibold text-black">{t("appearance")}</div>
            <div className="mt-1 text-[12px] text-[var(--anchor-gray)]">{t("appearanceDesc")}</div>

            <div className="mt-4 grid grid-cols-3 gap-3">
              {(["light", "system", "dark"] as Theme[]).map((th) => {
                const labelKey = th as "light" | "system" | "dark";
                const icons = { light: "☀️", system: "⚙️", dark: "🌙" };
                const active = theme === th;
                return (
                  <button
                    key={th}
                    type="button"
                    onClick={() => handleThemeChange(th)}
                    className={[
                      "flex flex-col items-center gap-2 rounded-2xl border py-4 text-sm font-semibold transition",
                      active
                        ? "border-[var(--anchor-green)] bg-[#F0FDF4] text-[var(--anchor-green)]"
                        : "border-black/10 bg-white text-black hover:bg-[var(--surface-soft)]",
                    ].join(" ")}
                  >
                    <span className="text-xl">{icons[th]}</span>
                    {t(labelKey)}
                  </button>
                );
              })}
            </div>
          </Card>

          {/* ── Sign Out ─────────────────────────────────────────── */}
          <Card data-tutorial="settings-signout" className="border-t-4 border-t-[var(--anchor-green)] p-5">
            <div className="text-sm font-semibold text-black">{t("signOut")}</div>
            <div className="mt-1 text-[12px] text-[var(--anchor-gray)]">{t("signOutDesc")}</div>
            <Button
              type="button"
              onClick={signOut}
              variant="secondary"
              className="mt-4 w-full py-3 text-sm sm:w-auto sm:px-6"
            >
              {t("signOut")}
            </Button>
          </Card>

        </div>
      </div>
    </main>
  );
}
