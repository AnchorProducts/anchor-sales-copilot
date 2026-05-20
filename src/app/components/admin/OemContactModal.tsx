"use client";

import { useEffect, useState } from "react";

export type OemContactFormValues = {
  manufacturer: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  cell: string;
  title: string;
  territory: string;
  region: string;
};

export type OemContactRecord = OemContactFormValues & { id: string };

const EMPTY: OemContactFormValues = {
  manufacturer: "",
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  cell: "",
  title: "",
  territory: "",
  region: "",
};

type Mode = "add" | "edit";

export function OemContactModal({
  open,
  mode,
  initialValues,
  contactId,
  knownManufacturers,
  onClose,
  onSaved,
  onDeleted,
}: {
  open: boolean;
  mode: Mode;
  initialValues?: Partial<OemContactFormValues>;
  contactId?: string;
  knownManufacturers: string[];
  onClose: () => void;
  onSaved: () => void;
  onDeleted?: () => void;
}) {
  const [values, setValues] = useState<OemContactFormValues>({ ...EMPTY, ...initialValues });
  const [busy, setBusy] = useState<"save" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Re-seed values when the modal is opened with new initial values.
  useEffect(() => {
    if (!open) return;
    setValues({ ...EMPTY, ...initialValues });
    setError(null);
    setConfirmDelete(false);
  }, [open, initialValues]);

  // Lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (!open) return null;

  function setField<K extends keyof OemContactFormValues>(key: K, v: string) {
    setValues((prev) => ({ ...prev, [key]: v }));
  }

  async function handleSave() {
    setBusy("save");
    setError(null);
    try {
      if (!values.manufacturer.trim()) {
        setError("Manufacturer is required.");
        return;
      }
      const url = mode === "edit" && contactId
        ? `/api/admin/manufacturer-contacts/${contactId}`
        : `/api/admin/manufacturer-contacts`;
      const method = mode === "edit" ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body?.error || "Failed to save contact.");
        return;
      }
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save contact.");
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete() {
    if (!contactId) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setBusy("delete");
    setError(null);
    try {
      const res = await fetch(`/api/admin/manufacturer-contacts/${contactId}`, {
        method: "DELETE",
        credentials: "include",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body?.error || "Failed to delete contact.");
        return;
      }
      onDeleted?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to delete contact.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={mode === "edit" ? "Edit OEM contact" : "Add OEM contact"}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="flex max-h-[95vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:max-w-lg sm:rounded-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-default)] px-5 py-3">
          <h3 className="text-base font-bold text-[var(--anchor-deep)] sm:text-lg">
            {mode === "edit" ? "Edit OEM contact" : "Add OEM contact"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1.5 text-[var(--anchor-gray)] hover:bg-[var(--surface-soft)] hover:text-[var(--anchor-deep)]"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="6" y1="18" x2="18" y2="6" />
            </svg>
          </button>
        </div>

        {/* Form */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error && (
            <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}

          <div className="space-y-3">
            <FieldInput
              label="Manufacturer"
              required
              value={values.manufacturer}
              onChange={(v) => setField("manufacturer", v)}
              listId="oem-list"
              suggestions={knownManufacturers}
              placeholder="e.g. Unirac"
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <FieldInput label="First name" value={values.first_name} onChange={(v) => setField("first_name", v)} />
              <FieldInput label="Last name" value={values.last_name} onChange={(v) => setField("last_name", v)} />
            </div>
            <FieldInput
              label="Email"
              type="email"
              value={values.email}
              onChange={(v) => setField("email", v)}
              placeholder="name@company.com"
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <FieldInput label="Phone" value={values.phone} onChange={(v) => setField("phone", v)} />
              <FieldInput label="Cell" value={values.cell} onChange={(v) => setField("cell", v)} />
            </div>
            <FieldInput label="Title" value={values.title} onChange={(v) => setField("title", v)} />
            <div className="grid gap-3 sm:grid-cols-2">
              <FieldInput label="Region" value={values.region} onChange={(v) => setField("region", v)} />
              <FieldInput label="Territory" value={values.territory} onChange={(v) => setField("territory", v)} />
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border-default)] bg-[var(--surface-soft)] px-5 py-3">
          <div>
            {mode === "edit" && onDeleted && contactId && (
              <button
                type="button"
                onClick={handleDelete}
                disabled={busy !== null}
                className="rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 transition-colors hover:bg-red-50 disabled:opacity-50"
              >
                {busy === "delete"
                  ? "Deleting…"
                  : confirmDelete
                  ? "Click again to confirm"
                  : "Delete"}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={busy !== null}
              className="rounded-lg border border-[var(--border-default)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--anchor-gray)] hover:text-[var(--anchor-deep)] disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={busy !== null}
              className="rounded-lg border border-[var(--anchor-green)] bg-[var(--anchor-green)] px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-[var(--anchor-deep)] disabled:opacity-50"
            >
              {busy === "save" ? "Saving…" : mode === "edit" ? "Save changes" : "Create contact"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function FieldInput({
  label,
  value,
  onChange,
  required,
  type = "text",
  placeholder,
  listId,
  suggestions,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
  type?: string;
  placeholder?: string;
  listId?: string;
  suggestions?: string[];
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-[var(--anchor-gray)]">
        {label} {required && <span className="text-red-500">*</span>}
      </span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        list={listId}
        className="w-full rounded-lg border border-[var(--border-default)] bg-white px-3 py-2 text-sm text-[var(--text-primary)] outline-none transition focus:border-[var(--anchor-green)]"
      />
      {listId && suggestions && (
        <datalist id={listId}>
          {suggestions.map((s) => <option key={s} value={s} />)}
        </datalist>
      )}
    </label>
  );
}
