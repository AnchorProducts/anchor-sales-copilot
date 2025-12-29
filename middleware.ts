import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = [
  "/",               // ✅ login
  "/signup",
  "/forgot",
  "/reset",
  "/auth/callback",
  "/favicon.ico",
  "/manifest.webmanifest",
  "/apple-touch-icon.png",
  "/icon-192.png",
  "/icon-512.png",
  "/anchorp.svg",
];

function isPublicPath(pathname: string) {
  if (PUBLIC_PATHS.includes(pathname)) return true;
  if (pathname.startsWith("/_next")) return true;
  return false;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // ✅ Let public routes through
  if (isPublicPath(pathname)) return NextResponse.next();

  // ✅ Protect /chat + /api/chat (and anything else you want)
  const hasSbCookie =
    req.cookies.get("sb-access-token") ||
    req.cookies.get("sb-refresh-token") ||
    // newer cookie naming can differ, so also just check for "sb-" presence
    Array.from(req.cookies.getAll()).some((c) => c.name.startsWith("sb-"));

  if (!hasSbCookie) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/chat/:path*", "/api/chat/:path*"],
};
