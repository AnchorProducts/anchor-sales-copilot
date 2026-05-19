"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { AppNavbar } from "@/app/components/ui/AppNavbar";
import { Card } from "@/app/components/ui/Card";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { prettyPagePath } from "@/lib/analytics/pagePath";

export const dynamic = "force-dynamic";

type Activity = {
  total7: number;
  total30: number;
  lastSeen: string | null;
  topPages: Array<{ path: string; count: number }>;
};

type Contact = {
  id: string;
  manufacturer: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  cell: string | null;
  title: string | null;
  territory: string | null;
  region: string | null;
  signed_up: boolean;
  profile_id: string | null;
  profile_role: string | null;
  profile_created_at: string | null;
  activity: Activity | null;
};

type Counts = {
  total: number;
  withEmail: number;
  signedUp: number;
  manufacturers: number;
};

function fmtRelative(iso: string | null): string {
  if (!iso) return "Never";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  const w = Math.floor(d / 7);
  if (w < 4) return `${w}w ago`;
  const mo = Math.floor(d / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(mo / 12)}y ago`;
}

function displayName(c: Contact): string {
  return (
    c.full_name?.trim() ||
    [c.first_name, c.last_name].filter(Boolean).join(" ").trim() ||
    c.email ||
    "—"
  );
}

export default function AdminManufacturerContactsPage() {
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const { t } = useTranslation();

  const [ready, setReady] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [search, setSearch] = useState("");
  const [manufacturerFilter, setManufacturerFilter] = useState<string>("all");
  const [signupFilter, setSignupFilter] = useState<"all" | "signed_up" | "not_signed_up">("all");
  const [expanded, setExpanded] = useState<string | null>(null);

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

  useEffect(() => {
    if (!ready || accessError) return;
    let alive = true;
    (async () => {
      setLoading(true);
      setLoadErr(null);
      const res = await fetch("/api/admin/manufacturer-contacts", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (!alive) return;
      if (!res.ok) {
        setLoadErr(json?.error || "Failed to load contacts.");
        setLoading(false);
        return;
      }
      setContacts((json?.contacts || []) as Contact[]);
      setCounts((json?.counts || null) as Counts | null);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [ready, accessError]);

  const manufacturers = useMemo(() => {
    const set = new Set<string>();
    for (const c of contacts) set.add(c.manufacturer);
    return Array.from(set).sort();
  }, [contacts]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return contacts.filter((c) => {
      if (manufacturerFilter !== "all" && c.manufacturer !== manufacturerFilter) return false;
      if (signupFilter === "signed_up" && !c.signed_up) return false;
      if (signupFilter === "not_signed_up" && c.signed_up) return false;
      if (!q) return true;
      const hay = [
        c.full_name,
        c.first_name,
        c.last_name,
        c.email,
        c.phone,
        c.cell,
        c.title,
        c.territory,
        c.region,
        c.manufacturer,
      ]
        .map((v) => (v || "").toLowerCase())
        .join(" ");
      return hay.includes(q);
    });
  }, [contacts, search, manufacturerFilter, signupFilter]);

  // Group contacts by manufacturer for display.
  const grouped = useMemo(() => {
    const map = new Map<string, Contact[]>();
    for (const c of filtered) {
      const list = map.get(c.manufacturer) ?? [];
      list.push(c);
      map.set(c.manufacturer, list);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  return (
    <main className="ds-page">
      <AppNavbar
        title="Manufacturer Contacts"
        subtitle="Who's using the app, by manufacturer"
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
            {/* Headline counters */}
            {counts && (
              <section className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
                <Counter label="Manufacturers" value={counts.manufacturers} />
                <Counter label="Total contacts" value={counts.total} />
                <Counter
                  label="Signed up"
                  value={counts.signedUp}
                  accent="bg-[var(--anchor-mint)]/40 text-[var(--anchor-deep)]"
                />
                <Counter label="With email" value={counts.withEmail} />
              </section>
            )}

            {/* Controls */}
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative flex-1 sm:max-w-md">
                <svg
                  className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[var(--anchor-gray)]"
                  viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="M21 21l-4.3-4.3" />
                </svg>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search name, email, title, territory…"
                  className="h-11 w-full rounded-full border border-[var(--border-default)] bg-white pl-11 pr-4 text-sm outline-none focus:border-[var(--anchor-green)]"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                {(["all", "signed_up", "not_signed_up"] as const).map((k) => {
                  const active = signupFilter === k;
                  const label =
                    k === "all" ? "Everyone" : k === "signed_up" ? "Signed up" : "Not signed up";
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setSignupFilter(k)}
                      className={
                        "rounded-full border px-3 py-1.5 text-xs font-semibold transition " +
                        (active
                          ? "border-[var(--anchor-green)] bg-[var(--anchor-green)] text-white"
                          : "border-[var(--border-default)] bg-white text-[var(--text-primary)] hover:bg-[var(--surface-soft)]")
                      }
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Manufacturer pills */}
            <div className="mb-4 -mx-1 overflow-x-auto px-1">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setManufacturerFilter("all")}
                  className={
                    "shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition " +
                    (manufacturerFilter === "all"
                      ? "border-[var(--anchor-deep)] bg-[var(--anchor-deep)] text-white"
                      : "border-[var(--border-default)] bg-white text-[var(--text-primary)] hover:bg-[var(--surface-soft)]")
                  }
                >
                  All manufacturers
                </button>
                {manufacturers.map((m) => {
                  const active = manufacturerFilter === m;
                  const count = contacts.filter((c) => c.manufacturer === m).length;
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setManufacturerFilter(m)}
                      className={
                        "shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold transition " +
                        (active
                          ? "border-[var(--anchor-deep)] bg-[var(--anchor-deep)] text-white"
                          : "border-[var(--border-default)] bg-white text-[var(--text-primary)] hover:bg-[var(--surface-soft)]")
                      }
                    >
                      {m} <span className="opacity-70">· {count}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {loadErr && (
              <Card className="mb-4 border-red-200 bg-red-50 p-4 text-sm text-red-700">{loadErr}</Card>
            )}

            {loading ? (
              <Card className="p-5 text-sm text-[var(--anchor-gray)]">Loading contacts…</Card>
            ) : grouped.length === 0 ? (
              <Card className="p-5 text-sm text-[var(--anchor-gray)]">No contacts match.</Card>
            ) : (
              <div className="space-y-5">
                {grouped.map(([manufacturer, list]) => (
                  <Card key={manufacturer} className="overflow-hidden p-0">
                    <div className="flex items-center justify-between gap-3 border-b border-[var(--border-default)] px-4 py-3 sm:px-6">
                      <div>
                        <div className="text-base font-bold tracking-tight text-[var(--anchor-deep)]">
                          {manufacturer}
                        </div>
                        <div className="text-[11px] text-[var(--anchor-gray)]">
                          {list.length} contact{list.length === 1 ? "" : "s"} · {list.filter((c) => c.signed_up).length} signed up
                        </div>
                      </div>
                    </div>

                    <ul className="divide-y divide-[var(--border-default)]">
                      {list.map((c) => {
                        const open = expanded === c.id;
                        const status = c.signed_up
                          ? c.activity && c.activity.total7 > 0
                            ? { label: "Active", className: "bg-[var(--anchor-mint)] text-[var(--anchor-deep)]" }
                            : { label: "Signed up", className: "bg-[#dbeafe] text-[#1e3a8a]" }
                          : { label: "Not signed up", className: "bg-black/5 text-black/55" };
                        return (
                          <li key={c.id}>
                            <button
                              type="button"
                              onClick={() => setExpanded(open ? null : c.id)}
                              aria-expanded={open}
                              className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition hover:bg-[var(--surface-soft)] sm:px-6"
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                  <span className="truncate text-sm font-semibold text-[var(--anchor-deep)] sm:text-base">
                                    {displayName(c)}
                                  </span>
                                  <span className={`ds-badge !rounded-full ${status.className}`}>
                                    {status.label}
                                  </span>
                                </div>
                                <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-[var(--anchor-gray)]">
                                  {c.title && <span className="truncate">{c.title}</span>}
                                  {(c.region || c.territory) && (
                                    <span>· {c.region || c.territory}</span>
                                  )}
                                  {c.email && <span className="truncate">· {c.email}</span>}
                                </div>
                              </div>
                              <div className="hidden shrink-0 items-center gap-3 sm:flex">
                                {c.activity && (
                                  <span className="text-[11px] text-[var(--anchor-gray)]">
                                    {c.activity.total7} · 7d
                                  </span>
                                )}
                                <span className="text-[11px] text-[var(--anchor-gray)]">
                                  {c.activity?.lastSeen ? fmtRelative(c.activity.lastSeen) : ""}
                                </span>
                                <svg
                                  viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
                                  className={`h-5 w-5 text-[var(--anchor-gray)] transition-transform ${open ? "rotate-180" : ""}`}
                                  aria-hidden
                                >
                                  <polyline points="6 9 12 15 18 9" />
                                </svg>
                              </div>
                            </button>

                            {open && (
                              <div className="border-t border-[var(--border-default)] bg-[var(--surface-soft)] px-4 py-4 sm:px-6 sm:py-5">
                                <div className="grid gap-3 sm:grid-cols-2">
                                  <div className="rounded-xl border border-[var(--border-default)] bg-white p-4 text-sm">
                                    <div className="ds-caption mb-2">Contact</div>
                                    <Field label="Email" value={c.email} mono />
                                    <Field label="Phone" value={c.phone} />
                                    <Field label="Cell" value={c.cell} />
                                    <Field label="Title" value={c.title} />
                                    <Field label="Region" value={c.region} />
                                    <Field label="Territory" value={c.territory} />
                                  </div>

                                  <div className="rounded-xl border border-[var(--border-default)] bg-white p-4 text-sm">
                                    <div className="ds-caption mb-2">App activity</div>
                                    {!c.signed_up ? (
                                      <div className="text-[var(--anchor-gray)]">
                                        This person hasn&rsquo;t signed up yet. Their activity will
                                        appear automatically once they create an account with{" "}
                                        {c.email ? <span className="font-mono text-xs">{c.email}</span> : "their email"}.
                                      </div>
                                    ) : !c.activity || c.activity.total30 === 0 ? (
                                      <div className="text-[var(--anchor-gray)]">
                                        Signed up{c.profile_created_at ? ` ${fmtRelative(c.profile_created_at)}` : ""}.
                                        No activity recorded in the last 30 days.
                                      </div>
                                    ) : (
                                      <>
                                        <Field label="Events (7d)" value={String(c.activity.total7)} />
                                        <Field label="Events (30d)" value={String(c.activity.total30)} />
                                        <Field
                                          label="Last seen"
                                          value={c.activity.lastSeen ? fmtRelative(c.activity.lastSeen) : "—"}
                                        />
                                        {c.activity.topPages.length > 0 && (
                                          <div className="mt-2">
                                            <div className="ds-caption mb-1">Top pages</div>
                                            <ul className="space-y-1">
                                              {c.activity.topPages.map((p) => (
                                                <li key={p.path} className="flex items-center justify-between gap-3 text-xs">
                                                  <span className="truncate" title={p.path}>{prettyPagePath(p.path)}</span>
                                                  <span className="ds-badge !rounded-full">{p.count}</span>
                                                </li>
                                              ))}
                                            </ul>
                                          </div>
                                        )}
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </Card>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}

function Counter({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: string;
}) {
  return (
    <Card className={`p-4 sm:p-5 ${accent || ""}`}>
      <div className="ds-caption">{label}</div>
      <div className="mt-1 text-2xl font-bold tracking-tight">{value.toLocaleString()}</div>
    </Card>
  );
}

function Field({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string | null | undefined;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1">
      <span className="shrink-0 text-[11px] uppercase tracking-wide text-[var(--anchor-gray)]">
        {label}
      </span>
      <span className={`min-w-0 truncate text-right ${mono ? "font-mono text-xs" : ""}`} title={value || undefined}>
        {value || <span className="text-[var(--anchor-gray)]">—</span>}
      </span>
    </div>
  );
}
