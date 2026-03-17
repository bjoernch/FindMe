import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// Public paths that don't require auth
const publicPaths = [
  "/auth",
  "/api/auth/register",
  "/api/auth/login",
  "/api/auth/refresh",
  "/api/auth/callback",
  "/api/auth/csrf",
  "/api/auth/providers",
  "/api/auth/session",
  "/api/auth/signin",
  "/api/auth/signout",
  "/api/auth/passkey/login-options",
  "/api/auth/passkey/login-verify",
  "/api/auth/passkey/login-verify-mobile",
  "/api/auth/passkey/exchange",
  "/api/auth/qr-auth",
  "/api/location/update",
  "/api/version",
  "/share",
];

function isPublicPath(pathname: string): boolean {
  return publicPaths.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
}

// Share token public endpoint
function isShareTokenPath(pathname: string): boolean {
  return /^\/api\/share\/[^/]+$/.test(pathname);
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Log API requests (skip static assets and internal Next.js routes)
  if (pathname.startsWith("/api/")) {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "direct";
    console.log(
      `${new Date().toISOString()} INF [http] ${request.method} ${pathname} ip=${ip}`
    );
  }

  // Allow public paths
  if (
    isPublicPath(pathname) ||
    isShareTokenPath(pathname) ||
    pathname === "/" ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/leaflet")
  ) {
    return NextResponse.next();
  }

  // For dashboard routes, check for session cookie
  if (pathname.startsWith("/dashboard")) {
    const sessionToken =
      request.cookies.get("authjs.session-token") ||
      request.cookies.get("__Secure-authjs.session-token");

    if (!sessionToken) {
      const loginUrl = new URL("/auth", request.url);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  // For API routes, check for auth header or session cookie
  if (pathname.startsWith("/api/")) {
    const hasAuthHeader = request.headers.has("authorization");
    const hasSessionCookie =
      request.cookies.has("authjs.session-token") ||
      request.cookies.has("__Secure-authjs.session-token");

    if (!hasAuthHeader && !hasSessionCookie) {
      return NextResponse.json(
        { success: false, data: null, error: "Authentication required" },
        { status: 401 }
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/dashboard/:path*", "/api/:path*"],
};
