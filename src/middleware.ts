import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";
import { NextRequest, NextResponse } from "next/server";

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient({ req, res });
  const { data: { session } } = await supabase.auth.getSession();
  const pathname = req.nextUrl.pathname;

  // Public pages
  const PUBLIC_PATHS = ["/login", "/reset", "/account_creation", "/otp-verification"];
  if (
    PUBLIC_PATHS.some((p) => pathname.startsWith(p)) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/assets")
  ) {
    return res;
  }

  // Admin only
  const adminOnly = [
    "/dashboard", "/activity-log", "/account-request", "/backups", "/settings"
  ];
  if (adminOnly.some((p) => pathname.startsWith(p))) {
    if (!session || session.user.user_metadata?.role !== "admin") {
      return NextResponse.redirect(new URL("/login", req.url));
    }
  }

  // Cashier, Admin, Warehouse can access /inventory
if (pathname.startsWith("/inventory")) {
  const user = session?.user as any;
  const role =
    user?.user_metadata?.role ||
    user?.raw_user_meta_data?.role;
  if (!session || !["admin", "cashier", "warehouse"].includes(role)) {
    return NextResponse.redirect(new URL("/login", req.url));
  }
}


  // Cashier/Admin (no warehouse)
  const cashierModules = [
    "/sales", "/invoice", "/payments", "/returns", "/transaction-history"
  ];
  if (cashierModules.some((p) => pathname.startsWith(p))) {
    const role = session?.user?.user_metadata?.role;
    if (!session || !(role === "admin" || role === "cashier")) {
      return NextResponse.redirect(new URL("/login", req.url));
    }
  }

  // Trucker only
  const truckerModules = ["/logistics", "/logistics/delivered"];
  if (truckerModules.some((p) => pathname.startsWith(p))) {
    const role = session?.user?.user_metadata?.role;
    if (!session || role !== "trucker") {
      return NextResponse.redirect(new URL("/login", req.url));
    }
  }

  // Customer only
  if (pathname.startsWith("/customer")) {
    if (!session || session.user.user_metadata?.role !== "customer") {
      return NextResponse.redirect(new URL("/login", req.url));
    }
  }

  return res;
}

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
