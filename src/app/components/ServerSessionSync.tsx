// src/app/components/ServerSessionSync.tsx
//
// Keeps the server's session cookies in step with the browser's session on
// every page, not just the dashboard: once on load, and again whenever the
// browser signs in or refreshes its token. See lib/supabase/sessionSync.
"use client";

import { useEffect } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import { syncServerSession } from "@/lib/supabase/sessionSync";

export function ServerSessionSync() {
  useEffect(() => {
    void syncServerSession();
    const { data } = supabaseBrowser().auth.onAuthStateChange((event) => {
      if (event === "TOKEN_REFRESHED" || event === "SIGNED_IN") void syncServerSession();
    });
    return () => data.subscription.unsubscribe();
  }, []);
  return null;
}
