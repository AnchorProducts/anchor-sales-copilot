// src/lib/supabase/sessionSync.ts
//
// The browser keeps its Supabase session in localStorage; API routes read a
// copy of it from sb-* cookies (see supabaseRoute). The browser refreshes its
// token on its own every hour, and each refresh rotates the refresh token — so
// the copy in the cookies goes stale, and once its access token expires every
// cookie-authed API answers 401 "Unauthorized" until something re-copies it.
// That used to happen only at login and on the dashboard, so anyone who opened
// a page directly (a bookmark, the installed app resuming) hit 401s.
//
// syncServerSession() copies the browser's current session into the cookies.
// authedFetch() is fetch that, on a 401, syncs once and retries.
"use client";

import { supabaseBrowser } from "@/lib/supabase/browser";

let inflight: Promise<boolean> | null = null;

export function syncServerSession(): Promise<boolean> {
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      // getSession refreshes an expired access token before returning it.
      const { data } = await supabaseBrowser().auth.getSession();
      const s = data.session;
      if (!s) return false;
      const res = await fetch("/api/auth/sync", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ access_token: s.access_token, refresh_token: s.refresh_token }),
        cache: "no-store",
      });
      return res.ok;
    } catch {
      return false;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export async function authedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const res = await fetch(input, init);
  if (res.status !== 401) return res;
  if (!(await syncServerSession())) return res;
  return fetch(input, init);
}
