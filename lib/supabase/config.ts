export type SupabaseServerConfig = {
  url: string
  secretKey: string
  ready: boolean
}

function trimEnv(value: string | undefined) {
  return value?.trim() ?? ""
}

/**
 * Reads server-only Supabase settings. Safe to call during import/build:
 * missing values yield `ready: false` and never throw.
 * Do not log or return these values to the browser.
 */
export function readSupabaseConfig(
  env: Record<string, string | undefined> = process.env,
): SupabaseServerConfig {
  const url = trimEnv(env.SUPABASE_URL)
  const secretKey = trimEnv(env.SUPABASE_SECRET_KEY)
  return {
    url,
    secretKey,
    ready: Boolean(url && secretKey),
  }
}

export function requireSupabaseConfig(
  env: Record<string, string | undefined> = process.env,
): { url: string; secretKey: string } {
  const config = readSupabaseConfig(env)
  if (!config.ready) {
    throw new Error(
      "Supabase is not configured. Set SUPABASE_URL and SUPABASE_SECRET_KEY on the server.",
    )
  }
  return { url: config.url, secretKey: config.secretKey }
}
