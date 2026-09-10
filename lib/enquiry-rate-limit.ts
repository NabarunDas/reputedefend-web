const WINDOW_MS = 10 * 60 * 1000
const MAX_REQUESTS = 8

type RateLimitStore = Map<string, number[]>

const memoryStore: RateLimitStore = new Map()

export type EnquiryRateLimitResult = { ok: true } | { ok: false }

/**
 * Best-effort, process-local rate limit. This is a swap-ready boundary, not a
 * shared store. Do not rely on it across serverless instances.
 */
export function checkEnquiryRateLimit(
  key: string,
  now = Date.now(),
  store: RateLimitStore = memoryStore,
): EnquiryRateLimitResult {
  const windowStart = now - WINDOW_MS
  const recent = (store.get(key) ?? []).filter((stamp) => stamp > windowStart)
  if (recent.length >= MAX_REQUESTS) {
    store.set(key, recent)
    return { ok: false }
  }
  recent.push(now)
  store.set(key, recent)
  return { ok: true }
}

export function resetEnquiryRateLimit(store: RateLimitStore = memoryStore) {
  store.clear()
}

export function enquiryClientKey(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")
  const ip = forwarded?.split(",")[0]?.trim()
  return ip || request.headers.get("x-real-ip")?.trim() || "unknown"
}
