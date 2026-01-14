// src/lib/supabase/server.ts
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function supabaseRoute() {
  // Next 16: cookies() is async
  const cookieStore = await cookies();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error(
      "Missing env vars: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY"
    );
  }

  return createServerClient(url, anonKey, {
    cookies: {
      // ✅ REQUIRED by newer @supabase/ssr
      getAll() {
        // next/headers cookies().getAll() returns objects w/ name/value already
        return cookieStore.getAll().map((c) => ({ name: c.name, value: c.value }));
      },

      // ✅ REQUIRED by newer @supabase/ssr
      setAll(cookiesToSet) {
        try {
          for (const c of cookiesToSet) {
            cookieStore.set({
              name: c.name,
              value: c.value,
              ...(c.options || {}),
            });
          }
        } catch {
          // Some render paths disallow setting cookies; reads still work.
        }
      },
    },
  });
}
