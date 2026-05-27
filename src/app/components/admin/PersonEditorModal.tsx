"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

// A merged person: may have a login (profileId), an OEM roster entry
// (contactId), or both. The editor writes to whichever record(s) apply.
export type Person = {
  key: string;
  profileId: string | null;
  contactId: string | null;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string;
  phone: string;
  company: string;
  contactType: string | null; // null = app user only; "manufacturer_rep" | "consultant" | …
  repKind: string | null; // "sales" | "tech"
  manufacturer: string | null;
  manufacturers: string[];
  title: string;
  territory: string;
  region: string;
  anchorCommission: boolean; // OEM contacts: on an Anchor commission arrangement
  role: string | null; // profile role
  serviceState: string | null;
  signedUp: boolean;
};

type Kind = "app_user" | "sales_rep" | "tech_rep" | "consultant";
type RoleKey = "admin" | "anchor_rep" | "external_rep";

const ROLE_LABEL: Record<RoleKey, string> = {
  admin: "Admin",
  anchor_rep: "Internal sales",
  external_rep: "External",
};

function initialKind(p: Person): Kind {
  if (!p.contactType) return "app_user";
  if (p.contactType === "manufacturer_rep") return p.repKind === "tech" ? "tech_rep" : "sales_rep";
  return "consultant";
}

function asRoleKey(v: string | null): RoleKey {
  return v === "admin" || v === "anchor_rep" || v === "external_rep" ? v : "external_rep";
}

export function PersonEditorModal({
  person,
  knownManufacturers,
  currentUserId,
  onClose,
  onSaved,
}: {
  person: Person;
  knownManufacturers: string[];
  currentUserId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [firstName, setFirstName] = useState(person.firstName);
  const [lastName, setLastName] = useState(person.lastName);
  const [email, setEmail] = useState(person.email);
  const [phone, setPhone] = useState(person.phone);
  const [company, setCompany] = useState(person.company);
  const [kind, setKind] = useState<Kind>(initialKind(person));
  const [manufacturers, setManufacturers] = useState<string[]>(
    person.manufacturers.length ? person.manufacturers : person.manufacturer ? [person.manufacturer] : [],
  );
  const [title, setTitle] = useState(person.title);
  const [territory, setTerritory] = useState(person.territory);
  const [region, setRegion] = useState(person.region);
  const [anchorCommission, setAnchorCommission] = useState(person.anchorCommission);
  const [role, setRole] = useState<RoleKey>(asRoleKey(person.role));
  const [serviceState, setServiceState] = useState(person.serviceState ?? "");
  const [newOem, setNewOem] = useState("");

  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; document.removeEventListener("keydown", onKey); };
  }, [onClose]);

  const isOem = kind !== "app_user";
  const isConsultant = kind === "consultant";
  const hasLogin = !!person.profileId;
  const isSelf = person.profileId === currentUserId;
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim() || person.fullName;

  const oemOptions = useMemo(
    () => Array.from(new Set([...knownManufacturers, ...manufacturers].filter(Boolean))).sort(),
    [knownManufacturers, manufacturers],
  );

  function toggleOem(m: string) {
    setManufacturers((prev) => (prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m]));
  }

  async function save() {
    setMsg(null);
    if (!email.trim()) { setMsg({ kind: "err", text: "Email is required." }); return; }
    if (isOem && !isConsultant && manufacturers.length === 0) { setMsg({ kind: "err", text: "Pick at least one manufacturer for this rep." }); return; }
    if (isConsultant && !company.trim()) { setMsg({ kind: "err", text: "Company is required for a consultant." }); return; }

    setBusy(true);
    try {
      // 1) Profile (login) — only if this person has an account.
      if (person.profileId) {
        const patch: Record<string, unknown> = { id: person.profileId, full_name: fullName, phone, company, service_state: serviceState };
        if (email.trim().toLowerCase() !== person.email.trim().toLowerCase()) patch.email = email.trim();
        if (!isSelf) patch.role = role;
        const res = await fetch("/api/admin/users", {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch),
        });
        if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j?.error || "Profile update failed."); }
      }

      // 2) OEM roster entry.
      if (isOem) {
        const payload = {
          contact_type: isConsultant ? "consultant" : "manufacturer_rep",
          rep_kind: kind === "tech_rep" ? "tech" : kind === "sales_rep" ? "sales" : null,
          company: isConsultant ? company.trim() : company.trim() || null,
          manufacturers, // reps & consultants can both span multiple OEMs
          anchor_commission: anchorCommission,
          first_name: firstName,
          last_name: lastName,
          full_name: fullName,
          email: email.trim(),
          phone,
          title,
          territory,
          region,
        };
        const url = person.contactId ? `/api/admin/manufacturer-contacts/${person.contactId}` : "/api/admin/manufacturer-contacts";
        const res = await fetch(url, {
          method: person.contactId ? "PUT" : "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j?.error || "OEM details update failed."); }
      } else if (person.contactId) {
        // Downgraded from an OEM contact to a plain app user → remove from roster.
        const res = await fetch(`/api/admin/manufacturer-contacts/${person.contactId}`, { method: "DELETE", credentials: "include" });
        if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j?.error || "Could not remove OEM entry."); }
      }

      onSaved();
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Save failed." });
    } finally {
      setBusy(false);
    }
  }

  async function sendReset() {
    setMsg(null);
    setBusy(true);
    try {
      const redirectTo = typeof window !== "undefined" ? `${window.location.origin}/reset` : undefined;
      const { error } = await supabaseBrowser().auth.resetPasswordForEmail(email.trim(), { redirectTo });
      if (error) throw error;
      setMsg({ kind: "ok", text: `Password reset email sent to ${email.trim()}.` });
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Could not send reset email." });
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirmDelete) { setConfirmDelete(true); return; }
    setMsg(null);
    setBusy(true);
    try {
      if (person.profileId) {
        const res = await fetch(`/api/admin/users?id=${encodeURIComponent(person.profileId)}`, { method: "DELETE", credentials: "include" });
        if (!res.ok) { const j = await res.json().catch(() => ({})); throw new Error(j?.error || "Delete failed."); }
      }
      if (person.contactId) {
        await fetch(`/api/admin/manufacturer-contacts/${person.contactId}`, { method: "DELETE", credentials: "include" });
      }
      onSaved();
    } catch (e) {
      setMsg({ kind: "err", text: e instanceof Error ? e.message : "Delete failed." });
      setBusy(false);
      setConfirmDelete(false);
    }
  }

  const KIND_OPTIONS: Array<{ key: Kind; label: string }> = [
    { key: "app_user", label: "App user" },
    { key: "sales_rep", label: "OEM sales rep" },
    { key: "tech_rep", label: "OEM tech rep" },
    { key: "consultant", label: "Consultant" },
  ];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Edit person"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-xl sm:max-w-2xl sm:rounded-3xl">
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border-default)] px-5 py-4 sm:px-6">
          <div>
            <h3 className="text-lg font-bold text-[var(--anchor-deep)] sm:text-xl">{person.fullName || person.email || "Edit person"}</h3>
            <p className="mt-0.5 text-xs text-[var(--anchor-gray)] sm:text-sm">
              {hasLogin ? "Has an app login" : "No login yet"}{person.contactId ? " · on OEM roster" : ""}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-1.5 text-[var(--anchor-gray)] hover:bg-[var(--surface-soft)] hover:text-[var(--anchor-deep)]">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <line x1="6" y1="6" x2="18" y2="18" /><line x1="6" y1="18" x2="18" y2="6" />
            </svg>
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4 sm:px-6">
          {/* Identity */}
          <Section title="Profile">
            <div className="grid gap-3 sm:grid-cols-2">
              <Text label="First name" value={firstName} onChange={setFirstName} />
              <Text label="Last name" value={lastName} onChange={setLastName} />
              <Text label="Email" type="email" value={email} onChange={setEmail} />
              <Text label="Phone" type="tel" value={phone} onChange={setPhone} />
              <Text label="Company" value={company} onChange={setCompany} />
              {hasLogin && <Text label="Service area / state" value={serviceState} onChange={setServiceState} />}
            </div>
          </Section>

          {/* Type */}
          <Section title="Type">
            <div className="flex flex-wrap gap-2">
              {KIND_OPTIONS.map((o) => (
                <Chip key={o.key} active={kind === o.key} onClick={() => setKind(o.key)}>{o.label}</Chip>
              ))}
            </div>
          </Section>

          {/* OEM details */}
          {isOem && (
            <Section title="OEM details">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="grid gap-1 text-sm sm:col-span-2">
                  <span className="font-semibold text-[var(--anchor-deep)]">
                    Manufacturers{manufacturers.length > 0 && <span className="ml-1 font-normal text-[var(--anchor-gray)]">· {manufacturers.length}</span>}
                  </span>
                  <p className="text-[11px] text-[var(--anchor-gray)]">{isConsultant ? "OEMs this consultant works with." : "Every OEM this rep covers — pick one or more."}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {oemOptions.map((m) => (
                      <Chip key={m} active={manufacturers.includes(m)} onClick={() => toggleOem(m)}>{m}</Chip>
                    ))}
                    {oemOptions.length === 0 && <span className="text-xs text-[var(--anchor-gray)]">No manufacturers yet — add one below.</span>}
                  </div>
                  <div className="mt-1 flex gap-2">
                    <input
                      value={newOem}
                      onChange={(e) => setNewOem(e.target.value)}
                      placeholder="Add manufacturer…"
                      className="h-9 flex-1 rounded-xl border border-[var(--border-default)] bg-white px-3 text-sm outline-none focus:border-[var(--anchor-green)]"
                    />
                    <button
                      type="button"
                      onClick={() => { const v = newOem.trim(); if (v && !manufacturers.includes(v)) setManufacturers((p) => [...p, v]); setNewOem(""); }}
                      className="rounded-lg border border-[var(--border-default)] bg-white px-3 text-sm font-semibold text-[var(--anchor-deep)] hover:bg-[var(--surface-soft)]"
                    >
                      Add
                    </button>
                  </div>
                </div>
                <Text label="Title" value={title} onChange={setTitle} />
                <Text label="Territory" value={territory} onChange={setTerritory} />
                <Text label="Region" value={region} onChange={setRegion} />
                <label className="flex items-start gap-2 text-sm sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={anchorCommission}
                    onChange={(e) => setAnchorCommission(e.target.checked)}
                    className="mt-0.5 h-4 w-4 accent-[var(--anchor-green)]"
                  />
                  <span>
                    <span className="font-semibold text-[var(--anchor-deep)]">Anchor commission</span>
                    <span className="block text-[11px] text-[var(--anchor-gray)]">Tag this rep/consultant as on an Anchor commission arrangement.</span>
                  </span>
                </label>
              </div>
            </Section>
          )}

          {/* Role & account — only for people with a login. */}
          {hasLogin && (
            <Section title="Access & account">
              <div className="grid gap-1 text-sm">
                <span className="font-semibold text-[var(--anchor-deep)]">Role</span>
                <div className="flex flex-wrap gap-2">
                  {(["external_rep", "anchor_rep", "admin"] as RoleKey[]).map((r) => (
                    <Chip key={r} active={role === r} disabled={isSelf && r !== "admin"} onClick={() => setRole(r)}>{ROLE_LABEL[r]}</Chip>
                  ))}
                </div>
                {isSelf && <span className="text-[11px] text-[var(--anchor-gray)]">You can&apos;t change your own role.</span>}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" disabled={busy} onClick={sendReset} className="rounded-lg border border-[var(--border-default)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--anchor-deep)] hover:bg-[var(--surface-soft)] disabled:opacity-50">
                  Send password reset
                </button>
              </div>
            </Section>
          )}
        </div>

        <div className="flex flex-col gap-2 border-t border-[var(--border-default)] bg-[var(--surface-soft)] px-5 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div className="flex items-center gap-3">
            {!isSelf && (
              <button
                type="button"
                disabled={busy}
                onClick={remove}
                onBlur={() => setConfirmDelete(false)}
                className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
              >
                {confirmDelete ? "Click to confirm delete" : "Delete"}
              </button>
            )}
            {msg && <span className={`text-xs ${msg.kind === "err" ? "text-red-700" : "text-[var(--anchor-green)]"}`}>{msg.text}</span>}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={onClose} disabled={busy} className="rounded-lg border border-[var(--border-default)] bg-white px-3 py-1.5 text-sm font-semibold text-[var(--text-primary)] hover:bg-white disabled:opacity-60">Cancel</button>
            <button type="button" onClick={save} disabled={busy} className="rounded-lg bg-[var(--anchor-green)] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[var(--anchor-deep)] disabled:opacity-60">{busy ? "Saving…" : "Save"}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--anchor-gray)]">{title}</div>
      {children}
    </div>
  );
}

function Text({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <label className="grid gap-1 text-sm">
      <span className="font-semibold text-[var(--anchor-deep)]">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-10 rounded-xl border border-[var(--border-default)] bg-white px-3 text-sm outline-none focus:border-[var(--anchor-green)]"
      />
    </label>
  );
}

function Chip({ active, disabled, onClick, children }: { active: boolean; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={
        "rounded-full border px-3 py-1.5 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 " +
        (active
          ? "border-[var(--anchor-green)] bg-[var(--anchor-green)] text-white"
          : "border-[var(--border-default)] bg-white text-[var(--text-primary)] hover:bg-[var(--surface-soft)]")
      }
    >
      {children}
    </button>
  );
}
