// import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";
// import { NextRequest, NextResponse } from "next/server";

// export async function middleware(req: NextRequest) {
//   const res = NextResponse.next();
//   const supabase = createMiddlewareClient({ req, res });

//   // Get session from Supabase
//   const {
//     data: { session },
//   } = await supabase.auth.getSession();

//   // Define restricted paths
//   const restrictedPaths = [
//     "/dashboard",
//     "/inventory",
//     "/logistics",
//     "/sales",
//     "/activity-log",
//     "/sales-report",
//     "/settings",
//   ];

//   // If the user is logged in and tries to access the signup page, redirect to dashboard
//   if (session && req.nextUrl.pathname === "/signup") {
//     return NextResponse.redirect(new URL("/dashboard", req.url));
//   }

//   // If no session and the user is trying to access a restricted path, redirect to login
//   if (
//     !session &&
//     restrictedPaths.some((path) => req.nextUrl.pathname.startsWith(path))
//   ) {
//     return NextResponse.redirect(new URL("/login", req.url));
//   }

//   return res;
// }

// export const config = {
//   matcher: [
//     "/dashboard/:path*",
//     "/inventory/:path*",
//     "/logistics/:path*",
//     "/sales/:path*",
//     "/activity-log/:path*",
//     "/sales-report/:path*",
//     "/settings/:path*",
//     "/signup",
//   ],
// };

import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";
import { NextRequest, NextResponse } from "next/server";

export async function middleware(req: NextRequest) {
  // create a NextResponse so that supabase can set or clear cookies if needed
  const res = NextResponse.next();
  const supabase = createMiddlewareClient({ req, res });
  const {
    data: { session },
  } = await supabase.auth.getSession();

  // routes requiring login
  const protectedUI = [
    "/dashboard",
    "/inventory",
    "/logistics",
    "/sales",
    "/activity-log",
    "/sales-report",
    "/settings",
  ];

  // 1️⃣ Unauthenticated → trying to hit a protected UI or the setup-admin API?
  if (
    !session &&
    (protectedUI.some((p) => req.nextUrl.pathname.startsWith(p)) ||
      req.nextUrl.pathname === "/signup" ||
      req.nextUrl.pathname === "/api/setup-admin")
  ) {
    // If it's the API route, return 401 JSON:
    if (req.nextUrl.pathname.startsWith("/api/")) {
      return new NextResponse(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }
    // Otherwise redirect to login page:
    //return NextResponse.redirect(new URL("/login", req.url));
  }

  // 2️⃣ Authenticated → but trying to reach /signup? send to dashboard:
  if (session && req.nextUrl.pathname === "/signup") {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return res;
}

export const config = {
  // apply middleware to:
  // - all protected UI routes and signup
  // - the api/setup-admin endpoint
  matcher: [
    "/dashboard/:path*",
    "/inventory/:path*",
    "/logistics/:path*",
    "/sales/:path*",
    "/activity-log/:path*",
    "/sales-report/:path*",
    "/settings/:path*",
    "/signup",
    "/api/setup-admin",
  ],
};

// TODO: THIS IS THE ORIGINAL LOGIC
// import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";
// import { NextRequest, NextResponse } from "next/server";

// export async function middleware(req: NextRequest) {
//   const res = NextResponse.next();
//   const supabase = createMiddlewareClient({ req, res });

//   // Get session from Supabase
//   const {
//     data: { session },
//   } = await supabase.auth.getSession();

//   const restrictedPaths = [
//     "/dashboard",
//     "/inventory",
//     "/logistics",
//     "/sales",
//     "/activity-log",
//     "/sales-report",
//     "/settings",
//   ];

//   // If no session and the user is trying to access a restricted path like /dashboard, redirect to login
//   if (
//     !session &&
//     restrictedPaths.some((path) => req.nextUrl.pathname.startsWith(path))
//   ) {
//     return NextResponse.redirect(new URL("/login", req.url));
//   }

//   return res;
// }

// export const config = {
//   // Apply the middleware only to /dashboard paths
//   matcher: [
//     "/dashboard/:path*",
//     "/inventory/:path*",
//     "/logistics/:path*",
//     "/sales/:path*",
//     "/activity-log/:path*",
//     "/sales-report/:path*",
//     "/settings/:path*",
//     "/signup",
//     "/api/setup-admin",
//   ],
// };
