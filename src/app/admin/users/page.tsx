"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { AppNavbar } from "@/app/components/ui/AppNavbar";
import { Card } from "@/app/components/ui/Card";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { PersonEditorModal, type Person } from "@/app/components/admin/PersonEditorModal";

export const dynamic = "force-dynamic";

type ProfileRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  company: string | null;
  role: string | null;
  service_state: string | null;
  service_states: string[] | null;
  service_zip: string | null;
  anchor_commission?: boolean | null;
};

type ContactRow = {
  id: string;
  contact_type: string | null;
  rep_kind: string | null;
  manufacturer: string | null;
  company: string | null;
  manufacturers: string[];
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  title: string | null;
  territory: string | null;
  region: string | null;
  anchor_commission: boolean | null;
  signed_up: boolean;
  profile_id: string | null;
  profile_role: string | null;
};

function categoryOf(p: Person): string {
  if (!p.contactType) return p.role === "admin" ? "Admin" : p.role === "anchor_rep" ? "Internal" : "App user";
  if (p.contactType === "manufacturer_rep") return p.repKind === "tech" ? "Tech rep" : "Sales rep";
  if (p.contactType === "consultant") return "Consultant";
  return p.contactType.charAt(0).toUpperCase() + p.contactType.slice(1).replace(/_/g, " ");
}

function badgeClass(cat: string): string {
  switch (cat) {
    case "Admin": return "bg-[#fde68a] text-[#7c4a00]";
    case "Internal": return "bg-[var(--anchor-mint)] text-[var(--anchor-deep)]";
    case "Sales rep":
    case "Tech rep": return "bg-[#dbeafe] text-[#1e3a8a]";
    case "Consultant": return "bg-[#ede9fe] text-[#5b21b6]";
    default: return "bg-[var(--surface-soft)] text-[var(--anchor-gray)]";
  }
}

const FILTERS = ["All", "App user", "Internal", "Admin", "Sales rep", "Tech rep", "Consultant"] as const;

export default function AdminUsersPage() {
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const { t } = useTranslation();

  const [ready, setReady] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [me, setMe] = useState("");

  const [profiles, setProfiles] = useState<ProfileRow[]>([]);
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("All");
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState<Person | null>(null);

  // Close the filter menu on outside click / Escape.
  useEffect(() => {
    if (!filterOpen) return;
    function onDoc(e: MouseEvent) { if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false); }
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") setFilterOpen(false); }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [filterOpen]);

  // Admin gate.
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!alive) return;
      if (!data.user) { router.replace("/"); return; }
      setMe(data.user.id);
      const { data: prof } = await supabase.from("profiles").select("role").eq("id", data.user.id).maybeSingle();
      if (!alive) return;
      if (String((prof as { role?: string } | null)?.role || "") !== "admin") setAccessError("Admin access only.");
      setReady(true);
    })();
    return () => { alive = false; };
  }, [router, supabase]);

  async function load() {
    setLoading(true);
    setLoadErr(null);
    try {
      const [pRes, cRes] = await Promise.all([
        fetch("/api/admin/users", { cache: "no-store" }),
        fetch("/api/admin/manufacturer-contacts", { cache: "no-store" }),
      ]);
      const pJson = await pRes.json().catch(() => null);
      const cJson = await cRes.json().catch(() => null);
      if (!pRes.ok) { setLoadErr(pJson?.error || "Failed to load users."); return; }
      if (!cRes.ok) { setLoadErr(cJson?.error || "Failed to load OEM contacts."); return; }
      setProfiles((pJson?.users ?? []) as ProfileRow[]);
      setContacts((cJson?.contacts ?? []) as ContactRow[]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!ready || accessError) return;
    void load();
  }, [ready, accessError]);

  // Merge profiles + OEM contacts into one person list (contacts win; an
  // unmatched profile is a plain app user).
  const people = useMemo<Person[]>(() => {
    const profileById = new Map(profiles.map((p) => [p.id, p]));
    const consumed = new Set<string>();
    const out: Person[] = [];

    for (const c of contacts) {
      const prof = c.profile_id ? profileById.get(c.profile_id) : null;
      if (prof) consumed.add(prof.id);
      out.push({
        key: `c:${c.id}`,
        profileId: c.profile_id ?? null,
        contactId: c.id,
        firstName: c.first_name ?? "",
        lastName: c.last_name ?? "",
        fullName: c.full_name?.trim() || [c.first_name, c.last_name].filter(Boolean).join(" ").trim(),
        email: c.email ?? prof?.email ?? "",
        phone: c.phone ?? prof?.phone ?? "",
        company: c.company ?? prof?.company ?? "",
        contactType: c.contact_type ?? "manufacturer_rep",
        repKind: c.rep_kind ?? null,
        manufacturer: c.manufacturer ?? null,
        manufacturers: c.manufacturers ?? [],
        title: c.title ?? "",
        territory: c.territory ?? "",
        region: c.region ?? "",
        anchorCommission: !!c.anchor_commission || !!prof?.anchor_commission,
        role: prof?.role ?? c.profile_role ?? null,
        serviceState: prof?.service_state ?? null,
        serviceStates: prof?.service_states ?? (prof?.service_state ? [prof.service_state] : null),
        serviceZip: prof?.service_zip ?? null,
        signedUp: c.signed_up,
      });
    }

    for (const p of profiles) {
      if (consumed.has(p.id)) continue;
      const parts = (p.full_name ?? "").trim().split(/\s+/).filter(Boolean);
      out.push({
        key: `p:${p.id}`,
        profileId: p.id,
        contactId: null,
        firstName: parts[0] ?? "",
        lastName: parts.slice(1).join(" "),
        fullName: p.full_name ?? "",
        email: p.email ?? "",
        phone: p.phone ?? "",
        company: p.company ?? "",
        contactType: null,
        repKind: null,
        manufacturer: null,
        manufacturers: [],
        title: "",
        territory: "",
        region: "",
        anchorCommission: !!p.anchor_commission,
        role: p.role ?? null,
        serviceState: p.service_state ?? null,
        serviceStates: p.service_states ?? (p.service_state ? [p.service_state] : null),
        serviceZip: p.service_zip ?? null,
        signedUp: true,
      });
    }
    return out;
  }, [profiles, contacts]);

  const knownManufacturers = useMemo(() => {
    const set = new Set<string>();
    for (const p of people) {
      if (p.manufacturer) set.add(p.manufacturer);
      for (const m of p.manufacturers) set.add(m);
    }
    return Array.from(set).sort();
  }, [people]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return people
      .filter((p) => {
        if (filter !== "All" && categoryOf(p) !== filter) return false;
        if (!q) return true;
        return [p.fullName, p.email, p.company, p.phone, p.manufacturer, ...p.manufacturers]
          .map((v) => (v || "").toLowerCase())
          .join(" ")
          .includes(q);
      })
      .sort((a, b) => (a.fullName || a.email).localeCompare(b.fullName || b.email));
  }, [people, search, filter]);

  return (
    <main className="ds-page">
      <AppNavbar
        title="Users"
        subtitle="Everyone using the app — reps, consultants & staff"
        menuItems={[
          { label: t("dashboard"), href: "/dashboard" },
          { label: "Admin Console", href: "/admin" },
        ]}
      />

      <div className="ds-container py-6 pb-[calc(3rem+env(safe-area-inset-bottom))] sm:py-10">
        {!ready ? (
          <Card className="p-5 text-sm text-black/60">{t("loading")}</Card>
        ) : accessError ? (
          <Card className="border-[var(--anchor-deep)]/25 bg-[var(--anchor-mint)] p-5 text-sm text-[var(--anchor-deep)]">{accessError}</Card>
        ) : (
          <>
            <header className="mb-5">
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Users</h1>
              <p className="mt-1 text-sm text-[var(--anchor-gray)] sm:text-base">
                One place to edit every person — app users, OEM reps, tech reps, and consultants. Click anyone to change their details, role, OEM info, or account.
              </p>
            </header>

            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="relative flex-1 sm:max-w-md">
                <svg className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-[var(--anchor-gray)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.3-4.3" />
                </svg>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search name, email, company, OEM…"
                  className="h-11 w-full rounded-full border border-[var(--border-default)] bg-white pl-11 pr-4 text-sm outline-none focus:border-[var(--anchor-green)]"
                />
              </div>
              <div ref={filterRef} className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => setFilterOpen((v) => !v)}
                  aria-expanded={filterOpen}
                  className="inline-flex h-11 items-center gap-1.5 whitespace-nowrap rounded-full border border-[var(--border-default)] bg-white px-4 text-sm font-semibold text-[var(--anchor-deep)] transition-colors hover:bg-[var(--surface-soft)]"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                  </svg>
                  Filters
                  {filter !== "All" && (
                    <span className="rounded-full bg-[var(--anchor-green)] px-2 py-0.5 text-[11px] font-bold text-white">{filter}</span>
                  )}
                  <svg viewBox="0 0 24 24" className={`h-4 w-4 transition-transform ${filterOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
                {filterOpen && (
                  <div className="absolute right-0 z-20 mt-2 w-56 rounded-xl border border-[var(--border-default)] bg-white p-2 shadow-lg">
                    <div className="px-2 pb-1 pt-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--anchor-gray)]">Type</div>
                    {FILTERS.map((f) => {
                      const active = filter === f;
                      return (
                        <button
                          key={f}
                          type="button"
                          onClick={() => { setFilter(f); setFilterOpen(false); }}
                          className={
                            "flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm font-semibold transition " +
                            (active ? "bg-[var(--surface-soft)] text-[var(--anchor-deep)]" : "text-[var(--text-primary)] hover:bg-[var(--surface-soft)]")
                          }
                        >
                          {f}
                          {active && (
                            <svg viewBox="0 0 24 24" className="h-4 w-4 text-[var(--anchor-green)]" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                              <polyline points="20 6 9 17 4 12" />
                            </svg>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {loadErr && <Card className="mb-4 border-red-200 bg-red-50 p-4 text-sm text-red-700">{loadErr}</Card>}

            <Card className="overflow-hidden p-0">
              <div className="border-b border-[var(--border-default)] px-4 py-3 text-xs text-[var(--anchor-gray)] sm:px-6">
                {loading ? "Loading…" : `${filtered.length}${filtered.length !== people.length ? ` of ${people.length}` : ""} people`}
              </div>
              {!loading && filtered.length === 0 ? (
                <div className="px-6 py-14 text-center text-sm text-[var(--anchor-gray)]">No one matches.</div>
              ) : (
                <ul className="divide-y divide-[var(--border-default)]">
                  {filtered.map((p) => {
                    const cat = categoryOf(p);
                    const detail = p.contactType ? p.manufacturers.join(", ") || p.company : null;
                    return (
                      <li key={p.key}>
                        <button
                          type="button"
                          onClick={() => setEditing(p)}
                          className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--surface-soft)] sm:px-6"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                              <span className="truncate text-sm font-semibold text-[var(--anchor-deep)] sm:text-base">{p.fullName || p.email || "Unnamed"}</span>
                              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${badgeClass(cat)}`}>{cat}</span>
                              {detail && <span className="rounded-full bg-[var(--surface-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--anchor-deep)]">{detail}</span>}
                              {p.anchorCommission && <span className="rounded-full bg-[var(--anchor-green)]/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--anchor-green)]">Anchor commission</span>}
                              {p.contactType && !p.signedUp && <span className="rounded-full bg-black/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-black/55">Not signed up</span>}
                              {p.profileId === me && <span className="rounded-full bg-black/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-black/60">You</span>}
                            </div>
                            <div className="mt-0.5 truncate text-xs text-[var(--anchor-gray)]">
                              {p.email || "no email"}
                              {p.phone && ` · ${p.phone}`}
                            </div>
                          </div>
                          <svg viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-[var(--anchor-gray)]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                            <polyline points="9 6 15 12 9 18" />
                          </svg>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </>
        )}

        {editing && (
          <PersonEditorModal
            person={editing}
            knownManufacturers={knownManufacturers}
            currentUserId={me}
            onClose={() => setEditing(null)}
            onSaved={() => { setEditing(null); void load(); }}
          />
        )}
      </div>
    </main>
  );
}
