import { createClient } from "@supabase/supabase-js";
import "server-only";

export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL!,               // NOT NEXT_PUBLIC
  process.env.SUPABASE_SERVICE_ROLE_KEY!,  // NOT NEXT_PUBLIC
  { auth: { persistSession: false, autoRefreshToken: false } }
);
