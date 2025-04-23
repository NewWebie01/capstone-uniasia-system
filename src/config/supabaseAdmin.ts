// ❗ Server-only Supabase client with Service Role Key
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!, // Keep this public
  process.env.SUPABASE_SERVICE_ROLE_KEY! // ❗This is PRIVATE
);
export default supabaseAdmin;
