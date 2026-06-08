"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { AppNavbar } from "@/app/components/ui/AppNavbar";
import { Card } from "@/app/components/ui/Card";
import { useTranslation } from "@/lib/i18n/useTranslation";

export const dynamic = "force-dynamic";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Settings = {
  commission_recipient_email: string | null;
  weekly_report_emails: string[];
};

export default function AdminNotificationsPage() {
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const { t } = useTranslation();

  const [ready, setReady] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  // Commission section state.
  const [commissionEmail, setCommissionEmail] = useState("");
  const [commissionBusy, setCommissionBusy] = useState(false);
  const [commissionMsg, setCommissionMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // Weekly report section state.
  const [weeklyEmails, setWeeklyEmails] = useState<string[]>([]);
  const [newWeeklyEmail, setNewWeeklyEmail] = useState("");
  const [weeklyBusy, setWeeklyBusy] = useState(false);
  const [weeklyMsg, setWeeklyMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  // Admin gate.
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!alive) return;
      if (!data.user) { router.replace("/"); return; }
      const { data: prof } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.user.id)
        .maybeSingle();
      if (!alive) return;
      const role = String((prof as { role?: string } | null)?.role || "");
      if (role !== "admin") setAccessError("Admin access only.");
      setReady(true);
    })();
    return () => { alive = false; };
  }, [router, supabase]);

  // Load settings.
  useEffect(() => {
    if (!ready || accessError) return;
    let alive = true;
    (async () => {
      setLoading(true);
      setLoadErr(null);
      const res = await fetch("/api/admin/notification-settings", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!alive) return;
      if (!res.ok) {
        setLoadErr(json?.error || "Failed to load settings.");
        setLoading(false);
        return;
      }
      const s = (json?.settings as Settings) ?? { commission_recipient_email: null, weekly_report_emails: [] };
      setCommissionEmail(s.commission_recipient_email || "");
      setWeeklyEmails(s.weekly_report_emails || []);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [ready, accessError]);

  async function saveCommission() {
    setCommissionBusy(true);
    setCommissionMsg(null);
    const value = commissionEmail.trim().toLowerCase();
    if (value && !EMAIL_RE.test(value)) {
      setCommissionMsg({ kind: "err", text: "That doesn’t look like a valid email." });
      setCommissionBusy(false);
      return;
    }
    try {
      const res = await fetch("/api/admin/notification-settings", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commission_recipient_email: value || null }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setCommissionMsg({ kind: "err", text: json?.error || "Save failed." });
        return;
      }
      setCommissionMsg({ kind: "ok", text: value ? "Saved." : "Cleared. Will fall back to env var." });
    } catch (e) {
      setCommissionMsg({ kind: "err", text: e instanceof Error ? e.message : "Save failed." });
    } finally {
      setCommissionBusy(false);
    }
  }

  async function addWeeklyEmail() {
    const value = newWeeklyEmail.trim().toLowerCase();
    setWeeklyMsg(null);
    if (!value) return;
    if (!EMAIL_RE.test(value)) {
      setWeeklyMsg({ kind: "err", text: "That doesn’t look like a valid email." });
      return;
    }
    if (weeklyEmails.includes(value)) {
      setWeeklyMsg({ kind: "err", text: "Already in the list." });
      return;
    }
    const next = [...weeklyEmails, value];
    await saveWeeklyList(next);
  }

  async function removeWeeklyEmail(email: string) {
    const next = weeklyEmails.filter((e) => e !== email);
    await saveWeeklyList(next);
  }

  async function saveWeeklyList(list: string[]) {
    setWeeklyBusy(true);
    setWeeklyMsg(null);
    try {
      const res = await fetch("/api/admin/notification-settings", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weekly_report_emails: list }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setWeeklyMsg({ kind: "err", text: json?.error || "Save failed." });
        return;
      }
      setWeeklyEmails(list);
      setNewWeeklyEmail("");
      setWeeklyMsg({ kind: "ok", text: "Saved." });
    } catch (e) {
      setWeeklyMsg({ kind: "err", text: e instanceof Error ? e.message : "Save failed." });
    } finally {
      setWeeklyBusy(false);
    }
  }

  return (
    <main className="ds-page">
      <AppNavbar
        title="Notifications"
        subtitle="Email recipients for forms and reports"
        menuItems={[
          { label: t("dashboard"), href: "/dashboard" },
          { label: "Admin Console", href: "/admin" },
        ]}
      />

      <div className="ds-container py-6 pb-[calc(3rem+env(safe-area-inset-bottom))] sm:py-10">
        {!ready ? (
          <Card className="p-5 text-sm text-black/60">{t("loading")}</Card>
        ) : accessError ? (
          <Card className="border-[var(--anchor-deep)]/25 bg-[var(--anchor-mint)] p-5 text-sm text-[var(--anchor-deep)]">
            {accessError}
          </Card>
        ) : (
          <>
            <header className="mb-6 sm:mb-8">
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Notifications</h1>
              <p className="mt-1 text-sm text-[var(--anchor-gray)]">
                Who gets emailed when forms come in and where the weekly analytics report lands.
              </p>
            </header>

            {loadErr && (
              <Card className="mb-4 border-red-200 bg-red-50 p-4 text-sm text-red-700">{loadErr}</Card>
            )}

            {loading ? (
              <Card className="p-5 text-sm text-[var(--anchor-gray)]">Loading…</Card>
            ) : (
              <div className="space-y-6">
                {/* Commission claims recipient */}
                <Card className="p-5 sm:p-6">
                  <div className="mb-3">
                    <h2 className="text-base font-bold text-[var(--anchor-deep)] sm:text-lg">
                      Commission claims recipient
                    </h2>
                    <p className="mt-0.5 text-xs text-[var(--anchor-gray)]">
                      Every commission claim submission goes to this one address.
                    </p>
                  </div>
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <input
                      type="email"
                      value={commissionEmail}
                      onChange={(e) => setCommissionEmail(e.target.value)}
                      placeholder="commission@anchorp.com"
                      className="h-10 flex-1 rounded-xl border border-[var(--border-default)] bg-white px-3 text-sm outline-none focus:border-[var(--anchor-green)]"
                    />
                    <button
                      type="button"
                      onClick={saveCommission}
                      disabled={commissionBusy}
                      className="h-10 shrink-0 rounded-xl border border-[var(--anchor-green)] bg-[var(--anchor-green)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--anchor-deep)] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {commissionBusy ? "Saving…" : "Save"}
                    </button>
                  </div>
                  {commissionMsg && (
                    <div
                      className={
                        "mt-2 rounded-lg px-3 py-2 text-xs " +
                        (commissionMsg.kind === "ok"
                          ? "bg-[var(--anchor-mint)]/40 text-[var(--anchor-deep)]"
                          : "border border-red-200 bg-red-50 text-red-700")
                      }
                    >
                      {commissionMsg.text}
                    </div>
                  )}
                </Card>

                {/* Weekly analytics report recipients */}
                <Card className="p-5 sm:p-6">
                  <div className="mb-3">
                    <h2 className="text-base font-bold text-[var(--anchor-deep)] sm:text-lg">
                      Weekly analytics report
                    </h2>
                    <p className="mt-0.5 text-xs text-[var(--anchor-gray)]">
                      Sent every Friday at noon Central time. Add as many recipients as you want.
                    </p>
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <input
                      type="email"
                      value={newWeeklyEmail}
                      onChange={(e) => setNewWeeklyEmail(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          void addWeeklyEmail();
                        }
                      }}
                      placeholder="add another recipient…"
                      className="h-10 flex-1 rounded-xl border border-[var(--border-default)] bg-white px-3 text-sm outline-none focus:border-[var(--anchor-green)]"
                    />
                    <button
                      type="button"
                      onClick={addWeeklyEmail}
                      disabled={weeklyBusy}
                      className="h-10 shrink-0 rounded-xl border border-[var(--anchor-green)] bg-[var(--anchor-green)] px-4 text-sm font-semibold text-white transition-colors hover:bg-[var(--anchor-deep)] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Add
                    </button>
                  </div>

                  {weeklyMsg && (
                    <div
                      className={
                        "mt-2 rounded-lg px-3 py-2 text-xs " +
                        (weeklyMsg.kind === "ok"
                          ? "bg-[var(--anchor-mint)]/40 text-[var(--anchor-deep)]"
                          : "border border-red-200 bg-red-50 text-red-700")
                      }
                    >
                      {weeklyMsg.text}
                    </div>
                  )}

                  {weeklyEmails.length === 0 ? (
                    <div className="mt-4 rounded-xl border border-dashed border-[var(--border-default)] p-4 text-center text-xs text-[var(--anchor-gray)]">
                      No recipients yet. The Friday report won’t send until you add at least one.
                    </div>
                  ) : (
                    <ul className="mt-4 divide-y divide-[var(--border-default)] rounded-xl border border-[var(--border-default)]">
                      {weeklyEmails.map((email) => (
                        <li key={email} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                          <span className="truncate text-[var(--anchor-deep)]" title={email}>
                            {email}
                          </span>
                          <button
                            type="button"
                            onClick={() => removeWeeklyEmail(email)}
                            disabled={weeklyBusy}
                            aria-label={`Remove ${email}`}
                            className="shrink-0 rounded-lg border border-red-300 bg-white px-2 py-1 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                          >
                            Remove
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>

                <Card className="border-[var(--anchor-deep)]/25 bg-[var(--anchor-mint)]/30 p-5 text-xs text-[var(--anchor-deep)] sm:p-6">
                  <div className="font-semibold">Other notifications</div>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    <li>
                      <strong>Leads</strong> — auto-routed to the assigned internal sales rep based on the project’s state (configured in <a href="/admin/sales-reps" className="underline">Sales Reps</a>).
                    </li>
                    <li>
                      <strong>Notable Projects</strong> — single recipient set via the <code>NOTABLE_PROJECT_NOTIFICATIONS_EMAIL</code> env var.
                    </li>
                    <li>
                      <strong>Sender domain</strong> — all emails come from <code>reports@anchorp.com</code> (your Resend domain).
                    </li>
                  </ul>
                </Card>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}
