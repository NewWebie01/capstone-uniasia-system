// // app/api/setup-admin/route.ts

// import { NextResponse } from "next/server";
// import { createClient } from "@supabase/supabase-js";

// // Create the Supabase client with the service role key
// const supabaseAdmin = createClient(
//   process.env.NEXT_PUBLIC_SUPABASE_URL!,
//   process.env.SUPABASE_SERVICE_ROLE_KEY! // Service role key for server-side actions
// );

// export async function POST(req: Request) {
//   try {
//     const { email, password } = await req.json();

//     if (!email || !password) {
//       return NextResponse.json(
//         { error: "Email and password are required" },
//         { status: 400 }
//       );
//     }

//     // Create user without requiring email confirmation
//     const { data, error } = await supabaseAdmin.auth.admin.createUser({
//       email,
//       password,
//       email_confirm: true, // Force email confirmation
//     });

//     if (error) {
//       return NextResponse.json({ error: error.message }, { status: 500 });
//     }

//     // Send successful response
//     return NextResponse.json({ success: true, data });
//   } catch (err: any) {
//     return NextResponse.json(
//       { error: "Unexpected server error", details: err?.message },
//       { status: 500 }
//     );
//   }
// }
