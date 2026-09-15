import "server-only"

import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { requireSupabaseConfig } from "@/lib/supabase/config"
import type { Database } from "@/lib/supabase/database"

export type SupabaseServerClient = SupabaseClient<Database>

/**
 * Privileged server client. Uses the secret/service key.
 * Never import this module from a Client Component.
 */
export function createSupabaseServerClient(): SupabaseServerClient {
  const { url, secretKey } = requireSupabaseConfig()
  return createClient<Database>(url, secretKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })
}
