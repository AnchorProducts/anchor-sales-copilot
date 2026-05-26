"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";

// A signed-up app user (profile) passed in from the analytics page. Contacts
// who have signed up match one of these by email.
export type PeopleAppUser = {
  id: string;
  email: string;
  full_name: string | null;
  role: string | null;
  manufacturer: string | null;
  contact_type?: string | null;
  events: { total7: number; total30: number; lastSeen: string | null };
};

type ContactActivity = { total7: number; total30: number; lastSeen: string | null };

type ContactRow = {
  id: string;
  contact_type: string | null;
  manufacturer: string | null;
  company: string | null;
  manufacturers: string[];
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  email: string | null;
  signed_up: boolean;
  profile_id: string | null;
  activity: ContactActivity | null;
};

// One row in the unified directory — an app user, a contact, or both merged.
type Person = {
  key: string;
  name: string;
  email: string | null;
  category: string; // Internal | Rep | Consultant | Contractor | <custom> | External
  detail: string | null; // OEM for reps, company for non-reps, OEM tag for users
  manufacturers: string[]; // OEMs this person is associated with (for filtering)
  signedUp: boolean;
  profileId: string | null;
  events: { total7: number; total30: number; lastSeen: string | null };
};

type ActivityFilter = "all" | "active7" | "active30" | "dormant" | "signed_up" | "not_signed_up";

const ACTIVITY_OPTIONS: Array<{ key: ActivityFilter; label: string }> = [
  { key: "all", label: "Any" },
  { key: "active7", label: "Active this week" },
  { key: "active30", label: "Active this month" },
  { key: "dormant", label: "Dormant (14d+)" },
  { key: "signed_up", label: "Signed up" },
  { key: "not_signed_up", label: "Not signed up" },
];

const ZERO = { total7: 0, total30: 0, lastSeen: null };

function isInternalRole(role: string | null | undefined) {
  return role === "anchor_rep" || role === "admin";
}

function humanizeType(t: string | null | undefined): string {
  const v = t || "manufacturer_rep";
  if (v === "manufacturer_rep") return "Rep";
  return v.charAt(0).toUpperCase() + v.slice(1).replace(/_/g, " ");
}

function contactName(c: ContactRow): string {
  return (
    c.full_name?.trim() ||
    [c.first_name, c.last_name].filter(Boolean).join(" ").trim() ||
    c.email ||
    "—"
  );
}

function fmtRelative(iso: string | null): string {
  if (!iso) return "Never";
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return `${Math.floor(d / 7)}w ago`;
}

function daysSince(iso: string | null): number {
  if (!iso) return Infinity;
  return (Date.now() - new Date(iso).getTime()) / 86_400_000;
}

// Sort categories: Internal, the contact types, then External last.
const CATEGORY_ORDER = ["Internal", "Rep", "Consultant", "Contractor"];
function categoryRank(cat: string): number {
  const i = CATEGORY_ORDER.indexOf(cat);
  if (i !== -1) return i;
  if (cat === "External") return 99;
  return 50;
}

function badgeClass(category: string): string {
  switch (category) {
    case "Internal":
      return "bg-[var(--anchor-mint)]/60 text-[var(--anchor-deep)]";
    case "Rep":
      return "bg-[#dbeafe] text-[#1e3a8a]";
    case "External":
      return "bg-[var(--surface-soft)] text-[var(--anchor-gray)]";
    default: // Consultant / Contractor / custom
      return "bg-[#ede9fe] text-[#5b21b6]";
  }
}

export function PeopleDirectory({
  appUsers,
  onDownloadUserPdf,
}: {
  appUsers: PeopleAppUser[];
  onDownloadUserPdf: (profileId: string) => void;
}) {
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [category, setCategory] = useState<string>("all");
  const [manufacturer, setManufacturer] = useState<string>("all");
  const [activity, setActivity] = useState<ActivityFilter>("all");

  useEffect(() => {
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
      setContacts((json?.contacts || []) as ContactRow[]);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

  // Merge contacts + app users into one deduped people list (by email).
  const people = useMemo<Person[]>(() => {
    const out: Person[] = [];
    const consumedEmails = new Set<string>();

    for (const c of contacts) {
      const email = (c.email || "").toLowerCase();
      if (email) consumedEmails.add(email);
      const rep = (c.contact_type || "manufacturer_rep") === "manufacturer_rep";
      const oems = rep ? (c.manufacturer ? [c.manufacturer] : []) : c.manufacturers;
      out.push({
        key: `c:${c.id}`,
        name: contactName(c),
        email: c.email,
        category: humanizeType(c.contact_type),
        detail: rep ? c.manufacturer : c.company || oems.join(", ") || null,
        manufacturers: oems,
        signedUp: c.signed_up,
        profileId: c.profile_id,
        events: c.activity ?? ZERO,
      });
    }

    for (const u of appUsers) {
      const email = (u.email || "").toLowerCase();
      if (email && consumedEmails.has(email)) continue; // already represented by a contact
      out.push({
        key: `u:${u.id}`,
        name: u.full_name || u.email,
        email: u.email,
        category: isInternalRole(u.role) ? "Internal" : "External",
        detail: u.manufacturer,
        manufacturers: u.manufacturer ? [u.manufacturer] : [],
        signedUp: true,
        profileId: u.id,
        events: u.events,
      });
    }

    return out;
  }, [contacts, appUsers]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const p of people) set.add(p.category);
    return Array.from(set).sort((a, b) => categoryRank(a) - categoryRank(b) || a.localeCompare(b));
  }, [people]);

  const manufacturers = useMemo(() => {
    const set = new Set<string>();
    for (const p of people) for (const m of p.manufacturers) set.add(m);
    return Array.from(set).sort();
  }, [people]);

  function matchesActivity(p: Person): boolean {
    switch (activity) {
      case "active7": return p.events.total7 > 0;
      case "active30": return p.events.total30 > 0;
      case "dormant": return p.signedUp && daysSince(p.events.lastSeen) > 14;
      case "signed_up": return p.signedUp;
      case "not_signed_up": return !p.signedUp;
      default: return true;
    }
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return people
      .filter((p) => {
        if (category !== "all" && p.category !== category) return false;
        if (manufacturer !== "all" && !p.manufacturers.includes(manufacturer)) return false;
        if (!matchesActivity(p)) return false;
        if (!q) return true;
        return [p.name, p.email, p.detail, p.category, ...p.manufacturers]
          .map((v) => (v || "").toLowerCase())
          .join(" ")
          .includes(q);
      })
      .sort((a, b) => {
        if (b.events.total7 !== a.events.total7) return b.events.total7 - a.events.total7;
        const at = a.events.lastSeen ? new Date(a.events.lastSeen).getTime() : 0;
        const bt = b.events.lastSeen ? new Date(b.events.lastSeen).getTime() : 0;
        return bt - at;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [people, search, category, manufacturer, activity]);

  const activeCount =
    (category !== "all" ? 1 : 0) +
    (manufacturer !== "all" ? 1 : 0) +
    (activity !== "all" ? 1 : 0);

  function clearFilters() {
    setCategory("all");
    setManufacturer("all");
    setActivity("all");
  }

  return (
    <div>
      {/* Search + filter toggle */}
      <div className="px-4 py-3 sm:px-6">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, company, OEM…"
            className="ds-input w-full sm:flex-1"
          />
          <button
            type="button"
            onClick={() => setFiltersOpen((o) => !o)}
            aria-expanded={filtersOpen}
            data-track-id="people-filters-toggle"
            className={
              "inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition " +
              (filtersOpen || activeCount > 0
                ? "border-[var(--anchor-deep)] bg-[var(--anchor-deep)] text-white"
                : "border-[var(--border-default)] bg-white text-[var(--anchor-deep)] hover:bg-[var(--surface-soft)]")
            }
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <line x1="4" y1="6" x2="20" y2="6" /><circle cx="9" cy="6" r="2" fill="currentColor" />
              <line x1="4" y1="12" x2="20" y2="12" /><circle cx="15" cy="12" r="2" fill="currentColor" />
              <line x1="4" y1="18" x2="20" y2="18" /><circle cx="8" cy="18" r="2" fill="currentColor" />
            </svg>
            Filters
            {activeCount > 0 && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-white px-1.5 text-[11px] font-bold text-[var(--anchor-deep)]">
                {activeCount}
              </span>
            )}
            <svg viewBox="0 0 24 24" className={`h-4 w-4 transition-transform ${filtersOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
        </div>

        {/* Collapsible filter panel — same on mobile and desktop */}
        {filtersOpen && (
          <div className="mt-3 space-y-4 rounded-xl border border-[var(--border-default)] bg-[var(--surface-soft)]/40 p-3 sm:p-4">
            <FilterSection label="Contact type">
              <Chip active={category === "all"} onClick={() => setCategory("all")}>All</Chip>
              {categories.map((k) => (
                <Chip key={k} active={category === k} onClick={() => setCategory(k)}>
                  {k}
                  <span className="opacity-70"> · {people.filter((p) => p.category === k).length}</span>
                </Chip>
              ))}
            </FilterSection>

            <FilterSection label="Manufacturer">
              <Chip active={manufacturer === "all"} onClick={() => setManufacturer("all")}>All</Chip>
              {manufacturers.map((m) => (
                <Chip key={m} active={manufacturer === m} onClick={() => setManufacturer(m)}>
                  {m}
                  <span className="opacity-70"> · {people.filter((p) => p.manufacturers.includes(m)).length}</span>
                </Chip>
              ))}
            </FilterSection>

            <FilterSection label="Activity">
              {ACTIVITY_OPTIONS.map((opt) => (
                <Chip key={opt.key} active={activity === opt.key} onClick={() => setActivity(opt.key)}>
                  {opt.label}
                </Chip>
              ))}
            </FilterSection>

            {activeCount > 0 && (
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={clearFilters}
                  className="rounded-lg border border-[var(--border-default)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--anchor-gray)] hover:text-[var(--anchor-deep)]"
                >
                  Clear filters
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {loadErr && (
        <div className="mx-4 mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 sm:mx-6">
          {loadErr}
        </div>
      )}

      {loading ? (
        <div className="px-6 py-14 text-center text-sm text-[var(--anchor-gray)]">Loading people…</div>
      ) : (
        <>
          <div className="px-4 pb-1 text-xs text-[var(--anchor-gray)] sm:px-6">
            {filtered.length} {filtered.length === 1 ? "person" : "people"}
            {filtered.length !== people.length && ` of ${people.length}`}
          </div>
          {filtered.length === 0 ? (
            <div className="px-6 py-14 text-center text-sm text-[var(--anchor-gray)]">
              No one matches the current filters.
            </div>
          ) : (
            <ul className="divide-y divide-[var(--border-default)] border-t border-[var(--border-default)]">
              {filtered.map((p) => (
                <li key={p.key} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:gap-4 sm:px-6">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                      <span className="truncate text-sm font-semibold text-[var(--anchor-deep)] sm:text-base">
                        {p.name}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${badgeClass(p.category)}`}>
                        {p.category}
                      </span>
                      {p.detail && (
                        <span className="rounded-full bg-[var(--surface-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--anchor-deep)]">
                          {p.detail}
                        </span>
                      )}
                      {!p.signedUp && (
                        <span className="rounded-full bg-black/5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-black/55">
                          Not signed up
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 truncate text-xs text-[var(--anchor-gray)]">
                      {p.email || "no email"}
                      {p.signedUp && p.events.lastSeen && ` · last seen ${fmtRelative(p.events.lastSeen)}`}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center justify-between gap-4 sm:justify-end">
                    {p.signedUp && (
                      <div className="flex items-center gap-4 text-center">
                        <Stat label="7d" value={p.events.total7} />
                        <Stat label="30d" value={p.events.total30} />
                      </div>
                    )}
                    {p.signedUp && p.profileId && (
                      <button
                        type="button"
                        data-track-id="people-user-pdf"
                        onClick={() => onDownloadUserPdf(p.profileId!)}
                        className="shrink-0 rounded-lg border border-[var(--anchor-green)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--anchor-green)] transition-colors hover:bg-[var(--anchor-green)] hover:text-white"
                      >
                        PDF
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function FilterSection({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--anchor-gray)]">
        {label}
      </div>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded-full border px-3 py-1.5 text-xs font-semibold transition " +
        (active
          ? "border-[var(--anchor-deep)] bg-[var(--anchor-deep)] text-white"
          : "border-[var(--border-default)] bg-white text-[var(--text-primary)] hover:bg-[var(--surface-soft)]")
      }
    >
      {children}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-sm font-bold tabular-nums text-[var(--anchor-deep)]">{value.toLocaleString()}</div>
      <div className="text-[10px] uppercase tracking-wide text-[var(--anchor-gray)]">{label}</div>
    </div>
  );
}
