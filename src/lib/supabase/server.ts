import { createServerClient } from "@supabase/ssr";

/**
 * Use this in Route Handlers (app/api/*) where you have the Request.
 * It reads cookies from the request headers and can set cookies on the response if needed.
 */
export function supabaseRoute(req: Request) {
  const cookieHeader = req.headers.get("cookie") || "";

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        // Supabase SSR expects an array of { name, value }
        getAll() {
          return cookieHeader
            .split(";")
            .map((c) => c.trim())
            .filter(Boolean)
            .map((c) => {
              const idx = c.indexOf("=");
              if (idx === -1) return { name: c, value: "" };
              return {
                name: c.slice(0, idx),
                value: decodeURIComponent(c.slice(idx + 1)),
              };
            });
        },
        // In Route Handlers we usually don't need to set cookies manually
        // because we aren't doing exchangeCodeForSession here.
        setAll() {},
      },
    }
  );
}
