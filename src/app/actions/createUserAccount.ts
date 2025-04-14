"use server";

import { createClient } from "@/utils/supabase/server";
import { hash } from "bcrypt"; // You'll need to install bcrypt

export async function createUserAccount(formData: FormData) {
  const supabase = await createClient();

  // Extract data from FormData
  const name = formData.get("name") as string;
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  try {
    // Check if email already exists
    const { data: existingUser } = await supabase
      .from("users")
      .select("email")
      .eq("email", email)
      .maybeSingle();

    if (existingUser) {
      return {
        success: false,
        message: "An account with this email already exists",
      };
    }

    // Hash password for security
    const hashedPassword = await hash(password, 10);

    // Insert user into the database
    const { error } = await supabase.from("users").insert({
      name,
      email,
      password: hashedPassword,
      created_at: new Date().toISOString(),
    });

    if (error) {
      console.error("Error creating user account:", error);
      return {
        success: false,
        message: error.message || "Failed to create account",
      };
    }

    return {
      success: true,
      message: "Account created successfully",
    };
  } catch (error) {
    console.error("Unexpected error during account creation:", error);
    return {
      success: false,
      message: "An unexpected error occurred",
    };
  }
}
