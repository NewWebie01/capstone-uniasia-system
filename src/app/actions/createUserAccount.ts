// app/actions/createUserAccount.ts
"use server";

import { createServerActionClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function createUserAccount(formData: FormData) {
  const name = formData.get("name") as string;
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const supabase = createServerActionClient({ cookies });

  // Step 1: Create user in Supabase Auth
  const { data: authData, error: authError } =
    await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // auto-confirm email
    });

  if (authError) {
    console.error("Supabase Auth error:", authError);
    return { success: false, message: authError.message };
  }

  const userId = authData.user?.id;

  // Step 2: Add additional info to your custom user table
  const { error: insertError } = await supabase
    .from("createUserAccount")
    .insert([{ id: userId, name, email }]);

  if (insertError) {
    console.error("Insert custom user info error:", insertError);
    return { success: false, message: insertError.message };
  }

  return { success: true };
}
