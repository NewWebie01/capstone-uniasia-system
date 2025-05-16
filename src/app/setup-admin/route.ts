import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Server-only client with Service Role key
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(req: Request) {
  try {
    const { name, email, password } = await req.json();
    if (!email || !password || !name) {
      return NextResponse.json(
        { error: "All fields are required" },
        { status: 400 }
      );
    }

    // 1) Create in Supabase Auth (auto-confirmed)
    const { data, error: authError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name, role: "admin" },
      });
    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 500 });
    }

    // 2) Insert into your custom table
    const { error: insertError } = await supabaseAdmin
      .from("createUserAccount")
      .insert([{ user_id: data.user!.id, name, email, role: "admin" }]);
    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, user: data.user });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
