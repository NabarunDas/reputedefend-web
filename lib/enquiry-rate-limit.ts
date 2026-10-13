import { createHmac } from "node:crypto"
import { readSupabaseConfig } from "@/lib/supabase/config"
import { createSupabaseServerClient } from "@/lib/supabase/server"

const WINDOW_MS = 10 * 60 * 1000
const MAX_REQUESTS = 8

export type PublicRateLimitDecision = { ok: true } | { ok: false; status: 429 | 503 }

type MemoryStore = Map<string, number[]>

const memoryStore: MemoryStore = new Map()
let memoryMode = false

/**
 * Test-only stand-in for the shared database budget. Production ignores it.
 */
export function resetEnquiryRateLimit() {
  if (process.env.NODE_ENV === "production") return
  memoryMode = true
  memoryStore.clear()
}

/** Returns the route to the shared database limiter after a test double was installed. */
export function useSharedPublicRateLimit() {
  memoryMode = false
}

/**
 * Vercel overwrites `x-vercel-forwarded-for` with the address it observed.
 * `x-forwarded-for` and `x-real-ip` are not read: a client can set them, and
 * the leftmost forwarded address is the client-controlled one.
 * A list uses the rightmost token, which is the address a trusted hop appends.
 */
export function trustedClientAddress(request: { headers: Headers }): string {
  const header = request.headers.get("x-vercel-forwarded-for")
  if (!header) return "unknown"
  const rightmost = header.split(",").map(part => part.trim()).filter(Boolean).at(-1) ?? ""
  if (isIpv4(rightmost)) return rightmost
  if (isIpv6(rightmost)) return rightmost.toLowerCase()
  return "unknown"
}

export function hashPublicClient(address: string, secret: string): string {
  return createHmac("sha256", secret).update(address).digest("hex")
}

function isIpv4(value: string): boolean {
  const parts = value.split(".")
  if (parts.length !== 4) return false
  return parts.every(part => /^(0|[1-9]\d{0,2})$/.test(part) && Number(part) <= 255)
}

function isIpv6(value: string): boolean {
  if (value.length > 45 || !value.includes(":") || value.includes(":::")) return false
  return /^[0-9a-f:]+$/i.test(value)
}

function consumeMemory(key: string, now: number, store: MemoryStore): PublicRateLimitDecision {
  const windowStart = now - WINDOW_MS
  const recent = (store.get(key) ?? []).filter(stamp => stamp > windowStart)
  if (recent.length >= MAX_REQUESTS) {
    store.set(key, recent)
    return { ok: false, status: 429 }
  }
  recent.push(now)
  store.set(key, recent)
  return { ok: true }
}

async function consumeDatabase(request: Request): Promise<PublicRateLimitDecision> {
  try {
    const config = readSupabaseConfig()
    if (!config.ready) return { ok: false, status: 503 }
    const clientHash = hashPublicClient(trustedClientAddress(request), config.secretKey)
    const { data, error } = await createSupabaseServerClient()
      .rpc("consume_public_rate_limit_v1", { p_client_hash: clientHash })
      .abortSignal(AbortSignal.timeout(8000))
    if (error) return { ok: false, status: 503 }
    const status = data && typeof data === "object" && "status" in data ? data.status : undefined
    if (status === "ok") return { ok: true }
    if (status === "limited") return { ok: false, status: 429 }
    return { ok: false, status: 503 }
  } catch {
    return { ok: false, status: 503 }
  }
}

/**
 * Shared enquiry and monitoring budget. A missing database, an RPC error, or
 * any result other than an explicit allow or limit fails closed.
 */
export async function consumePublicRateLimit(request: Request, now = Date.now()): Promise<PublicRateLimitDecision> {
  if (memoryMode && process.env.NODE_ENV !== "production") {
    return consumeMemory(trustedClientAddress(request), now, memoryStore)
  }
  return consumeDatabase(request)
}
