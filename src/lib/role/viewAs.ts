"use client";

import { useEffect, useState } from "react";

// Admin "View as" override. Lives in localStorage so it survives reloads
// and syncs across tabs via the storage event. The override only takes
// effect when the actual role is admin (defense in depth — non-admins
// can still flip the localStorage value, but useEffectiveRole ignores it).

export type AppRole = "admin" | "anchor_rep" | "external_rep";

export const VIEW_AS_KEY = "anchor.viewAsRole";
const CHANGE_EVENT = "anchor:viewAsChanged";

function isAppRole(v: unknown): v is AppRole {
  return v === "admin" || v === "anchor_rep" || v === "external_rep";
}

export function getViewAs(): AppRole | null {
  if (typeof window === "undefined") return null;
  try {
    const v = window.localStorage.getItem(VIEW_AS_KEY);
    return isAppRole(v) ? v : null;
  } catch {
    return null;
  }
}

export function setViewAs(role: AppRole | null) {
  if (typeof window === "undefined") return;
  try {
    if (role) window.localStorage.setItem(VIEW_AS_KEY, role);
    else window.localStorage.removeItem(VIEW_AS_KEY);
  } catch {
    // localStorage may be unavailable (private mode, etc.) — swallow.
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: { role } }));
}

// Read the override and stay in sync with changes from other components / tabs.
export function useViewAs(): AppRole | null {
  const [value, setValue] = useState<AppRole | null>(() => getViewAs());

  useEffect(() => {
    function onChange() {
      setValue(getViewAs());
    }
    function onStorage(e: StorageEvent) {
      if (e.key === VIEW_AS_KEY) onChange();
    }
    window.addEventListener(CHANGE_EVENT, onChange as EventListener);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(CHANGE_EVENT, onChange as EventListener);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return value;
}

// Resolve to the role the UI should render as. Override only applies when
// the real role is admin.
export function useEffectiveRole(actualRole: string | null | undefined): string | null {
  const override = useViewAs();
  if (actualRole === "admin" && override) return override;
  return actualRole ?? null;
}
