"use server";

import supabase from "@/config/supabaseClient";
import { hash } from "bcrypt";

export async function createUserAccount(formData: FormData) {
  const name = formData.get("name") as string;
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  try {
    // ✅ Check if the email already exists in createUserAccount table
    const { data: existingUser, error: existingUserError } = await supabase
      .from("createUserAccount")
      .select("email")
      .eq("email", email)
      .maybeSingle();

    if (existingUserError) {
      console.error("Error checking existing user:", existingUserError);
      return {
        success: false,
        message: "Error checking existing user",
      };
    }

    if (existingUser) {
      return {
        success: false,
        message: "An account with this email already exists",
      };
    }

    // ✅ Hash the password
    const hashedPassword = await hash(password, 10);

    // ✅ Insert the user into createUserAccount table
    const { error } = await supabase.from("createUserAccount").insert({
      name,
      email,
      password: hashedPassword,
      created_at: new Date().toISOString(),
    });

    if (error) {
      console.error("Error inserting user:", error);
      return {
        success: false,
        message: error.message || "Failed to create account",
      };
    }

    return {
      success: true,
      message: "Account created successfully",
    };
  } catch (err) {
    console.error("Unexpected error:", err);
    return {
      success: false,
      message: "An unexpected error occurred",
    };
  }
}
