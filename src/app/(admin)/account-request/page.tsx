// src/app/account_creation/page.tsx
"use client";
import { useState } from "react";
import { toast } from "sonner";
import supabase from "@/config/supabaseClient";

export default function AccountCreationPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();

    // ⬇️ paste this block here
    const origin =
      typeof window !== "undefined"
        ? window.location.origin
        : process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { name, role: "customer" },
        emailRedirectTo: `${origin}/auth/callback`,
      },
    });

    console.log("signUp result:", { data, error });
    if (error) {
      console.error(error);
      toast.error(error.message);
      return;
    }

    toast.success("Check your email to verify your account.");
    // optionally: router.push("/login?verify=1");
  }

  return (
    <form onSubmit={handleSignup}>
      {/* your inputs for name/email/password */}
      <button type="submit">Create Account</button>
    </form>
  );
}
