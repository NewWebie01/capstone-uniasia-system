import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";
import { NextRequest, NextResponse } from "next/server";

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient({ req, res });
  const { data: { session } } = await supabase.auth.getSession();
  const pathname = req.nextUrl.pathname;

  // Public pages (unauthenticated access allowed)
  const PUBLIC_PATHS = ["/login", "/reset", "/account_creation", "/otp-verification"];
  if (
    PUBLIC_PATHS.some((p) => pathname.startsWith(p)) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/assets")
  ) {
    return res;
  }

  // ADMIN-only modules
  const adminOnly = [
    "/dashboard", "/activity-log", "/account-request", "/backups", "/settings"
  ];

  // CASHIER modules (admin or cashier)
 const cashierModules = [
  "/sales", "/invoice", "/payments", "/returns", "/transaction-history", "/inventory" 
];

  // WAREHOUSE modules
  const warehouseModules = ["/inventory"];

  // TRUCKER modules
  const truckerModules = ["/logistics", "/logistics/delivered"];

  // --- ADMIN ONLY ---
  if (adminOnly.some((p) => pathname.startsWith(p))) {
    if (!session || session.user.user_metadata?.role !== "admin") {
      return NextResponse.redirect(new URL("/login", req.url));
    }
  }

  // --- CASHIER OR ADMIN ---
if (cashierModules.some((p) => pathname.startsWith(p))) {
  const role = session?.user?.user_metadata?.role;
  if (!session || !(role === "admin" || role === "cashier")) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
}


  // --- WAREHOUSE ONLY ---
  if (warehouseModules.some((p) => pathname.startsWith(p))) {
    const role = session?.user?.user_metadata?.role;
    if (!session || role !== "warehouse") {
      return NextResponse.redirect(new URL("/login", req.url));
    }
  }

  // --- TRUCKER ONLY ---
  if (truckerModules.some((p) => pathname.startsWith(p))) {
    const role = session?.user?.user_metadata?.role;
    if (!session || role !== "trucker") {
      return NextResponse.redirect(new URL("/login", req.url));
    }
  }

  // --- CUSTOMER ---
  if (pathname.startsWith("/customer")) {
    if (!session || session.user.user_metadata?.role !== "customer") {
      return NextResponse.redirect(new URL("/login", req.url));
    }
  }

  return res;
}

export const config = {
  matcher: [
    // Admin-only
    "/dashboard/:path*",
    "/activity-log/:path*",
    "/account-request/:path*",
    "/backups/:path*",
    "/settings/:path*",
    // Cashier (or admin)
    "/sales/:path*",
    "/invoice/:path*",
    "/payments/:path*",
    "/returns/:path*",
    "/transaction-history/:path*",
    "/inventory/:path*",
    // Warehouse ONLY
    "/inventory/:path*",
    // Trucker ONLY
    "/logistics/:path*",
    "/logistics/delivered/:path*",
    // Customer
    "/customer/:path*",
  ],
};
