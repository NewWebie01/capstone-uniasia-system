"use server";

import supabase from "@/config/supabaseClient";
import { compare } from "bcrypt";

export async function createUserAccount(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  try {
    // 🧠 Get user by email
    const { data: user, error } = await supabase
      .from("createUserAccount")
      .select("email, password")
      .eq("email", email)
      .maybeSingle();

    if (error || !user) {
      return {
        success: false,
        message: "Invalid credentials",
      };
    }

    // 🔐 Compare password
    const passwordMatch = await compare(password, user.password);

    if (!passwordMatch) {
      return {
        success: false,
        message: "Invalid credentials",
      };
    }

    // ✅ Login successful (you can add session handling here)
    return {
      success: true,
      message: "Login successful",
      user,
    };
  } catch (err) {
    console.error("Login error:", err);
    return {
      success: false,
      message: "An unexpected error occurred",
    };
  }
}
