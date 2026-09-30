"use client";

// Credentials index for the keepers (src/lib/credentials/keepers.ts). It
// records where every login lives — never the password itself, which stays in
// the team password manager. Every view, open, copy and edit is logged, from
// here and from the website admin alike.

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { AppNavbar } from "@/app/components/ui/AppNavbar";
import { Icon, Pill, SectionTitle, Surface } from "@/app/components/ui/kit";
import { ToolLoader } from "@/app/components/visuals/FeatureGraphic";
import {
  isCredentialKeeper,
  type CredentialEntry,
  type CredentialLogRow,
  type VaultSetting,
} from "@/lib/credentials/keepers";

export const dynamic = "force-dynamic";

type Draft = Omit<CredentialEntry, "id" | "updated_at" | "updated_by"> & { id?: string };

const EMPTY: Draft = {
  name: "",
  category: "",
  login_url: "",
  account: "",
  used_for: "",
  vault_item: "",
  two_factor: "",
  owner: "",
  last_rotated: "",
  notes: "",
};

const FIELDS: { key: keyof Draft; label: string; placeholder?: string; type?: string; wide?: boolean }[] = [
  { key: "name", label: "System", placeholder: "e.g. Vercel, Supabase, Webflow, HubSpot" },
  { key: "category", label: "Group", placeholder: "e.g. Hosting, Email, Website, Ads" },
  { key: "login_url", label: "Sign-in page", placeholder: "https://…" },
  { key: "account", label: "Account / login name", placeholder: "The username or email — not the password" },
  { key: "vault_item", label: "Item in the password manager", placeholder: "Exact name of the vault item" },
  { key: "two_factor", label: "Two-factor lives on", placeholder: "e.g. Riley's phone (Authenticator)" },
  { key: "owner", label: "Owner", placeholder: "Who is responsible for it" },
  { key: "last_rotated", label: "Password last changed", type: "date" },
  { key: "used_for", label: "What it's for", wide: true },
  { key: "notes", label: "Notes", wide: true },
];

const STALE_DAYS = 365;

function daysSince(date: string | null) {
  if (!date) return null;
  const t = new Date(`${date}T12:00:00`).getTime();
  return Number.isFinite(t) ? Math.floor((Date.now() - t) / 86_400_000) : null;
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export default function CredentialsPage() {
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const [ready, setReady] = useState(false);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [entries, setEntries] = useState<CredentialEntry[]>([]);
  const [vault, setVault] = useState<VaultSetting | null>(null);
  const [log, setLog] = useState<CredentialLogRow[]>([]);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [vaultDraft, setVaultDraft] = useState<VaultSetting | null>(null);
  const [showLog, setShowLog] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin/credentials", { cache: "no-store" });
    if (res.status === 403 || res.status === 401) {
      setDenied(true);
      return;
    }
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(json?.error || "Couldn't load the credentials index.");
      return;
    }
    setEntries(json.entries || []);
    setVault(json.vault?.url ? json.vault : null);
    setLog(json.log || []);
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!alive) return;
      if (!data.user) { router.replace("/"); return; }
      if (!isCredentialKeeper(data.user.email)) {
        setDenied(true);
        setReady(true);
        return;
      }
      await load();
      if (alive) setReady(true);
    })();
    return () => { alive = false; };
  }, [router, supabase, load]);

  const track = (event: string, id?: string) => {
    void fetch("/api/admin/credentials", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ event, id }),
    });
  };

  const q = query.trim().toLowerCase();
  const groups = useMemo(() => {
    const list = q
      ? entries.filter((e) =>
          [e.name, e.category, e.used_for, e.account, e.vault_item, e.owner, e.notes]
            .join(" ")
            .toLowerCase()
            .includes(q)
        )
      : entries;
    const map = new Map<string, CredentialEntry[]>();
    for (const e of list) {
      const g = (e.category || "").trim() || "Other";
      if (!map.has(g)) map.set(g, []);
      map.get(g)!.push(e);
    }
    return Array.from(map.entries()).sort(([a], [b]) => (a === "Other" ? 1 : b === "Other" ? -1 : a.localeCompare(b)));
  }, [entries, q]);

  const staleCount = entries.filter((e) => {
    const d = daysSince(e.last_rotated);
    return d == null || d > STALE_DAYS;
  }).length;

  async function saveEntry() {
    if (!draft) return;
    setSaving(true);
    setError(null);
    const res = await fetch("/api/admin/credentials", {
      method: draft.id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    const json = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(json?.error || "Couldn't save.");
      return;
    }
    setDraft(null);
    await load();
  }

  async function removeEntry(e: CredentialEntry) {
    if (!window.confirm(`Remove "${e.name}" from the index? The login itself stays in the password manager.`)) return;
    const res = await fetch("/api/admin/credentials", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: e.id }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      setError(json?.error || "Couldn't remove it.");
      return;
    }
    await load();
  }

  async function saveVault() {
    if (!vaultDraft) return;
    setSaving(true);
    setError(null);
    const res = await fetch("/api/admin/credentials", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ vault: vaultDraft }),
    });
    const json = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      setError(json?.error || "Couldn't save the vault link.");
      return;
    }
    setVaultDraft(null);
    await load();
  }

  async function copyAccount(e: CredentialEntry) {
    if (!e.account) return;
    try {
      await navigator.clipboard.writeText(e.account);
      setCopied(e.id);
      window.setTimeout(() => setCopied((c) => (c === e.id ? null : c)), 1500);
      track("copied account", e.id);
    } catch {
      /* clipboard blocked — nothing to log */
    }
  }

  return (
    <main className="ds-page">
      <AppNavbar title="Credentials" subtitle="Where every login lives" menuItems={[{ label: "Admin", href: "/admin" }]} />

      <div className="ds-container py-6 pb-[calc(2rem+env(safe-area-inset-bottom))] sm:py-10">
        {!ready ? (
          <ToolLoader feature="admin" label="Loading…" />
        ) : denied ? (
          <Surface className="mx-auto max-w-xl p-6 text-[14px] text-[var(--anchor-gray)]">
            This page is limited to the people who look after Anchor&rsquo;s logins.
          </Surface>
        ) : (
          <div className="mx-auto max-w-4xl space-y-4">
            <Surface className="p-5 sm:p-6">
              <Link href="/admin" className="inline-flex items-center gap-1 text-[13px] font-medium text-[var(--anchor-green)]">
                <Icon name="chevronLeft" className="h-4 w-4" />
                Admin Console
              </Link>
              <h1 className="mt-2 text-[28px] font-semibold leading-tight tracking-[-0.02em] text-black">Credentials</h1>
              <p className="mt-1.5 max-w-2xl text-[14px] leading-snug text-[var(--anchor-gray)]">
                Every system Anchor signs in to, and where its login is kept. Passwords, keys and recovery codes live
                only in the password manager — this list tells you which item to open. Only Riley, Calli and Lauren can see it,
                here and in the website admin, and every visit is logged.
              </p>

              <div className="mt-5 flex flex-col gap-3 rounded-2xl bg-[var(--mo-fill)] p-4 sm:flex-row sm:items-center sm:justify-between">
                {vaultDraft ? (
                  <div className="grid w-full gap-2 sm:grid-cols-[1fr_2fr_auto]">
                    <input
                      className="ds-input"
                      placeholder="Name, e.g. 1Password — Anchor Admin vault"
                      value={vaultDraft.name}
                      onChange={(e) => setVaultDraft({ ...vaultDraft, name: e.target.value })}
                    />
                    <input
                      className="ds-input"
                      placeholder="https://…"
                      value={vaultDraft.url}
                      onChange={(e) => setVaultDraft({ ...vaultDraft, url: e.target.value })}
                    />
                    <div className="flex gap-2">
                      <Pill size="sm" onClick={saveVault} disabled={saving}>Save</Pill>
                      <Pill size="sm" variant="gray" onClick={() => setVaultDraft(null)}>Cancel</Pill>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="min-w-0">
                      <div className="text-[12px] font-semibold uppercase tracking-wide text-[var(--anchor-gray)]">Password manager</div>
                      <div className="mt-0.5 truncate text-[15px] font-semibold text-black">
                        {vault?.name || (vault?.url ? vault.url : "Not linked yet")}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      {vault?.url && (
                        <a
                          href={vault.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => track("opened vault")}
                          className="inline-flex h-8 items-center gap-1 rounded-full bg-[var(--anchor-green)] px-3.5 text-[13px] font-semibold text-white hover:brightness-110"
                        >
                          Open vault
                          <Icon name="link" className="h-4 w-4" />
                        </a>
                      )}
                      <Pill size="sm" variant="gray" onClick={() => setVaultDraft(vault || { name: "", url: "" })}>
                        {vault?.url ? "Change" : "Link vault"}
                      </Pill>
                    </div>
                  </>
                )}
              </div>
            </Surface>

            {error && (
              <Surface className="flex gap-2 p-4 text-[13px] text-red-700">
                <Icon name="warning" className="h-4 w-4" />
                {error}
              </Surface>
            )}

            <Surface className="p-5 sm:p-6">
              <SectionTitle
                title={`${entries.length} ${entries.length === 1 ? "system" : "systems"}`}
                hint={
                  staleCount
                    ? `${staleCount} with no password change recorded in the last year.`
                    : entries.length
                    ? "Every password changed within the last year."
                    : "Add each system Anchor signs in to."
                }
                right={
                  <Pill size="sm" onClick={() => setDraft({ ...EMPTY })}>
                    <Icon name="plus" className="h-4 w-4" />
                    Add
                  </Pill>
                }
              />
              {entries.length > 4 && (
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search systems, owners, vault items…"
                  className="ds-input mt-4 w-full"
                />
              )}

              {draft && (
                <div className="mt-4 rounded-2xl border border-[var(--mo-sep)] p-4">
                  <div className="mb-3 flex gap-2 rounded-xl bg-amber-50 p-3 text-[13px] leading-snug text-amber-900">
                    <Icon name="warning" className="mt-0.5 h-4 w-4" />
                    Never type a password, key or recovery code here. Put it in the password manager and write the item&rsquo;s name below.
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {FIELDS.map((f) => (
                      <label key={f.key} className={f.wide ? "sm:col-span-2" : ""}>
                        <span className="text-[12px] font-semibold text-[var(--anchor-gray)]">{f.label}</span>
                        {f.wide ? (
                          <textarea
                            className="ds-input mt-1 min-h-[70px] w-full"
                            value={(draft[f.key] as string) || ""}
                            onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                          />
                        ) : (
                          <input
                            type={f.type || "text"}
                            autoComplete="off"
                            className="ds-input mt-1 w-full"
                            placeholder={f.placeholder}
                            value={(draft[f.key] as string) || ""}
                            onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })}
                          />
                        )}
                      </label>
                    ))}
                  </div>
                  <div className="mt-4 flex gap-2">
                    <Pill size="sm" onClick={saveEntry} disabled={saving || !draft.name.trim()}>
                      {saving ? "Saving…" : draft.id ? "Save changes" : "Add system"}
                    </Pill>
                    <Pill size="sm" variant="gray" onClick={() => setDraft(null)}>Cancel</Pill>
                  </div>
                </div>
              )}

              <div className="mt-5 space-y-6">
                {groups.map(([group, list]) => (
                  <div key={group}>
                    <div className="px-1 text-[12px] font-semibold uppercase tracking-wide text-[var(--anchor-gray)]">{group}</div>
                    <ul className="mt-2 divide-y divide-[var(--mo-sep)] overflow-hidden rounded-2xl border border-[var(--mo-sep)]">
                      {list.map((e) => {
                        const age = daysSince(e.last_rotated);
                        const stale = age == null || age > STALE_DAYS;
                        return (
                          <li key={e.id} className="p-4">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-[15px] font-semibold text-black">{e.name}</div>
                                {e.used_for && <div className="mt-0.5 text-[13px] text-[var(--anchor-gray)]">{e.used_for}</div>}
                              </div>
                              <div className="flex shrink-0 gap-1.5">
                                {e.login_url && (
                                  <a
                                    href={e.login_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={() => track("opened sign-in", e.id)}
                                    className="inline-flex h-8 items-center rounded-full bg-[var(--anchor-green)]/12 px-3 text-[13px] font-semibold text-[var(--anchor-green)] hover:bg-[var(--anchor-green)]/18"
                                  >
                                    Sign in
                                  </a>
                                )}
                                <Pill size="sm" variant="gray" onClick={() => setDraft({ ...EMPTY, ...e })}>Edit</Pill>
                              </div>
                            </div>
                            <dl className="mt-3 grid gap-x-6 gap-y-2 text-[13px] sm:grid-cols-2">
                              {e.account && (
                                <Row label="Account">
                                  <button type="button" onClick={() => copyAccount(e)} className="text-left font-medium text-black hover:underline">
                                    {e.account}
                                  </button>
                                  <span className="ml-2 text-[12px] text-[var(--anchor-green)]">{copied === e.id ? "Copied" : ""}</span>
                                </Row>
                              )}
                              {e.vault_item && <Row label="Vault item">{e.vault_item}</Row>}
                              {e.two_factor && <Row label="Two-factor">{e.two_factor}</Row>}
                              {e.owner && <Row label="Owner">{e.owner}</Row>}
                              <Row label="Password changed">
                                <span className={stale ? "font-semibold text-amber-700" : ""}>
                                  {e.last_rotated
                                    ? new Date(`${e.last_rotated}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
                                    : "Not recorded"}
                                  {stale && e.last_rotated ? " — over a year ago" : ""}
                                </span>
                              </Row>
                            </dl>
                            {e.notes && <p className="mt-3 whitespace-pre-wrap text-[13px] leading-snug text-black/75">{e.notes}</p>}
                            <div className="mt-3 flex items-center justify-between text-[11px] text-[var(--anchor-gray)]">
                              <span>Updated {fmtDate(e.updated_at)}{e.updated_by ? ` by ${e.updated_by}` : ""}</span>
                              <button type="button" onClick={() => removeEntry(e)} className="font-semibold text-red-600 hover:underline">
                                Remove
                              </button>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
                {entries.length > 0 && groups.length === 0 && (
                  <p className="text-center text-[14px] text-[var(--anchor-gray)]">Nothing matches.</p>
                )}
              </div>
            </Surface>

            <Surface className="p-5 sm:p-6">
              <SectionTitle
                title="Access log"
                hint="Every view, sign-in link, copy and change, from the App and the website admin. Refused attempts are listed too."
                right={
                  <Pill size="sm" variant="gray" onClick={() => setShowLog((s) => !s)}>
                    {showLog ? "Hide" : "Show"}
                  </Pill>
                }
              />
              {showLog && (
                <ul className="mt-4 divide-y divide-[var(--mo-sep)] text-[13px]">
                  {log.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 py-2">
                      <span className={r.action === "denied" ? "font-semibold text-red-700" : "text-black"}>
                        {r.email || "unknown"} · {r.action === "denied" ? "was refused" : r.action}
                        {r.entry_name ? ` · ${r.entry_name}` : ""}
                      </span>
                      <span className="text-[12px] text-[var(--anchor-gray)]">
                        {r.source === "website" ? "Website" : "App"} · {fmtDate(r.at)}
                      </span>
                    </li>
                  ))}
                  {log.length === 0 && <li className="py-2 text-[var(--anchor-gray)]">No activity yet.</li>}
                </ul>
              )}
            </Surface>
          </div>
        )}
      </div>
    </main>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 gap-2">
      <dt className="w-32 shrink-0 text-[var(--anchor-gray)]">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}
