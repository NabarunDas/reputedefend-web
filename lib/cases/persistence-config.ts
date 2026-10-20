/* DEV-MAIL-01: Get Help mail on a Vercel Preview stays closed unless the develop
 * DEV lane is explicitly enabled for every recipient that would be emailed. */
import "server-only"

const DEV_SUPABASE_URLS = [
  "https://rmzozuiamjcclvtgutgd.supabase.co",
  "https://rmzozuiamjcclvtgutgd.supabase.co/",
]

/** One mailbox. Display names, lists, wildcards and surrounding punctuation are rejected. */
const EXACT_ADDRESS = /^[a-z0-9.!#$%&'*+=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/

function trimEnv(value: string | undefined) {
  return value?.trim() ?? ""
}

function isDevProject(url: string | undefined) {
  return DEV_SUPABASE_URLS.includes(url?.trim() ?? "")
}

/**
 * A single exact mailbox, compared case-insensitively.
 * The returned value is the normalised form used for the allowlist check.
 */
function exactAddress(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null
  const address = value.trim().toLowerCase()
  if (address.length < 3 || address.length > 254) return null
  const at = address.indexOf("@")
  if (at <= 0 || at !== address.lastIndexOf("@")) return null
  if (address.slice(0, at).length > 64) return null
  if (!EXACT_ADDRESS.test(address)) return null
  return address
}

/**
 * Comma-separated exact addresses. Any empty, malformed or multi-recipient
 * token rejects the whole list. Nothing here is a wildcard or a domain.
 */
export function parseDevMailAllowlist(raw: string | undefined): ReadonlySet<string> | null {
  if (typeof raw !== "string") return null
  const text = raw.trim()
  if (!text || /[\u0000-\u001f\u007f]/.test(text)) return null
  const allow = new Set<string>()
  for (const part of text.split(",")) {
    const address = exactAddress(part)
    if (!address) return null
    allow.add(address)
  }
  return allow.size > 0 ? allow : null
}

/**
 * Server-only rollout flag. Only the exact value `true` enables DB-backed
 * Get Help case intake. Unset/false keeps today's email-only production path.
 */
export function isCasePersistenceEnabled(
  env: Record<string, string | undefined> = process.env,
) {
  return trimEnv(env.CASE_PERSISTENCE_ENABLED) === "true"
}

/** Opt-in kill switch for the develop DEV Preview. It suppresses every
 * Resend case-intake send, including when DEV_MAIL_ENABLED is also true.
 * Production and unrelated previews are never affected by this flag.
 */
export function devCaseIntakeEmailSuppressed(env: Record<string, string | undefined> = process.env) {
  return env.VERCEL_ENV === "preview"
    && env.VERCEL_GIT_COMMIT_REF === "develop"
    && env.DEV_CASE_INTAKE_NO_EMAIL === "true"
    && isDevProject(env.SUPABASE_URL)
}

export type DevMailDecision = "open" | "closed" | "outside"

/**
 * Whether this Preview may hand these recipients to Resend.
 *
 * `outside` is every non-Preview runtime, including Production. The caller
 * keeps that runtime's existing delivery behaviour.
 * `open` is only the develop Preview on the DEV Supabase project, with
 * DEV_MAIL_ENABLED exactly true, a strict allowlist, and every recipient
 * that would be emailed approved. A null recipient is not being emailed.
 * `closed` persists the case and records the suppression. It never sends.
 */
export function devMarketingMailDecision(
  customer: string | null,
  internal: string | null,
  env: Record<string, string | undefined> = process.env,
): DevMailDecision {
  if (env.VERCEL_ENV !== "preview") return "outside"
  const lane = env.VERCEL_GIT_COMMIT_REF === "develop" && isDevProject(env.SUPABASE_URL)
  if (!lane || env.DEV_CASE_INTAKE_NO_EMAIL === "true" || env.DEV_MAIL_ENABLED !== "true") return "closed"
  const allow = parseDevMailAllowlist(env.DEV_MAIL_ALLOWED_RECIPIENTS)
  if (!allow) return "closed"

  const internalRaw = env.DEV_MAIL_INTERNAL_RECIPIENT
  const internalConfigured = typeof internalRaw === "string" && internalRaw.trim() !== ""
  const dedicatedInternal = internalConfigured ? exactAddress(internalRaw) : null
  if (internalConfigured && !dedicatedInternal) return "closed"

  if (customer === null && internal === null) return "closed"
  const customerAddress = customer === null ? null : exactAddress(customer)
  if (customer !== null && (!customerAddress || !allow.has(customerAddress))) return "closed"
  if (internal !== null) {
    const internalAddress = exactAddress(internal)
    if (!internalAddress) return "closed"
    const listed = allow.has(internalAddress)
    const distinctDedicated = Boolean(
      dedicatedInternal
      && internalAddress === dedicatedInternal
      && dedicatedInternal !== customerAddress,
    )
    if (!listed && !distinctDedicated) return "closed"
  }
  return "open"
}
