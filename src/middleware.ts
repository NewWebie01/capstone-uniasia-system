// /middleware.ts
import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";
import { NextRequest, NextResponse } from "next/server";

// Publicly accessible paths (no login needed)
const PUBLIC_PATHS = [
  "/login",
  "/reset",
  "/account_creation",
  "/otp-verification",
  "/favicon.ico",
  "/robots.txt",
  "/manifest.json",
  "/api/send-otp",
];

// Admin and Customer route prefixes
const ADMIN_PATHS = ["/admin"];
const CUSTOMER_PATHS = ["/customer"];

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient({ req, res });
  const { data: { session } } = await supabase.auth.getSession();
  const pathname = req.nextUrl.pathname;

  // Allow Next.js internals and static files always
  if (
    PUBLIC_PATHS.some((p) => pathname.startsWith(p)) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/assets")
  ) {
    return res;
  }

  // If accessing a protected module (admin or customer) but NOT logged in
  const isProtected =
    ADMIN_PATHS.some((p) => pathname.startsWith(p)) ||
    CUSTOMER_PATHS.some((p) => pathname.startsWith(p));
  if (!session && isProtected) {
    // API? Respond with 401
    if (pathname.startsWith("/api/")) {
      return new NextResponse(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    // UI? Redirect to login
    const loginUrl = new URL("/login", req.url);
    loginUrl.searchParams.set("redirect", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Role-based block (admin/customer enforcement)
  if (session) {
    const role = session.user.user_metadata?.role;
    if (
      ADMIN_PATHS.some((p) => pathname.startsWith(p)) &&
      role !== "admin"
    ) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
    if (
      CUSTOMER_PATHS.some((p) => pathname.startsWith(p)) &&
      role !== "customer"
    ) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
  }

  return res;
}

// Apply to everything except _next, assets, and public files
export const config = {
  matcher: [
    "/((?!_next|assets|favicon.ico|robots.txt|manifest.json).*)",
  ],
};
