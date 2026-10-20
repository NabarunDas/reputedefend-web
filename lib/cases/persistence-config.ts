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

/** The word true. Surrounding whitespace is ignored. TRUE, 1 and yes are not. */
function exactTrue(value: string | undefined) {
  return trimEnv(value) === "true"
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
    && exactTrue(env.DEV_CASE_INTAKE_NO_EMAIL)
    && isDevProject(env.SUPABASE_URL)
}

export type DevMailDecision = "open" | "closed" | "outside"

/** Fixed vocabulary. These words are safe to log. They are not addresses or configuration values. */
export type DevMailCloseReason =
  | "git-ref"
  | "database"
  | "kill-switch"
  | "mail-disabled"
  | "allowlist-missing"
  | "allowlist-malformed"
  | "internal-approval-malformed"
  | "no-pending"
  | "customer-rejected"
  | "internal-rejected"

export type DevMailCloseDetail =
  | "absent"
  | "blank"
  | "other"
  | "control"
  | "empty-token"
  | "invalid-token"
  | "invalid"
  | "unlisted"

export type DevMailReport = {
  decision: DevMailDecision
  reason: DevMailCloseReason | null
  detail: DevMailCloseDetail | null
}

function closed(reason: DevMailCloseReason, detail: DevMailCloseDetail | null = null): DevMailReport {
  return { decision: "closed", reason, detail }
}

function flagDetail(value: string | undefined): DevMailCloseDetail {
  if (typeof value !== "string") return "absent"
  if (value.trim() === "") return "blank"
  return "other"
}

function allowlistDetail(raw: string | undefined): DevMailCloseDetail {
  if (typeof raw !== "string") return "absent"
  const text = raw.trim()
  if (!text) return "blank"
  if (/[\u0000-\u001f\u007f]/.test(text)) return "control"
  for (const part of text.split(",")) {
    if (!exactAddress(part)) return part.trim() === "" ? "empty-token" : "invalid-token"
  }
  return "other"
}

function recipientDetail(value: string, allow: ReadonlySet<string>): DevMailCloseDetail {
  const address = exactAddress(value)
  if (!address) return "invalid"
  return allow.has(address) ? "other" : "unlisted"
}

/**
 * True only for the Marketing develop Preview whose database string is the DEV project.
 * A missing git ref on that project is included so a redeploy can name that condition.
 * Feature-branch previews and Production stay quiet.
 */
export function devMailDiagnosticsEnabled(
  env: Record<string, string | undefined> = process.env,
) {
  if (env.VERCEL_ENV !== "preview") return false
  const ref = env.VERCEL_GIT_COMMIT_REF ?? ""
  if (ref === "develop") return true
  return ref === "" && isDevProject(env.SUPABASE_URL)
}

/** The develop Preview on the exact DEV project. This is the only lane that may retry. */
export function devMarketingMailLane(
  env: Record<string, string | undefined> = process.env,
) {
  return env.VERCEL_ENV === "preview"
    && env.VERCEL_GIT_COMMIT_REF === "develop"
    && isDevProject(env.SUPABASE_URL)
}

/** A single log line. The reason and detail are from the fixed vocabulary above. */
export function devMailCloseLogLine(report: DevMailReport): string | null {
  if (report.decision !== "closed" || report.reason === null) return null
  if (report.detail) return `[case-intake] dev mail closed reason=${report.reason} detail=${report.detail}`
  return `[case-intake] dev mail closed reason=${report.reason}`
}

/**
 * Whether this Preview may hand these recipients to Resend.
 *
 * `outside` is every non-Preview runtime, including Production. The caller
 * keeps that runtime's existing delivery behaviour.
 * `open` is only the develop Preview on the DEV Supabase project, with
 * DEV_MAIL_ENABLED the word true after surrounding whitespace is removed,
 * a strict allowlist, and every recipient that would be emailed approved.
 * A null recipient is not being emailed.
 * `closed` persists the case and records the suppression. It never sends.
 */
export function devMarketingMailReport(
  customer: string | null,
  internal: string | null,
  env: Record<string, string | undefined> = process.env,
): DevMailReport {
  if (env.VERCEL_ENV !== "preview") return { decision: "outside", reason: null, detail: null }
  if ((env.VERCEL_GIT_COMMIT_REF ?? "") === "") return closed("git-ref", "absent")
  if (env.VERCEL_GIT_COMMIT_REF !== "develop") return closed("git-ref", "other")
  if (!isDevProject(env.SUPABASE_URL)) return closed("database")
  if (exactTrue(env.DEV_CASE_INTAKE_NO_EMAIL)) return closed("kill-switch")
  if (!exactTrue(env.DEV_MAIL_ENABLED)) return closed("mail-disabled", flagDetail(env.DEV_MAIL_ENABLED))

  const allow = parseDevMailAllowlist(env.DEV_MAIL_ALLOWED_RECIPIENTS)
  if (!allow) {
    const detail = allowlistDetail(env.DEV_MAIL_ALLOWED_RECIPIENTS)
    const reason = detail === "absent" || detail === "blank" ? "allowlist-missing" : "allowlist-malformed"
    return closed(reason, detail)
  }

  const internalRaw = env.DEV_MAIL_INTERNAL_RECIPIENT
  const internalConfigured = typeof internalRaw === "string" && internalRaw.trim() !== ""
  const dedicatedInternal = internalConfigured ? exactAddress(internalRaw) : null
  if (internalConfigured && !dedicatedInternal) return closed("internal-approval-malformed", "invalid")

  if (customer === null && internal === null) return closed("no-pending")
  const customerAddress = customer === null ? null : exactAddress(customer)
  if (customer !== null && (!customerAddress || !allow.has(customerAddress))) {
    return closed("customer-rejected", recipientDetail(customer, allow))
  }
  if (internal !== null) {
    const internalAddress = exactAddress(internal)
    if (!internalAddress) return closed("internal-rejected", "invalid")
    const listed = allow.has(internalAddress)
    const distinctDedicated = Boolean(
      dedicatedInternal
      && internalAddress === dedicatedInternal
      && dedicatedInternal !== customerAddress,
    )
    if (!listed && !distinctDedicated) return closed("internal-rejected", "unlisted")
  }
  return { decision: "open", reason: null, detail: null }
}

