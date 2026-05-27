"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { eventLabel } from "@/app/components/admin/UserAnalyticsCharts";

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
  fromRoster: boolean; // true = on the OEM contact roster (rep/consultant/etc.)
  events: { total7: number; total30: number; lastSeen: string | null };
};

// What the parent needs to build a per-person PDF (works for unsigned contacts
// too, who have no profileId / activity).
export type DirectoryPdfTarget = {
  name: string;
  email: string | null;
  profileId: string | null;
  signedUp: boolean;
  lastSeen: string | null;
};

export type DirectoryEvent = { at: string; type: string; detail: string };

// Max events rendered inline in the expanded row (the PDF has the full log).
const INLINE_EVENT_CAP = 200;

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
  scope = "oem",
  days,
  onDays,
  dayOptions,
  onLoadEvents,
}: {
  appUsers: PeopleAppUser[];
  onDownloadUserPdf: (target: DirectoryPdfTarget) => void;
  // "oem" = OEM contact roster (reps/consultants/contractors); "other" = app
  // users not on the roster (internal staff + other signed-up users).
  scope?: "oem" | "other";
  // Optional time-window control rendered in the Filters menu. The parent owns
  // the window (it re-fetches the windowed activity) — this just changes it.
  days?: number;
  onDays?: (d: number) => void;
  dayOptions?: Array<{ value: number; label: string }>;
  // When provided, rows are clickable and expand to show the person's events in
  // the current window (fetched lazily by the parent).
  onLoadEvents?: (profileId: string) => Promise<DirectoryEvent[]>;
}) {
  const [contacts, setContacts] = useState<ContactRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [category, setCategory] = useState<string>("all");
  const [manufacturer, setManufacturer] = useState<string>("all");
  const [activity, setActivity] = useState<ActivityFilter>("all");

  // Inline event drill-down (only when onLoadEvents is provided).
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [eventsCache, setEventsCache] = useState<Record<string, { loading: boolean; signedUp: boolean; events: DirectoryEvent[] }>>({});

  // The window changed → cached events are stale; collapse and clear.
  useEffect(() => {
    setExpandedKey(null);
    setEventsCache({});
  }, [days]);

  function toggleExpand(p: Person) {
    if (!onLoadEvents) return;
    if (expandedKey === p.key) { setExpandedKey(null); return; }
    setExpandedKey(p.key);
    if (eventsCache[p.key]) return;
    if (!p.signedUp || !p.profileId) {
      setEventsCache((c) => ({ ...c, [p.key]: { loading: false, signedUp: false, events: [] } }));
      return;
    }
    setEventsCache((c) => ({ ...c, [p.key]: { loading: true, signedUp: true, events: [] } }));
    onLoadEvents(p.profileId)
      .then((events) => setEventsCache((c) => ({ ...c, [p.key]: { loading: false, signedUp: true, events } })))
      .catch(() => setEventsCache((c) => ({ ...c, [p.key]: { loading: false, signedUp: true, events: [] } })));
  }

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
        fromRoster: true,
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
        fromRoster: false,
        events: u.events,
      });
    }

    return out;
  }, [contacts, appUsers]);

  // Narrow to the requested scope: OEM roster vs. everyone else.
  const scoped = useMemo(
    () => people.filter((p) => (scope === "oem" ? p.fromRoster : !p.fromRoster)),
    [people, scope],
  );

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const p of scoped) set.add(p.category);
    return Array.from(set).sort((a, b) => categoryRank(a) - categoryRank(b) || a.localeCompare(b));
  }, [scoped]);

  const manufacturers = useMemo(() => {
    const set = new Set<string>();
    for (const p of scoped) for (const m of p.manufacturers) set.add(m);
    return Array.from(set).sort();
  }, [scoped]);

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
    return scoped
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
  }, [scoped, search, category, manufacturer, activity]);

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
            {onDays && dayOptions && (
              <FilterSection label="Time">
                {dayOptions.map((opt) => (
                  <Chip key={opt.value} active={days === opt.value} onClick={() => onDays(opt.value)}>
                    {opt.label}
                  </Chip>
                ))}
              </FilterSection>
            )}

            <FilterSection label="Contact type">
              <Chip active={category === "all"} onClick={() => setCategory("all")}>All</Chip>
              {categories.map((k) => (
                <Chip key={k} active={category === k} onClick={() => setCategory(k)}>
                  {k}
                  <span className="opacity-70"> · {scoped.filter((p) => p.category === k).length}</span>
                </Chip>
              ))}
            </FilterSection>

            <FilterSection label="Manufacturer">
              <Chip active={manufacturer === "all"} onClick={() => setManufacturer("all")}>All</Chip>
              {manufacturers.map((m) => (
                <Chip key={m} active={manufacturer === m} onClick={() => setManufacturer(m)}>
                  {m}
                  <span className="opacity-70"> · {scoped.filter((p) => p.manufacturers.includes(m)).length}</span>
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
            {filtered.length !== scoped.length && ` of ${scoped.length}`}
          </div>
          {filtered.length === 0 ? (
            <div className="px-6 py-14 text-center text-sm text-[var(--anchor-gray)]">
              No one matches the current filters.
            </div>
          ) : (
            <ul className="divide-y divide-[var(--border-default)] border-t border-[var(--border-default)]">
              {filtered.map((p) => {
                const expandable = !!onLoadEvents;
                const expanded = expandable && expandedKey === p.key;
                return (
                <li key={p.key}>
                  <div
                    onClick={expandable ? () => toggleExpand(p) : undefined}
                    className={
                      "flex items-start gap-2.5 px-4 py-3 sm:items-center sm:px-6 " +
                      (expandable ? "cursor-pointer hover:bg-[var(--surface-soft)]/50 " : "")
                    }
                  >
                    {expandable && (
                      <svg viewBox="0 0 24 24" className={`mt-1 h-3.5 w-3.5 shrink-0 text-[var(--anchor-gray)] transition-transform sm:mt-0 ${expanded ? "rotate-90" : ""}`} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <polyline points="9 6 15 12 9 18" />
                      </svg>
                    )}
                    <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
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
                        <button
                          type="button"
                          data-track-id="people-user-pdf"
                          onClick={(e) => { e.stopPropagation(); onDownloadUserPdf({ name: p.name, email: p.email, profileId: p.profileId, signedUp: p.signedUp, lastSeen: p.events.lastSeen }); }}
                          className="shrink-0 rounded-lg border border-[var(--anchor-green)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--anchor-green)] transition-colors hover:bg-[var(--anchor-green)] hover:text-white"
                        >
                          PDF
                        </button>
                      </div>
                    </div>
                  </div>
                  {expanded && (
                    <EventLog state={eventsCache[p.key]} days={days} />
                  )}
                </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function fmtEventTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

// Expanded drill-down: a person's events in the current window.
function EventLog({
  state,
  days,
}: {
  state?: { loading: boolean; signedUp: boolean; events: DirectoryEvent[] };
  days?: number;
}) {
  const windowLabel = days ? `the last ${days} days` : "this window";
  return (
    <div className="border-t border-[var(--border-default)] bg-[var(--surface-soft)]/40 px-4 py-3 pl-10 sm:px-6 sm:pl-12">
      {!state || state.loading ? (
        <p className="text-xs text-[var(--anchor-gray)]">Loading events…</p>
      ) : !state.signedUp ? (
        <p className="text-xs text-[var(--anchor-gray)]">Not signed up — no app activity.</p>
      ) : state.events.length === 0 ? (
        <p className="text-xs text-[var(--anchor-gray)]">No events in {windowLabel}.</p>
      ) : (
        <>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--anchor-gray)]">
            {state.events.length.toLocaleString()} events · {windowLabel}
          </div>
          <ul className="space-y-1">
            {state.events.slice(0, INLINE_EVENT_CAP).map((e, i) => (
              <li key={`${e.at}-${i}`} className="flex items-baseline gap-2 rounded-md bg-white px-2 py-1 text-xs">
                <span className="w-32 shrink-0 tabular-nums text-[var(--anchor-gray)]">{fmtEventTime(e.at)}</span>
                <span className="w-28 shrink-0 font-semibold text-[var(--anchor-deep)]">{eventLabel(e.type)}</span>
                <span className="min-w-0 flex-1 truncate text-[var(--anchor-gray)]" title={e.detail}>{e.detail || "—"}</span>
              </li>
            ))}
          </ul>
          {state.events.length > INLINE_EVENT_CAP && (
            <p className="mt-2 text-[11px] text-[var(--anchor-gray)]">
              +{(state.events.length - INLINE_EVENT_CAP).toLocaleString()} more — export the PDF for the full log.
            </p>
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
