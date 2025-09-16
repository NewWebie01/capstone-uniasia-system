import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";
import { NextRequest, NextResponse } from "next/server";

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient({ req, res });
  const { data: { session } } = await supabase.auth.getSession();
  const pathname = req.nextUrl.pathname;

  // ---- Allow unauthenticated access to public pages (login, signup, etc) ----
  const PUBLIC_PATHS = ["/login", "/reset", "/account_creation", "/otp-verification"];
  if (
    PUBLIC_PATHS.some((p) => pathname.startsWith(p)) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/assets")
  ) {
    return res;
  }

  // ---- ADMIN routes: must have admin role ----
  const adminRoutes = [
    "/dashboard", "/inventory", "/logistics", "/delivered",
    "/sales", "/invoice", "/returns", "/transaction-history",
    "/activity-log", "/account-request", "/settings"
  ];
  if (adminRoutes.some((p) => pathname.startsWith(p))) {
    if (!session || session.user.user_metadata?.role !== "admin") {
      return NextResponse.redirect(new URL("/login", req.url));
    }
  }

  // ---- CUSTOMER routes: must have customer role ----
  if (pathname.startsWith("/customer")) {
    if (!session || session.user.user_metadata?.role !== "customer") {
      return NextResponse.redirect(new URL("/login", req.url));
    }
  }

  return res;
}
export const config = {
  matcher: [
    // Admin side
    "/dashboard/:path*",
    "/inventory/:path*",
    "/logistics/:path*",
    "/delivered/:path*",
    "/sales/:path*",
    "/invoice/:path*",
    "/returns/:path*",
    "/transaction-history/:path*",
    "/activity-log/:path*",
    "/account-request/:path*",
    "/settings/:path*",
    // Customer side
    "/customer/:path*"
  ],
};