import type { EnvMap } from "../jobs/config"

const DEV_SUPABASE_URL = "https://rmzozuiamjcclvtgutgd.supabase.co"
const DEV_EVIDENCE_BUCKET = "profilerelaunch-evidence-dev-01"
const DEVELOP_ADMIN_BRANCH = /^profilerelaunch-admin-git-develop-([a-z0-9-]+)\.vercel\.app$/

function branchTeam(host: string | undefined): string | null {
  const team = DEVELOP_ADMIN_BRANCH.exec(host ?? "")?.[1]
  if (!team || team.startsWith("-") || team.endsWith("-")) return null
  return team
}

/** Customer develop Preview in the same Vercel team as this Admin branch. */
export function devCustomerPortalOrigin(env: EnvMap = process.env): string | null {
  const team = branchTeam(env.VERCEL_BRANCH_URL)
  if (!team) return null
  return `https://profilerelaunch-customer-git-develop-${team}.vercel.app`
}

/**
 * Admin develop Preview whose database is the DEV Supabase project.
 * Production and every other preview are outside this lane.
 */
export function devAdminOutgoingMailLane(env: EnvMap = process.env): boolean {
  const url = (env.SUPABASE_URL ?? "").trim().replace(/\/$/, "")
  return env.VERCEL_ENV === "preview"
    && env.VERCEL_GIT_COMMIT_REF === "develop"
    && url === DEV_SUPABASE_URL
    && branchTeam(env.VERCEL_BRANCH_URL) !== null
}

/** DEV portal origin and DEV evidence bucket, both required before a send is offered. */
export function devPreviewMailConfigured(env: EnvMap = process.env): boolean {
  const url = (env.SUPABASE_URL ?? "").trim().replace(/\/$/, "")
  const team = branchTeam(env.VERCEL_BRANCH_URL)
  if (!team) return false
  const portal = `https://profilerelaunch-customer-git-develop-${team}.vercel.app`
  return env.VERCEL_ENV === "preview"
    && env.VERCEL_GIT_COMMIT_REF === "develop"
    && url === DEV_SUPABASE_URL
    && env.CUSTOMER_ORIGIN === portal
    && env.AWS_EVIDENCE_BUCKET === DEV_EVIDENCE_BUCKET
}

/**
 * One exact mailbox. A list, a suffix, a substring and a wildcard are rejected.
 * The value is not trimmed: surrounding space is malformed and fails closed.
 * Operator note: before any real DEV send, set the sensitive variable
 * DEV_MAIL_ALLOWED_RECIPIENTS on Admin Preview/develop to one owner-controlled
 * test mailbox alias. This code does not contain that address.
 */
function singleExactAddress(raw: string | null | undefined): string | null {
  if (typeof raw !== "string" || raw.length < 3 || raw.length > 254) return null
  if ([...raw].some(char => char <= " " || char === "," || char === "*" || char === "<" || char === ">")) return null
  const address = raw.toLowerCase()
  const at = address.indexOf("@")
  if (at <= 0 || at !== address.lastIndexOf("@")) return null
  const local = address.slice(0, at)
  const domain = address.slice(at + 1)
  if (local.length > 64 || domain.length < 3 || !domain.includes(".")) return null
  if (domain.startsWith(".") || domain.endsWith(".") || domain.includes("..")) return null
  const mailboxChar = "abcdefghijklmnopqrstuvwxyz0123456789.!#$%&'*+=?^_`{|}~-"
  const domainChar = "abcdefghijklmnopqrstuvwxyz0123456789.-"
  if ([...local].some(char => !mailboxChar.includes(char))) return null
  if ([...domain].some(char => !domainChar.includes(char))) return null
  return address
}

/** The single DEV mailbox, or null when this lane is off or the variable is unusable. */
export function devQuoteAllowlistedRecipient(env: EnvMap = process.env): string | null {
  if (!devAdminOutgoingMailLane(env)) return null
  return singleExactAddress(env.DEV_MAIL_ALLOWED_RECIPIENTS)
}

/**
 * On the develop DEV lane the recipient must equal that one mailbox.
 * Every other lane keeps the verified customer address.
 */
export function devQuoteRecipientAllowed(env: EnvMap, recipient: string | null | undefined): boolean {
  if (!devAdminOutgoingMailLane(env)) return true
  const allowed = devQuoteAllowlistedRecipient(env)
  const address = singleExactAddress(typeof recipient === "string" ? recipient.trim() : null)
  return allowed !== null && address !== null && allowed === address
}

export function devEvidenceUploadOriginAllowed(env: EnvMap, origin: string | null | undefined): boolean {
  const url = (env.SUPABASE_URL ?? "").trim().replace(/\/$/, "")
  const team = branchTeam(env.VERCEL_BRANCH_URL)
  if (!(env.VERCEL_ENV === "preview" && env.VERCEL_GIT_COMMIT_REF === "develop" && url === DEV_SUPABASE_URL && team)) {
    return true
  }
  return origin === `https://profilerelaunch-customer-git-develop-${team}.vercel.app`
}
