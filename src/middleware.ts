// src/middleware.ts
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const PUBLIC_PATHS = new Set([
  "/",
  "/signup",
  "/forgot",
  "/reset",
  "/auth/callback",
  "/favicon.ico",
  "/apple-touch-icon.png",
  "/anchorp.svg",
  "/manifest.webmanifest",
  "/manifest.json",
  "/sw.js",
]);

function isPublicAssetPath(pathname: string) {
  if (pathname.startsWith("/_next")) return true;
  if (pathname.startsWith("/static")) return true;
  if (pathname.startsWith("/workbox-")) return true;
  if (pathname.startsWith("/worker-")) return true;
  if (/\.(?:png|jpg|jpeg|gif|webp|svg|ico|css|js|map|txt|xml|json|webmanifest)$/i.test(pathname)) {
    return true;
  }
  return false;
}

function isPublicPath(pathname: string) {
  if (PUBLIC_PATHS.has(pathname)) return true;
  if (isPublicAssetPath(pathname)) return true;
  return false;
}

function isAuthGuarded(pathname: string) {
  return (
    pathname.startsWith("/chat") ||
    pathname.startsWith("/api/chat") ||
    pathname.startsWith("/api/docs")
  );
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (isPublicPath(pathname)) return NextResponse.next();

  // Role-based deploy gating (UI pages only — never /api/*)
  if (!pathname.startsWith("/api")) {
    const isInternalDeploy = process.env.NEXT_PUBLIC_APP_MODE === "internal";
    const role = req.cookies.get("anchor-role")?.value;

    if (isInternalDeploy && role === "external_rep") {
      return NextResponse.redirect(new URL("/", req.url));
    }
    if (!isInternalDeploy && (role === "admin" || role === "anchor_rep")) {
      return NextResponse.redirect(new URL("/", req.url));
    }
  }

  // Supabase session guard for explicitly protected routes
  if (isAuthGuarded(pathname)) {
    const res = NextResponse.next();

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return req.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              res.cookies.set(name, value, options);
            });
          },
        },
      }
    );

    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      const loginUrl = req.nextUrl.clone();
      loginUrl.pathname = "/";
      loginUrl.searchParams.set("next", pathname);
      return NextResponse.redirect(loginUrl);
    }
    return res;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|favicon.ico|.*\\.png|.*\\.svg).*)"],
};
