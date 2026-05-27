import supabase from "@/config/supabaseClient";

export async function logActivity(action: string, details: any = {}) {
  try {
    const { data } = await supabase.auth.getUser();
    await supabase.from("activity_logs").insert([
      {
        user_email: data?.user?.email || "",
        user_role: "admin",
        action,
        details,
        created_at: new Date().toISOString(),
      },
    ]);
  } catch (e) {
    // swallow errors; logging shouldn't break the API
    console.error("logActivity failed:", e);
  }
}
