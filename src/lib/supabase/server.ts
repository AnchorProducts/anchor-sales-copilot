// src/lib/supabase/server.ts
import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";

/**
 * Use this in Route Handlers (app/api/*).
 * Reads cookies from the request and lets Supabase set cookies on the response.
 */
export function supabaseRoute(req: Request, res: NextResponse) {
  const cookieHeader = req.headers.get("cookie") || "";

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          if (!cookieHeader) return [];

          return cookieHeader
            .split(";")
            .map((c) => c.trim())
            .filter(Boolean)
            .map((c) => {
              const idx = c.indexOf("=");
              return idx === -1
                ? { name: c, value: "" }
                : {
                    name: c.slice(0, idx),
                    value: decodeURIComponent(c.slice(idx + 1)),
                  };
            });
        },

        setAll(cookiesToSet) {
          // ✅ critical: allow Supabase to persist refreshed session cookies
          cookiesToSet.forEach(({ name, value, options }) => {
            res.cookies.set(name, value, options);
          });
        },
      },
    }
  );
}
