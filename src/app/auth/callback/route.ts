import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") || "/chat";

  const response = NextResponse.redirect(new URL(next, url.origin));

  if (!code) return NextResponse.redirect(new URL(`/?next=${encodeURIComponent(next)}`, url.origin));

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => {
          const cookieHeader = request.headers.get("cookie") || "";
          return cookieHeader
            .split(";")
            .map((c) => c.trim())
            .filter(Boolean)
            .map((c) => {
              const idx = c.indexOf("=");
              return idx === -1
                ? { name: c, value: "" }
                : { name: c.slice(0, idx), value: decodeURIComponent(c.slice(idx + 1)) };
            });
        },
        setAll: (cookiesToSet) => {
          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL(`/?next=${encodeURIComponent(next)}`, url.origin));

  return response;
}
