"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { AppNavbar } from "@/app/components/ui/AppNavbar";
import { Card } from "@/app/components/ui/Card";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { PORTAL_LEVELS, PORTAL_TEAMS, levelLabel, teamLabel } from "@/lib/portalRoles";
import { useSiteLive } from "@/lib/flags/useSiteLive";
import { NotLiveNotice } from "@/app/components/ui/NotLiveNotice";

export const dynamic = "force-dynamic";

/* ============================================================================
 * Portal Access — CRUD over the shared `portal_invites` authorized-emails list.
 *
 * This is the SAME list the Anchor Internal Portal's admin manages, so an edit
 * here shows up there immediately (and vice versa). It is deliberately separate
 * from /admin/users, which edits this app's own login accounts (`profiles`):
 * a person can exist in one list and not the other.
 * ==========================================================================*/

type Invite = {
  email: string;
  role: string | null;
  team: string | null;
  status: string | null;
  created_at: string | null;
  issued_at: string | null;
};

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

function levelBadge(role: string | null): string {
  return role?.toLowerCase() === "admin"
    ? "bg-[#fde68a] text-[#7c4a00]"
    : "bg-[var(--anchor-mint)] text-[var(--anchor-deep)]";
}

function teamBadge(team: string | null): string {
  switch (team?.toLowerCase()) {
    case "marketing": return "bg-[#efe9fb] text-[#5b3fa0]";
    case "sales": return "bg-[#dbeafe] text-[#1e3a8a]";
    case "operations": return "bg-[#e9f6f7] text-[#2f7c85]";
    case "leadership": return "bg-[#fdf3e2] text-[#8a6d3b]";
    default: return "bg-[var(--surface-soft)] text-[var(--anchor-gray)]";
  }
}

export default function PortalAccessPage() {
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const { t } = useTranslation();

  const [ready, setReady] = useState(false);
  const { live, ready: liveReady } = useSiteLive();
  const [accessError, setAccessError] = useState<string | null>(null);
  const [myEmail, setMyEmail] = useState("");

  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  // Add form.
  const [newEmail, setNewEmail] = useState("");
  const [newLevel, setNewLevel] = useState<string>("internal");
  const [newTeam, setNewTeam] = useState<string>("");

  // Admin gate — mirrors the rest of the admin console.
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!alive) return;
      if (!data.user) { router.replace("/"); return; }
      setMyEmail((data.user.email || "").toLowerCase());
      const { data: prof } = await supabase
        .from("profiles").select("role").eq("id", data.user.id).maybeSingle();
      if (!alive) return;
      if (String((prof as { role?: string } | null)?.role || "") !== "admin") {
        setAccessError("Admin access only.");
      }
      setReady(true);
    })();
    return () => { alive = false; };
  }, [router, supabase]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/admin/portal-invites", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!res.ok) { setErr(json?.error || "Failed to load the access list."); return; }
      setInvites((json?.invites ?? []) as Invite[]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (ready && !accessError && live) void load(); }, [ready, accessError, live, load]);

  async function send(method: "POST" | "PATCH" | "DELETE", body: Record<string, unknown>, key: string) {
    setBusy(key);
    setErr(null);
    try {
      const res = await fetch("/api/admin/portal-invites", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) { setErr(json?.error || "That didn't save."); return false; }
      await load();
      return true;
    } finally {
      setBusy(null);
    }
  }

  async function addInvite(e: React.FormEvent) {
    e.preventDefault();
    const email = newEmail.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) { setErr("Enter a valid email address."); return; }
    const ok = await send("POST", { email, role: newLevel, team: newTeam || null }, "add");
    if (ok) { setNewEmail(""); setNewTeam(""); setNewLevel("internal"); }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return invites;
    return invites.filter((i) =>
      i.email.toLowerCase().includes(q) ||
      (i.role || "").toLowerCase().includes(q) ||
      (i.team || "").toLowerCase().includes(q)
    );
  }, [invites, search]);

  return (
    <main className="ds-page">
      <AppNavbar
        title="Portal Access"
        subtitle="Shared authorized-emails list"
        menuItems={[
          { label: t("dashboard"), href: "/dashboard" },
          { label: "Admin Console", href: "/admin" },
          { label: "Users", href: "/admin/users" },
        ]}
      />

      <div className="ds-container py-6 pb-[calc(3rem+env(safe-area-inset-bottom))] sm:py-10">
        {!ready || !liveReady ? (
          <Card className="p-5 text-sm text-black/60">{t("loading")}</Card>
        ) : !live ? (
          <NotLiveNotice />
        ) : accessError ? (
          <Card className="border-[var(--anchor-deep)]/25 bg-[var(--anchor-mint)] p-5 text-sm text-[var(--anchor-deep)]">
            {accessError}
          </Card>
        ) : (
          <>
            <header className="mb-5">
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Portal Access</h1>
              <p className="mt-1 text-sm text-[var(--anchor-gray)] sm:text-base">
                Who is authorized across Anchor&apos;s internal surfaces, and what they can reach. <b>Level</b> is
                the access tier; <b>Team</b> unlocks team areas — Marketing gates the Marketing Hub. This is the
                same list the Anchor Internal Portal uses, so changes here apply there too.
              </p>
            </header>

            <Card className="mb-5 p-4 sm:p-5">
              <h2 className="mb-3 text-sm font-semibold text-[var(--anchor-deep)]">Authorize an email</h2>
              <form onSubmit={addInvite} className="flex flex-col gap-3 sm:flex-row sm:items-end">
                <label className="flex-1">
                  <span className="mb-1 block text-xs font-semibold text-[var(--anchor-gray)]">Email</span>
                  <input
                    type="email"
                    value={newEmail}
                    onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="name@anchorp.com"
                    className="h-11 w-full rounded-xl border border-[var(--border-default)] bg-white px-3 text-sm outline-none focus:border-[var(--anchor-green)]"
                  />
                </label>
                <label className="sm:w-40">
                  <span className="mb-1 block text-xs font-semibold text-[var(--anchor-gray)]">Level</span>
                  <select
                    value={newLevel}
                    onChange={(e) => setNewLevel(e.target.value)}
                    className="h-11 w-full rounded-xl border border-[var(--border-default)] bg-white px-3 text-sm outline-none focus:border-[var(--anchor-green)]"
                  >
                    {PORTAL_LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                  </select>
                </label>
                <label className="sm:w-44">
                  <span className="mb-1 block text-xs font-semibold text-[var(--anchor-gray)]">Team</span>
                  <select
                    value={newTeam}
                    onChange={(e) => setNewTeam(e.target.value)}
                    className="h-11 w-full rounded-xl border border-[var(--border-default)] bg-white px-3 text-sm outline-none focus:border-[var(--anchor-green)]"
                  >
                    <option value="">No team</option>
                    {PORTAL_TEAMS.map((tm) => <option key={tm.value} value={tm.value}>{tm.label}</option>)}
                  </select>
                </label>
                <button
                  type="submit"
                  disabled={busy === "add"}
                  className="h-11 shrink-0 rounded-xl bg-[var(--anchor-green)] px-5 text-sm font-semibold text-white transition-opacity disabled:opacity-50"
                >
                  {busy === "add" ? "Adding…" : "Add"}
                </button>
              </form>
            </Card>

            <div className="mb-4">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search email, level, or team…"
                className="h-11 w-full rounded-full border border-[var(--border-default)] bg-white px-4 text-sm outline-none focus:border-[var(--anchor-green)] sm:max-w-md"
              />
            </div>

            {err && <Card className="mb-4 border-red-200 bg-red-50 p-4 text-sm text-red-700">{err}</Card>}

            <Card className="overflow-hidden p-0">
              <div className="border-b border-[var(--border-default)] px-4 py-3 text-xs text-[var(--anchor-gray)] sm:px-6">
                {loading
                  ? "Loading…"
                  : `${filtered.length}${filtered.length !== invites.length ? ` of ${invites.length}` : ""} authorized`}
              </div>
              {!loading && filtered.length === 0 ? (
                <div className="px-6 py-14 text-center text-sm text-[var(--anchor-gray)]">
                  {invites.length === 0 ? "No one is on the list yet." : "No one matches."}
                </div>
              ) : (
                <ul className="divide-y divide-[var(--border-default)]">
                  {filtered.map((inv) => {
                    const isMe = inv.email.toLowerCase() === myEmail;
                    const rowBusy = busy === inv.email;
                    return (
                      <li key={inv.email} className="px-4 py-3 sm:px-6">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                              <span className="truncate text-sm font-semibold text-[var(--anchor-deep)]">{inv.email}</span>
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${levelBadge(inv.role)}`}>
                                {levelLabel(inv.role)}
                              </span>
                              {inv.team && (
                                <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${teamBadge(inv.team)}`}>
                                  {teamLabel(inv.team)}
                                </span>
                              )}
                              {isMe && (
                                <span className="rounded-full bg-black/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-black/60">You</span>
                              )}
                            </div>
                            <div className="mt-0.5 text-xs text-[var(--anchor-gray)]">
                              {inv.status === "issued" ? "Account created" : "Invited — not signed up yet"}
                            </div>
                          </div>

                          <div className="flex shrink-0 flex-wrap items-center gap-2">
                            <select
                              value={(inv.role || "internal").toLowerCase()}
                              disabled={rowBusy}
                              onChange={(e) =>
                                void send("PATCH", { email: inv.email, role: e.target.value, team: inv.team }, inv.email)
                              }
                              className="h-10 rounded-xl border border-[var(--border-default)] bg-white px-2.5 text-sm outline-none focus:border-[var(--anchor-green)] disabled:opacity-50"
                              aria-label={`Level for ${inv.email}`}
                            >
                              {PORTAL_LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                            </select>
                            <select
                              value={(inv.team || "").toLowerCase()}
                              disabled={rowBusy}
                              onChange={(e) =>
                                void send("PATCH", { email: inv.email, role: inv.role, team: e.target.value || null }, inv.email)
                              }
                              className="h-10 rounded-xl border border-[var(--border-default)] bg-white px-2.5 text-sm outline-none focus:border-[var(--anchor-green)] disabled:opacity-50"
                              aria-label={`Team for ${inv.email}`}
                            >
                              <option value="">No team</option>
                              {PORTAL_TEAMS.map((tm) => <option key={tm.value} value={tm.value}>{tm.label}</option>)}
                            </select>
                            <button
                              type="button"
                              disabled={rowBusy || isMe}
                              title={isMe ? "You can't remove your own access." : "Remove access"}
                              onClick={() => {
                                if (!confirm(`Remove portal access for ${inv.email}?`)) return;
                                void send("DELETE", { email: inv.email }, inv.email);
                              }}
                              className="h-10 rounded-xl border border-[var(--border-default)] px-3 text-sm font-semibold text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </>
        )}
      </div>
    </main>
  );
}
