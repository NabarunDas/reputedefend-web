import "server-only"
import { createClient } from "@supabase/supabase-js"
import { createHash, randomBytes } from "node:crypto"
import { authConfig } from "./config"

export const newToken = () => randomBytes(32).toString("hex")
export const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex")
export const validToken = (token: string | undefined): token is string => !!token && /^[a-f0-9]{64}$/.test(token)
export function backend() {
  const config = authConfig()
  if (!config) throw new Error("Admin authentication is not configured")
  const options = {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    global: { fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, { ...init, cache: "no-store", signal: AbortSignal.timeout(8000) }) },
  }
  // Separate clients: verifying an OTP must never replace the database client's identity.
  const database = createClient(config.url, config.secret, options)
  const identity = createClient(config.url, config.publishable, options)
  return {
    identity,
    revokeProviderSession: (jwt: string) => database.auth.admin.signOut(jwt, "local"),
    async rpc<T>(name: string, args: Record<string, unknown>): Promise<T> {
      const { data, error } = await database.rpc(name, args)
      if (error) throw new Error("Admin authentication storage unavailable")
      return data as T
    },
  }
}
export type AdminSession = { id: string; userId: string; createdAt: string; expiresAt: string }
export type ListedSession = { id: string; createdAt: string; lastSeenAt: string; expiresAt: string; current: boolean }
export async function sessionFromToken(token: string | undefined): Promise<AdminSession | null> {
  if (!authConfig() || !validToken(token)) return null
  try { return await backend().rpc<AdminSession | null>("admin_session_v1", { p_token: tokenHash(token) }) }
  catch { return null } // Provider/database failures never grant access.
}
