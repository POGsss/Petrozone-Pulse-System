import { createClient, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../types/database.types.js";

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error("Missing Supabase environment variables");
}

// console.log("Supabase URL:", supabaseUrl);
// console.log("Service key loaded:", supabaseServiceKey ? "YES (length: " + supabaseServiceKey.length + ")" : "NO");

// Service role client for admin operations (bypasses RLS)
// Using global headers to ensure service role is properly set
export const supabaseAdmin: SupabaseClient<Database> = createClient<Database>(
  supabaseUrl,
  supabaseServiceKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        // Force the service role to be recognized
        'x-supabase-role': 'service_role',
      },
    },
  }
);

// Anon client for public operations (respects RLS)
export const supabaseAnon: SupabaseClient<Database> = createClient<Database>(
  supabaseUrl,
  supabaseAnonKey
);

// Create a client with user's JWT for authenticated operations
export function createSupabaseClient(accessToken: string): SupabaseClient<Database> {
  return createClient<Database>(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  });
}
