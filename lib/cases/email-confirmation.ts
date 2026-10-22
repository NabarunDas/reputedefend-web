import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto"

/**
 * Case-receipt email confirmation.
 *
 * The bearer is an HMAC over a distinct domain from evidence links and
 * quotation acceptance. Only its SHA-256 is stored. Production stays closed:
 * a production runtime does not mint a challenge or a button.
 */

const TOKEN_CONTEXT = "email-confirmation"
const CHALLENGE_NAMESPACE = "9c1e0a11-c0ff-5ee1-8a11-000000000280"
const CHALLENGE_NAME = "email-confirmation-challenge"
const DEV_DATABASE_HOST = "rmzozuiamjcclvtgutgd.supabase.co"
const PUBLIC_SITE_ORIGIN = "https://profilerelaunch.com"
const HEX = "0123456789abcdef"

export const EMAIL_CONFIRM_BUTTON = "Confirm my email address"
export const EMAIL_CONFIRM_HEADING = "One quick step to keep your case moving"
export const EMAIL_CONFIRM_BODY =
  "Please confirm that this is your email address. This helps us make sure future updates, document requests and quotations reach the right person."
export const EMAIL_CONFIRM_SAVED = "Your assessment is already saved. You don't need to submit it again."
export const EMAIL_CONFIRM_PENDING_LABEL =
  "Email confirmation pending — requested automatically in your case receipt"
export const EMAIL_CONFIRM_SUCCESS =
  "Your assessment is safely recorded. Please check your email and confirm your address so we can contact you securely."

type RuntimeEnv = Record<string, string | undefined>
export type ConfirmationEnvironment = "development" | "preview"

export type EmailConfirmationPlan = {
  challengeId: string
  email: string
  environment: ConfirmationEnvironment
  token: string
  tokenHash: string
  keyVersion: number
  origin: string
  /** Outbound only. Never write this into a snapshot, queue, log, or ledger. */
  deliveryUrl: string
}

function actionIdFrom(namespaceHex: string, name: string, requestId: string): string {
  const namespace = Buffer.from(namespaceHex.split("-").join(""), "hex")
  const hash = createHash("sha1").update(namespace).update(`${name}:${requestId}`).digest()
  hash[6] = (hash[6] & 0x0f) | 0x50
  hash[8] = (hash[8] & 0x3f) | 0x80
  const id = hash.subarray(0, 16).toString("hex")
  return `${id.slice(0, 8)}-${id.slice(8, 12)}-${id.slice(12, 16)}-${id.slice(16, 20)}-${id.slice(20, 32)}`
}

export function isUuid(value: string): boolean {
  const parts = value.toLowerCase().split("-")
  if (parts.length !== 5) return false
  const sizes = [8, 4, 4, 4, 12]
  return parts.every((part, index) => part.length === sizes[index] && [...part].every(char => HEX.includes(char)))
}

function hex64(value: string): boolean {
  return value.length === 64 && [...value].every(char => HEX.includes(char))
}

export function deriveEmailConfirmationChallengeId(caseId: string, generation = 1): string {
  return actionIdFrom(CHALLENGE_NAMESPACE, CHALLENGE_NAME, `${caseId}:g${generation}`)
}

export function newEmailConfirmationChallengeId(): string {
  return randomUUID()
}

export function deriveEmailConfirmationToken(challengeId: string, secret: string, version = 1): string {
  return createHmac("sha256", secret).update(`${TOKEN_CONTEXT}:${challengeId}:v${version}`).digest("hex")
}

export function emailConfirmationTokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

function currentVersion(env: RuntimeEnv): number {
  const raw = env.COMMUNICATIONS_LINK_KEY_VERSION
  if (raw == null || raw === "") return 1
  const parsed = Number(raw)
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) return 1
  return parsed
}

function secretFor(version: number, env: RuntimeEnv): string | null {
  const raw = version === currentVersion(env)
    ? env.COMMUNICATIONS_LINK_SECRET
    : env[`COMMUNICATIONS_LINK_SECRET_V${version}`]
  if (!raw || raw.length < 32) return null
  return raw
}

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

export function normalizeConfirmationEmail(value: string): string | null {
  return singleExactAddress(value.trim().toLowerCase())
}

function devDatabase(url: string | undefined): boolean {
  const raw = url?.trim() ?? ""
  if (!raw) return false
  try {
    const parsed = new URL(raw)
    return parsed.protocol === "https:" && parsed.hostname === DEV_DATABASE_HOST
  } catch {
    return false
  }
}

export function confirmationRuntime(env: RuntimeEnv = process.env): ConfirmationEnvironment | null {
  const value = runtimeEnvironment(env)
  return value === "development" || value === "preview" ? value : null
}

export function confirmationAllowlist(env: RuntimeEnv = process.env): string | null {
  if (runtimeEnvironment(env) !== "preview") return null
  if (env.VERCEL_GIT_COMMIT_REF !== "develop" || !devDatabase(env.SUPABASE_URL)) return null
  return singleExactAddress(env.DEV_MAIL_ALLOWED_RECIPIENTS)
}

function runtimeEnvironment(env: RuntimeEnv): ConfirmationEnvironment | "production" | null {
  if (env.VERCEL_ENV === "production") return "production"
  if (env.VERCEL_ENV === "preview") return "preview"
  if (env.VERCEL_ENV == null || env.VERCEL_ENV === "" || env.VERCEL_ENV === "development") return "development"
  return null
}

function safeHost(host: string): boolean {
  if (host.length < 4 || host.length > 200) return false
  if (host !== host.trim()) return false
  if (host.includes("/") || host.includes("\\") || host.includes(" ") || host.includes("@")) return false
  if (!host.includes(".")) return false
  return [...host].every(char => "abcdefghijklmnopqrstuvwxyz0123456789.-".includes(char.toLowerCase()))
}

function confirmationOrigin(env: RuntimeEnv): string | null {
  if (env.VERCEL_ENV === "production") return null
  if (env.VERCEL_ENV === "preview") {
    const host = env.VERCEL_URL ?? ""
    if (!safeHost(host)) return null
    return `https://${host}`
  }
  return PUBLIC_SITE_ORIGIN
}

/** Preview on the DEV database accepts only the one exact mailbox. Production never does. */
export function emailConfirmationAllowed(email: string, env: RuntimeEnv = process.env): boolean {
  const environment = runtimeEnvironment(env)
  const normalized = normalizeConfirmationEmail(email)
  if (!environment || !normalized) return false
  if (environment === "production") return false
  if (environment === "preview") {
    if (env.VERCEL_GIT_COMMIT_REF !== "develop") return false
    if (!devDatabase(env.SUPABASE_URL)) return false
    const allow = singleExactAddress(env.DEV_MAIL_ALLOWED_RECIPIENTS)
    return allow !== null && allow === normalized
  }
  return true
}

function planFor(
  caseId: string,
  email: string,
  challengeId: string,
  env: RuntimeEnv,
): EmailConfirmationPlan | null {
  if (!isUuid(caseId) || !isUuid(challengeId)) return null
  if (!emailConfirmationAllowed(email, env)) return null
  const environment = runtimeEnvironment(env)
  if (environment !== "development" && environment !== "preview") return null
  const version = currentVersion(env)
  const secret = secretFor(version, env)
  const origin = confirmationOrigin(env)
  const normalized = normalizeConfirmationEmail(email)
  if (!secret || !origin || !normalized) return null
  const token = deriveEmailConfirmationToken(challengeId, secret, version)
  return {
    challengeId,
    email: normalized,
    environment,
    token,
    tokenHash: emailConfirmationTokenHash(token),
    keyVersion: version,
    origin,
    deliveryUrl: `${origin}/confirm-email/${challengeId}#t=${token}`,
  }
}

export function planInitialEmailConfirmation(
  caseId: string,
  email: string,
  env: RuntimeEnv = process.env,
): EmailConfirmationPlan | null {
  return planFor(caseId, email, deriveEmailConfirmationChallengeId(caseId, 1), env)
}

export function planChallengeDelivery(challengeId: string, env: RuntimeEnv = process.env): EmailConfirmationPlan | null {
  if (!isUuid(challengeId)) return null
  const environment = confirmationRuntime(env)
  const version = currentVersion(env)
  const secret = secretFor(version, env)
  const origin = confirmationOrigin(env)
  if (!environment || !secret || !origin) return null
  const token = deriveEmailConfirmationToken(challengeId, secret, version)
  return {
    challengeId,
    email: "",
    environment,
    token,
    tokenHash: emailConfirmationTokenHash(token),
    keyVersion: version,
    origin,
    deliveryUrl: `${origin}/confirm-email/${challengeId}#t=${token}`,
  }
}

export function planReplacementEmailConfirmation(
  caseId: string,
  email: string,
  challengeId: string,
  env: RuntimeEnv = process.env,
): EmailConfirmationPlan | null {
  return planFor(caseId, email, challengeId, env)
}

export function usableConfirmationUrl(value: string | null | undefined): string | null {
  if (!value) return null
  const url = value.trim()
  if (url !== value || url.length < 20 || url.length > 2000) return null
  if (!url.startsWith("https://")) return null
  if (url.includes(" ") || url.includes("\n") || url.includes("\r") || url.includes('"') || url.includes("<")) return null
  const hash = url.indexOf("#t=")
  if (hash < 0) return null
  const token = url.slice(hash + 3)
  if (!hex64(token)) return null
  const path = url.slice(0, hash)
  if (!path.includes("/confirm-email/")) return null
  return url
}

export function confirmationCsrfToken(): string {
  return randomUUID().split("-").join("") + randomUUID().split("-").join("").slice(0, 32)
}

export function confirmationCsrfMatches(cookie: string | undefined, submitted: string | undefined): boolean {
  if (!cookie || !submitted || cookie.length !== submitted.length || cookie.length < 32 || cookie.length > 80) return false
  return timingSafeEqual(Buffer.from(cookie), Buffer.from(submitted))
}

export function emailConfirmationStatus(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const status = (value as { status?: unknown }).status
  return typeof status === "string" ? status : null
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

function serviceLabel(caseType: string): string | null {
  if (caseType === "PROFILE_RECOVERY") return "Profile Recovery"
  if (caseType === "REVIEW_PROTECTION") return "Review Protection"
  return null
}

export function emailConfirmationResendContent(input: {
  publicRef: string
  caseType: string
  url: string
}): { subject: string; text: string; html: string } | null {
  const url = usableConfirmationUrl(input.url)
  const service = serviceLabel(input.caseType)
  if (!url || !service || !input.publicRef) return null
  const subject = `[ProfileRelaunch] Confirm your email for your ${service} case — ${input.publicRef}`
  const text = [
    EMAIL_CONFIRM_HEADING,
    EMAIL_CONFIRM_BODY,
    `Your case reference\n\n${input.publicRef}`,
    `${EMAIL_CONFIRM_BUTTON}\n${url}`,
    EMAIL_CONFIRM_SAVED,
    "Security reminder\n\nProfileRelaunch will never ask you for your Google password, one-time password, verification code or security answers.",
  ].join("\n\n")
  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(EMAIL_CONFIRM_HEADING)}</title></head>
<body style="margin:0;padding:24px 12px;background:#f7f8f3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#10261F;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #A8B8B0;">
    <tr><td style="padding:28px 24px;font-size:16px;line-height:1.6;">
      <h1 style="margin:0 0 12px;font-size:22px;line-height:1.35;">${escapeHtml(EMAIL_CONFIRM_HEADING)}</h1>
      <p style="margin:0 0 16px;">${escapeHtml(EMAIL_CONFIRM_BODY)}</p>
      <p style="margin:0 0 8px;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#0a6e3c;">Your case reference</p>
      <p style="margin:0 0 20px;font-size:22px;font-weight:700;letter-spacing:0.06em;">${escapeHtml(input.publicRef)}</p>
      <p style="margin:0 0 20px;"><a href="${escapeHtml(url)}" style="display:inline-block;background:#0a6e3c;color:#ffffff;text-decoration:none;font-weight:700;font-size:16px;line-height:1.2;padding:14px 22px;border-radius:6px;">${escapeHtml(EMAIL_CONFIRM_BUTTON)}</a></p>
      <p style="margin:0 0 16px;">${escapeHtml(EMAIL_CONFIRM_SAVED)}</p>
      <p style="margin:0;font-size:14px;line-height:1.5;">ProfileRelaunch will never ask you for your Google password, one-time password, verification code or security answers.</p>
    </td></tr>
  </table>
</body>
</html>`
  return { subject, text, html }
}

export function presentedConfirmationToken(value: string | undefined): string | null {
  if (!value) return null
  const token = value.trim()
  if (token !== value || !hex64(token)) return null
  return token
}
