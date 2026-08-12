"use client";

// Irreversible-action guard for deleting a user.
//
// Deleting a person is one of the few things in this app that can't be undone,
// so the dialog does two things before it will arm: it fetches the REAL counts
// from the server and shows them split into what dies and what survives, and it
// makes the admin type the person's name. Nobody should discover after the fact
// that a rep had seven commission claims attached.

import { useEffect, useState } from "react";
import Modal from "@/app/components/ui/Modal";
import { Input } from "@/app/components/ui/Field";

type Impact = {
  user: { id: string; full_name: string | null; email: string | null; role: string | null };
  isSelf: boolean;
  erased: Record<string, number>;
  kept: Record<string, number>;
};

export default function DeleteUserModal({
  userId,
  onClose,
  onDeleted,
}: {
  userId: string;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [impact, setImpact] = useState<Impact | null>(null);
  const [loading, setLoading] = useState(true);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/admin/users", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "delete-impact", id: userId }),
        });
        const json = await res.json().catch(() => null);
        if (!alive) return;
        if (!res.ok) setError(json?.error || "Couldn't load this user.");
        else setImpact(json);
      } catch (e: any) {
        if (alive) setError(e?.message || "Couldn't load this user.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [userId]);

  // What they have to type. Falls back to the email when someone has no name.
  const confirmWord = (impact?.user.full_name || impact?.user.email || "").trim();
  const armed = confirmWord.length > 0 && typed.trim().toLowerCase() === confirmWord.toLowerCase();

  // Only the lines that are actually non-zero — a wall of "0" hides the number
  // that matters.
  const rows = (m: Record<string, number> | undefined) =>
    Object.entries(m || {}).filter(([, n]) => n > 0);

  async function remove() {
    if (!armed) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users?id=${encodeURIComponent(userId)}`, {
        method: "DELETE",
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setError(json?.error || "Delete failed.");
        return;
      }
      onDeleted();
    } catch (e: any) {
      setError(e?.message || "Delete failed.");
    } finally {
      setBusy(false);
    }
  }

  const erasedRows = rows(impact?.erased);
  const keptRows = rows(impact?.kept);

  return (
    <Modal open className="max-w-lg">
      <div className="p-5">
        <h2 className="text-lg font-bold text-red-700">
          Delete {impact?.user.full_name || impact?.user.email || "this user"} permanently
        </h2>

        {loading ? (
          <p className="mt-3 text-sm text-[var(--anchor-gray)]">Checking what this would remove…</p>
        ) : error && !impact ? (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : impact?.isSelf ? (
          <p className="mt-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            This is your own account — you can&apos;t delete it. Ask another admin.
          </p>
        ) : (
          <>
            <p className="mt-2 text-sm text-[var(--anchor-gray)]">
              This cannot be undone. Their login and personal data are destroyed; the work they
              logged stays, shown as <strong>Deleted user</strong>.
            </p>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-red-200 bg-red-50 p-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-red-700">
                  Erased
                </div>
                <ul className="mt-1.5 grid gap-0.5 text-sm text-red-900">
                  <li>Login &amp; password</li>
                  <li>Name, email, phone, territory</li>
                  {erasedRows.map(([label, n]) => (
                    <li key={label}>
                      {n} {label}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-soft)] p-3">
                <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--anchor-gray)]">
                  Kept as &ldquo;Deleted user&rdquo;
                </div>
                {keptRows.length === 0 ? (
                  <p className="mt-1.5 text-sm text-[var(--anchor-gray)]">
                    Nothing — they never logged any work.
                  </p>
                ) : (
                  <ul className="mt-1.5 grid gap-0.5 text-sm text-black">
                    {keptRows.map(([label, n]) => (
                      <li key={label}>
                        {n} {label}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            <label className="mt-4 block text-sm">
              <span className="text-[var(--anchor-gray)]">
                Type <strong className="text-black">{confirmWord}</strong> to confirm:
              </span>
              <Input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                className="mt-1 h-11 w-full text-sm"
                placeholder={confirmWord}
                autoComplete="off"
              />
            </label>

            {error && (
              <p className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </p>
            )}
          </>
        )}

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-[var(--border-default)] bg-white px-4 text-sm font-semibold text-[var(--anchor-deep)] transition hover:bg-[var(--surface-soft)] disabled:opacity-50"
          >
            Cancel
          </button>
          {!impact?.isSelf && (
            <button
              type="button"
              onClick={remove}
              disabled={!armed || busy || loading}
              className="inline-flex h-10 items-center justify-center rounded-lg bg-red-600 px-4 text-sm font-semibold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? "Deleting…" : "Delete permanently"}
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
