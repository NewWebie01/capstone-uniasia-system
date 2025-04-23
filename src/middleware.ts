// import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";
// import { NextRequest, NextResponse } from "next/server";

// export async function middleware(req: NextRequest) {
//   const res = NextResponse.next();

//   const supabaseClient = createMiddlewareClient({ req, res });

//   const {
//     data: { session },
//   } = await supabaseClient.auth.getSession();

//   console.log("Session: ", session);

//   if (!session) {
//     return NextResponse.redirect(new URL("/login", req.url));
//   }

//   return res;
// }

// export const config = {
//   matcher: ["/dashboard/:path*"],
// };
import { createMiddlewareClient } from "@supabase/auth-helpers-nextjs";
import { NextRequest, NextResponse } from "next/server";

export async function middleware(req: NextRequest) {
  const res = NextResponse.next();
  const supabase = createMiddlewareClient({ req, res });

  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session && req.nextUrl.pathname.startsWith("/dashboard")) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return res;
}

export const config = {
  matcher: ["/dashboard/:path*"],
};
