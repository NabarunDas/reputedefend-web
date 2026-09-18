import "server-only"
import { createClient } from "@supabase/supabase-js"
import { createHash, randomBytes } from "node:crypto"
import { customerConfig } from "./config"

export const newToken = () => randomBytes(32).toString("hex")
export const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex")
export const validToken = (token: string | undefined): token is string => !!token && /^[a-f0-9]{64}$/.test(token)
export function backend() {
  const config = customerConfig()
  if (!config) throw new Error("Customer actions are not configured")
  const options = {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: { fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, { ...init, cache: "no-store", signal: AbortSignal.timeout(8000) }) },
  }
  const database = createClient(config.url, config.secret, options)
  const identity = createClient(config.url, config.publishable, options)
  return {
    identity,
    database,
    revokeProviderSession: (jwt: string) => database.auth.admin.signOut(jwt, "local"),
    async rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
      const { data, error } = await database.rpc(name, args)
      if (error) throw new Error("Customer action storage unavailable")
      return data as T
    },
  }
}
export async function actionSessionFromToken(token: string | undefined) {
  if (!customerConfig() || !validToken(token)) return null
  try { return await backend().rpc<Record<string, unknown> | null>("customer_action_session_v1", { p_token_hash: tokenHash(token) }) }
  catch { return null }
}
