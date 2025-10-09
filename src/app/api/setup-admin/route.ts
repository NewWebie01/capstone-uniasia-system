// app/api/setup-admin/route.ts

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Use .env variables for secure server-side client
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const ALLOWED_EMAILS = [
  "gmail.com", "hotmail.com", "yahoo.com", "uniasia.com"
];

export async function POST(req: Request) {
  try {
    const body = await req.json();
    let { email, password, name, role } = body;

    // --- Validate inputs
    if (!email || !password) {
      return NextResponse.json(
        { error: "Email and password are required." },
        { status: 400 }
      );
    }

    // --- Email validation
    const domain = (email.split("@")[1] || "").toLowerCase();
    if (!ALLOWED_EMAILS.some(d => domain.endsWith(d))) {
      return NextResponse.json(
        { error: "Only personal (@gmail.com, @hotmail.com, @yahoo.com) or company (@uniasia.com) emails allowed." },
        { status: 400 }
      );
    }

    // --- Name required
    if (!name || typeof name !== "string" || name.trim().length < 2) {
      return NextResponse.json(
        { error: "Full name is required." },
        { status: 400 }
      );
    }

    // --- Role default
    if (!role || typeof role !== "string" || !role.trim()) {
      role = "customer";
    }

    // --- Create user in Supabase Auth
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        name: name.trim(),
        role: role.trim().toLowerCase(),
      },
    });

    // --- Handle errors
    if (error) {
      // Friendly error messages
      if (error.message?.toLowerCase().includes("user already registered")) {
        return NextResponse.json(
          { error: "This email address is already registered. Please use a different email." },
          { status: 400 }
        );
      }
      if (error.message?.toLowerCase().includes("password")) {
        return NextResponse.json(
          { error: "Password does not meet minimum requirements. Please choose a stronger password." },
          { status: 400 }
        );
      }
      return NextResponse.json(
        { error: error.message || "Unexpected error creating user." },
        { status: 500 }
      );
    }

    // --- Success: Do NOT send password or sensitive data back
    return NextResponse.json({
      success: true,
      user_id: data?.user?.id || null,
      email: data?.user?.email || email,
      role: role,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: "Unexpected server error", details: err?.message },
      { status: 500 }
    );
  }
}
