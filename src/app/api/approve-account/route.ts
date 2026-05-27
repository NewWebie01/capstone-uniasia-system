// src/app/api/approve-account/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Use env variables for security (not public keys!)
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { id, role, password } = body;

    // 1. Get the account request row (must include email & name)
    const { data: request, error: fetchErr } = await supabaseAdmin
      .from("account_requests")
      .select("*")
      .eq("id", id)
      .single();
    if (fetchErr || !request) throw new Error("Account request not found.");

    // 2. Create user in Supabase Auth
    const { data: userData, error: userErr } = await supabaseAdmin.auth.admin.createUser({
      email: request.email,
      password,
      user_metadata: {
        name: request.name,
        contact_number: request.contact_number,
        role,
      },
      email_confirm: true,
    });
    if (userErr || !userData?.user) throw new Error(userErr?.message || "Failed to create user in Auth.");
    const auth_user_id = userData.user.id;

    // 3. Update the account_requests row: status=Approved, set role, link auth_user_id
    const { error: updateErr } = await supabaseAdmin
      .from("account_requests")
      .update({ status: "Approved", role, auth_user_id })
      .eq("id", id);
    if (updateErr) throw updateErr;

    return NextResponse.json({ success: true, auth_user_id });
  } catch (e: any) {
    console.error("[/api/approve-account]", e);
    return NextResponse.json(
      { error: e.message || "Server error" },
      { status: 500 }
    );
  }
}
