"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { AppNavbar } from "@/app/components/ui/AppNavbar";
import { Card } from "@/app/components/ui/Card";
import { useTranslation } from "@/lib/i18n/useTranslation";
import { OemDirectory } from "@/app/components/admin/OemDirectory";

export const dynamic = "force-dynamic";

type UserRow = {
  id: string;
  email: string | null;
  full_name: string | null;
  phone: string | null;
  company: string | null;
  role: string | null;
  user_type: string | null;
  service_state: string | null;
  created_at: string | null;
};

type RoleKey = "admin" | "anchor_rep" | "external_rep";

type Draft = {
  full_name: string;
  email: string;
  phone: string;
  company: string;
  role: RoleKey;
};

const ROLE_LABEL: Record<RoleKey, string> = {
  admin: "Admin",
  anchor_rep: "Internal sales",
  external_rep: "External user",
};

const ROLE_BADGE_CLASS: Record<RoleKey, string> = {
  admin: "bg-[#fde68a] text-[#7c4a00]",
  anchor_rep: "bg-[var(--anchor-mint)] text-[var(--anchor-deep)]",
  external_rep: "bg-[#dbeafe] text-[#1e3a8a]",
};

function asRoleKey(v: string | null | undefined): RoleKey {
  return v === "admin" || v === "anchor_rep" || v === "external_rep" ? v : "external_rep";
}

function rowToDraft(u: UserRow): Draft {
  return {
    full_name: u.full_name || "",
    email: u.email || "",
    phone: u.phone || "",
    company: u.company || "",
    role: asRoleKey(u.role),
  };
}

function diff(prev: Draft, next: Draft) {
  const out: Partial<Draft> = {};
  if (prev.full_name !== next.full_name) out.full_name = next.full_name;
  if (prev.email.toLowerCase() !== next.email.toLowerCase()) out.email = next.email;
  if (prev.phone !== next.phone) out.phone = next.phone;
  if (prev.company !== next.company) out.company = next.company;
  if (prev.role !== next.role) out.role = next.role;
  return out;
}

export default function AdminUsersPage() {
  const router = useRouter();
  const supabase = useMemo(() => supabaseBrowser(), []);
  const { t } = useTranslation();

  const [ready, setReady] = useState(false);
  const [accessError, setAccessError] = useState<string | null>(null);
  const [me, setMe] = useState<string>("");

  const [users, setUsers] = useState<UserRow[]>([]);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | RoleKey>("all");
  const [view, setView] = useState<"users" | "oems">("users");

  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [original, setOriginal] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [rowMsg, setRowMsg] = useState<{ id: string; kind: "ok" | "err"; text: string } | null>(null);
  // Two-step delete: first click flips this to the row's id, second click on
  // the same row fires the API. Hovering off or clicking another row resets.
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Admin gate.
  useEffect(() => {
    let alive = true;
    (async () => {
      const { data } = await supabase.auth.getUser();
      if (!alive) return;
      if (!data.user) { router.replace("/"); return; }
      setMe(data.user.id);

      const { data: prof } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.user.id)
        .maybeSingle();
      if (!alive) return;
      const role = String((prof as { role?: string } | null)?.role || "");
      if (role !== "admin") {
        setAccessError("Admin access only.");
      }
      setReady(true);
    })();
    return () => { alive = false; };
  }, [router, supabase]);

  async function load() {
    setLoadErr(null);
    const res = await fetch("/api/admin/users", { cache: "no-store" });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      setLoadErr(json?.error || "Failed to load users.");
      return;
    }
    setUsers((json?.users as UserRow[]) || []);
  }

  useEffect(() => {
    if (!ready || accessError) return;
    void load();
  }, [ready, accessError]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users.filter((u) => {
      const role = asRoleKey(u.role);
      if (roleFilter !== "all" && role !== roleFilter) return false;
      if (!q) return true;
      const hay = [u.full_name, u.email, u.company, u.phone]
        .map((v) => (v || "").toLowerCase())
        .join(" ");
      return hay.includes(q);
    });
  }, [users, search, roleFilter]);

  function beginEdit(u: UserRow) {
    const d = rowToDraft(u);
    setEditing(u.id);
    setDraft(d);
    setOriginal(d);
    setRowMsg(null);
  }

  function cancelEdit() {
    setEditing(null);
    setDraft(null);
    setOriginal(null);
  }

  async function deleteUser(id: string) {
    if (confirmingDelete !== id) {
      setConfirmingDelete(id);
      setRowMsg(null);
      return;
    }
    setDeletingId(id);
    setRowMsg(null);
    try {
      const res = await fetch(`/api/admin/users?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setRowMsg({ id, kind: "err", text: json?.error || "Delete failed." });
        return;
      }
      setUsers((prev) => prev.filter((u) => u.id !== id));
      setConfirmingDelete(null);
      if (editing === id) cancelEdit();
    } catch (e: unknown) {
      setRowMsg({
        id,
        kind: "err",
        text: e instanceof Error ? e.message : "Delete failed.",
      });
    } finally {
      setDeletingId(null);
    }
  }

  async function save() {
    if (!editing || !draft || !original) return;
    const patch = diff(original, draft);
    if (Object.keys(patch).length === 0) {
      setRowMsg({ id: editing, kind: "ok", text: "Nothing to save." });
      return;
    }
    setSaving(true);
    setRowMsg(null);
    try {
      const res = await fetch("/api/admin/users", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editing, ...patch }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setRowMsg({ id: editing, kind: "err", text: json?.error || "Save failed." });
        setSaving(false);
        return;
      }
      // Optimistically merge into the table; reload in the background.
      setUsers((prev) =>
        prev.map((u) =>
          u.id === editing
            ? {
                ...u,
                full_name: patch.full_name ?? u.full_name,
                email: patch.email ?? u.email,
                phone: patch.phone ?? u.phone,
                company: patch.company ?? u.company,
                role: patch.role ?? u.role,
                user_type:
                  patch.role
                    ? patch.role === "external_rep"
                      ? "external"
                      : "internal"
                    : u.user_type,
              }
            : u
        )
      );
      setRowMsg({ id: editing, kind: "ok", text: "Saved." });
      setEditing(null);
      setDraft(null);
      setOriginal(null);
      setTimeout(() => setRowMsg(null), 2000);
      void load();
    } catch (e: unknown) {
      setRowMsg({
        id: editing,
        kind: "err",
        text: e instanceof Error ? e.message : "Save failed.",
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="ds-page">
      <AppNavbar
        title="Users"
        subtitle="Manage names, emails, phone numbers, and roles"
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
            {/* View tabs: signed-up users vs OEM contact list */}
            <div className="mb-4 flex gap-1 overflow-x-auto rounded-full border border-[var(--border-default)] bg-white p-1 sm:w-fit">
              {(
                [
                  { key: "users", label: "Users" },
                  { key: "oems", label: "OEM Contacts" },
                ] as const
              ).map((tab) => {
                const active = view === tab.key;
                return (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setView(tab.key)}
                    aria-current={active ? "page" : undefined}
                    data-track-id={`admin-users-tab-${tab.key}`}
                    className={
                      "shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition " +
                      (active
                        ? "bg-[var(--anchor-deep)] text-white shadow-sm"
                        : "text-[var(--anchor-gray)] hover:bg-[var(--surface-soft)] hover:text-[var(--anchor-deep)]")
                    }
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {view === "oems" ? (
              <OemDirectory />
            ) : (
            <>
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
                  placeholder="Search name, email, company, phone…"
                  className="h-11 w-full rounded-full border border-[var(--border-default)] bg-white pl-11 pr-4 text-sm outline-none focus:border-[var(--anchor-green)]"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                {(["all", "admin", "anchor_rep", "external_rep"] as const).map((k) => {
                  const active = roleFilter === k;
                  const label = k === "all" ? "All" : ROLE_LABEL[k as RoleKey];
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setRoleFilter(k)}
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

            {loadErr && (
              <Card className="mb-4 border-red-200 bg-red-50 p-4 text-sm text-red-700">{loadErr}</Card>
            )}

            <Card className="overflow-hidden p-0">
              <div className="flex items-center justify-between gap-3 border-b border-[var(--border-default)] px-4 py-3 text-xs text-[var(--anchor-gray)] sm:px-6">
                <span>{filtered.length} of {users.length} users</span>
              </div>

              {filtered.length === 0 ? (
                <div className="px-4 py-6 text-sm text-[var(--anchor-gray)] sm:px-6">
                  No users match.
                </div>
              ) : (
                <ul className="divide-y divide-[var(--border-default)]">
                  {filtered.map((u) => {
                    const role = asRoleKey(u.role);
                    const isEditing = editing === u.id;
                    return (
                      <li key={u.id} className="px-4 py-4 sm:px-6">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                              <span className="truncate text-sm font-semibold text-[var(--anchor-deep)] sm:text-base">
                                {u.full_name || u.email || "Unnamed user"}
                              </span>
                              <span className={`ds-badge !rounded-full ${ROLE_BADGE_CLASS[role]}`}>
                                {ROLE_LABEL[role]}
                              </span>
                              {u.id === me && (
                                <span className="ds-badge !rounded-full bg-black/5 text-black/60">You</span>
                              )}
                            </div>
                            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-[var(--anchor-gray)]">
                              <span className="truncate">{u.email || "—"}</span>
                              {u.phone && <span>· {u.phone}</span>}
                              {u.company && <span>· {u.company}</span>}
                            </div>
                          </div>

                          {!isEditing && (
                            <div className="flex shrink-0 items-center gap-2">
                              <button
                                type="button"
                                data-track-id="admin-edit-user"
                                onClick={() => beginEdit(u)}
                                className="rounded-lg border border-[var(--anchor-green)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--anchor-green)] transition-colors hover:bg-[var(--anchor-green)] hover:text-white sm:text-sm"
                              >
                                Edit
                              </button>
                              {u.id !== me && (
                                <button
                                  type="button"
                                  data-track-id="admin-delete-user"
                                  disabled={deletingId === u.id}
                                  onClick={() => void deleteUser(u.id)}
                                  onBlur={() => {
                                    if (confirmingDelete === u.id) setConfirmingDelete(null);
                                  }}
                                  className="whitespace-nowrap rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm"
                                >
                                  {deletingId === u.id
                                    ? "Deleting…"
                                    : confirmingDelete === u.id
                                    ? "Click to confirm"
                                    : "Delete"}
                                </button>
                              )}
                            </div>
                          )}
                        </div>

                        {isEditing && draft && (
                          <form
                            onSubmit={(e) => { e.preventDefault(); void save(); }}
                            className="mt-4 grid gap-3 rounded-2xl border border-[var(--border-default)] bg-[var(--surface-soft)] p-4 sm:grid-cols-2"
                          >
                            <label className="grid gap-1 text-sm">
                              <span className="font-semibold text-[var(--anchor-deep)]">Full name</span>
                              <input
                                value={draft.full_name}
                                onChange={(e) => setDraft({ ...draft, full_name: e.target.value })}
                                className="h-10 rounded-xl border border-[var(--border-default)] bg-white px-3 text-sm outline-none focus:border-[var(--anchor-green)]"
                              />
                            </label>

                            <label className="grid gap-1 text-sm">
                              <span className="font-semibold text-[var(--anchor-deep)]">Email</span>
                              <input
                                type="email"
                                value={draft.email}
                                onChange={(e) => setDraft({ ...draft, email: e.target.value })}
                                className="h-10 rounded-xl border border-[var(--border-default)] bg-white px-3 text-sm outline-none focus:border-[var(--anchor-green)]"
                              />
                            </label>

                            <label className="grid gap-1 text-sm">
                              <span className="font-semibold text-[var(--anchor-deep)]">Phone</span>
                              <input
                                type="tel"
                                value={draft.phone}
                                onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
                                className="h-10 rounded-xl border border-[var(--border-default)] bg-white px-3 text-sm outline-none focus:border-[var(--anchor-green)]"
                              />
                            </label>

                            <label className="grid gap-1 text-sm">
                              <span className="font-semibold text-[var(--anchor-deep)]">Company</span>
                              <input
                                value={draft.company}
                                onChange={(e) => setDraft({ ...draft, company: e.target.value })}
                                className="h-10 rounded-xl border border-[var(--border-default)] bg-white px-3 text-sm outline-none focus:border-[var(--anchor-green)]"
                              />
                            </label>

                            <label className="sm:col-span-2 grid gap-1 text-sm">
                              <span className="font-semibold text-[var(--anchor-deep)]">Role</span>
                              <div className="flex flex-wrap gap-2">
                                {(["external_rep", "anchor_rep", "admin"] as RoleKey[]).map((r) => {
                                  const active = draft.role === r;
                                  const selfDemote = u.id === me && r !== "admin";
                                  return (
                                    <button
                                      key={r}
                                      type="button"
                                      data-track-id={`admin-role-${r}`}
                                      disabled={selfDemote}
                                      onClick={() => setDraft({ ...draft, role: r })}
                                      title={selfDemote ? "You can't change your own role." : undefined}
                                      className={
                                        "rounded-full border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed " +
                                        (active
                                          ? "border-[var(--anchor-green)] bg-[var(--anchor-green)] text-white"
                                          : "border-[var(--border-default)] bg-white text-[var(--text-primary)] hover:bg-white")
                                      }
                                    >
                                      {ROLE_LABEL[r]}
                                    </button>
                                  );
                                })}
                              </div>
                              <div className="text-[11px] text-[var(--anchor-gray)]">
                                Changing role updates what nav, dashboard, and gated features they see.
                              </div>
                            </label>

                            <div className="sm:col-span-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                              <div className="text-xs">
                                {rowMsg && rowMsg.id === u.id && (
                                  <span
                                    className={
                                      rowMsg.kind === "err"
                                        ? "text-red-700"
                                        : "text-[var(--anchor-green)]"
                                    }
                                  >
                                    {rowMsg.text}
                                  </span>
                                )}
                              </div>
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={cancelEdit}
                                  disabled={saving}
                                  className="rounded-lg border border-[var(--border-default)] bg-white px-3 py-1.5 text-sm font-semibold text-[var(--text-primary)] hover:bg-[var(--surface-soft)] disabled:opacity-60"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="submit"
                                  data-track-id="admin-save-user"
                                  disabled={saving}
                                  className="rounded-lg bg-[var(--anchor-green)] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[var(--anchor-deep)] disabled:opacity-60"
                                >
                                  {saving ? "Saving…" : "Save"}
                                </button>
                              </div>
                            </div>
                          </form>
                        )}

                        {/* Row-level message when not in edit mode */}
                        {!isEditing && rowMsg && rowMsg.id === u.id && (
                          <div
                            className={
                              "mt-2 text-xs " +
                              (rowMsg.kind === "err" ? "text-red-700" : "text-[var(--anchor-green)]")
                            }
                          >
                            {rowMsg.text}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
            </>
            )}
          </>
        )}
      </div>
    </main>
  );
}
