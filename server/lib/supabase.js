import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
  console.error("Missing Supabase environment variables. Check your .env file.");
  process.exit(1);
}

// Public client — used for auth.getUser() token validation (respects RLS)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Admin client — service_role key, bypasses RLS for server-side operations only
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});