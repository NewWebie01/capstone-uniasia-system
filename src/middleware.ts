import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";
import { NextRequest, NextResponse } from "next/server";

export async function middleware(req: NextRequest) {
  // Allow CORS preflight / OPTIONS early
  if (req.method === "OPTIONS") return NextResponse.next();

  const res = NextResponse.next();
  const supabase = createMiddlewareClient({ req, res });
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const pathname = req.nextUrl.pathname;

  // Public pages & endpoints that must never be blocked
  // (even if you later broaden the matcher)
// In middleware, treat /auth/callback as public
const PUBLIC_PATHS = [
  "/login",
  "/reset",
  "/account_creation",
  "/otp-verification",
  "/auth/callback",
];


  // Static assets fall-through
  if (
    PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p)) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/assets") ||
    pathname.startsWith("/favicon") ||
    pathname.startsWith("/images")
  ) {
    return res;
  }

  // ----- Role helpers -----
  const user = session?.user as any;
  const role: string | undefined =
    user?.user_metadata?.role ?? user?.raw_user_meta_data?.role;

  // ----- Admin-only modules (except logistics/delivered special case below) -----
  const adminOnly = [
    "/dashboard",
    "/activity-log",
    "/account-request",
    "/backups",
    "/settings",
  ];
  if (adminOnly.some((p) => pathname.startsWith(p))) {
    if (!session || role !== "admin") {
      return NextResponse.redirect(new URL("/login", req.url));
    }
  }

  // ----- Logistics & Delivered: allow admin OR trucker -----
  if (pathname.startsWith("/logistics") || pathname.startsWith("/logistics/delivered")) {
    if (!session || !["admin", "trucker"].includes(role || "")) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
  }

  // ----- Inventory: admin, cashier, warehouse -----
  if (pathname.startsWith("/inventory")) {
    if (!session || !["admin", "cashier", "warehouse"].includes(role || "")) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
  }

  // ----- Cashier/Admin modules -----
  const cashierModules = ["/sales", "/invoice", "/payments", "/returns", "/transaction-history"];
  if (cashierModules.some((p) => pathname.startsWith(p))) {
    if (!session || !["admin", "cashier"].includes(role || "")) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
  }

  // ----- Customer-only area -----
  if (pathname.startsWith("/customer")) {
    if (!session || role !== "customer") {
      return NextResponse.redirect(new URL("/login", req.url));
    }
  }

  return res;
}

// Keep middleware scoped only to protected sections.
// (Public pages like /, /login, /account_creation, /auth/callback won’t run through this.)
export const config = {
  matcher: [
    "/dashboard/:path*",
    "/activity-log/:path*",
    "/account-request/:path*",
    "/backups/:path*",
    "/settings/:path*",
    "/inventory/:path*",
    "/sales/:path*",
    "/invoice/:path*",
    "/payments/:path*",
    "/returns/:path*",
    "/transaction-history/:path*",
    "/logistics/:path*",
    "/logistics/delivered/:path*",
    "/customer/:path*",
  ],
};
