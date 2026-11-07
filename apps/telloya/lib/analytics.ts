/**
 * Telloya-only GA4 helpers.
 *
 * This module is intentionally separate from ProfileRelaunch analytics.
 * It reads NEXT_PUBLIC_TELLOYA_GA_MEASUREMENT_ID and
 * telloya:analytics-consent:v1. It must not read the ProfileRelaunch
 * measurement ID or consent record.
 *
 * Analytics stays off until a visitor accepts. Advertising consent stays denied.
 * Collection is eligible only when the deployment is explicitly Vercel Production.
 */

export const TELLOYA_ANALYTICS_CONSENT_KEY = "telloya:analytics-consent:v1"
export const TELLOYA_COOKIE_SETTINGS_EVENT = "telloya:cookie-settings"
export const TELLOYA_ANALYTICS_CONSENT_EVENT = "telloya:analytics-consent-change"

export const PROFILERELAUNCH_ANALYTICS_CONSENT_KEY = "profilerelaunch:analytics-consent:v1"
export const PROFILERELAUNCH_GA_ENV = "NEXT_PUBLIC_GA_MEASUREMENT_ID"

export type TelloyaAnalyticsConsent = "accepted" | "rejected"

export const DENIED_AD_CONSENT = {
  ad_storage: "denied",
  ad_user_data: "denied",
  ad_personalization: "denied",
} as const

/** Host-only cookies so Telloya does not share analytics identity with ProfileRelaunch. */
export const GA_HOST_COOKIE_DOMAIN = "none"

export const TELLOYA_GA_RUNTIME_CONFIG = {
  send_page_view: false,
  allow_google_signals: false,
  allow_ad_personalization_signals: false,
  cookie_domain: GA_HOST_COOKIE_DOMAIN,
} as const

const MEASUREMENT_ID_PATTERN = /^G-[A-Z0-9]+$/

export const TELLOYA_LEAD_EVENT = "generate_lead"
export const TELLOYA_LEAD_TYPE = "telloya_enquiry"
export const TELLOYA_PLAN_TIERS = ["basic", "growth", "pro", "custom"] as const

export type TelloyaLeadPlanTier = (typeof TELLOYA_PLAN_TIERS)[number]

export type TelloyaLeadPayload = {
  lead_type: typeof TELLOYA_LEAD_TYPE
  plan_tier?: TelloyaLeadPlanTier
  guard_interested: boolean
}

export function readTelloyaGaMeasurementId(
  value: string | undefined = process.env.NEXT_PUBLIC_TELLOYA_GA_MEASUREMENT_ID,
): string | undefined {
  const id = value?.trim()
  if (!id || !MEASUREMENT_ID_PATTERN.test(id)) return undefined
  return id
}

export function telloyaAnalyticsIsConfigured(value?: string) {
  return Boolean(readTelloyaGaMeasurementId(value))
}

const TELLOYA_ANALYTICS_DEPLOYMENT_KEY = "__telloyaAnalyticsDeployment"

/**
 * Only an explicit Vercel Production deployment may collect.
 * Preview, development, an unset value, and any other environment fail closed.
 */
export function telloyaAnalyticsCollectionAllowed(vercelEnv: string | undefined) {
  return vercelEnv?.trim() === "production"
}

export function publishTelloyaAnalyticsEnvironment(vercelEnv: string | undefined) {
  if (typeof window === "undefined") return
  Object.assign(window, { [TELLOYA_ANALYTICS_DEPLOYMENT_KEY]: vercelEnv?.trim() ?? "" })
}

export function readPublishedTelloyaAnalyticsEnvironment() {
  if (typeof window === "undefined") return undefined
  const value = (window as unknown as Record<string, unknown>)[TELLOYA_ANALYTICS_DEPLOYMENT_KEY]
  return typeof value === "string" ? value : undefined
}

export function clearPublishedTelloyaAnalyticsEnvironment() {
  if (typeof window === "undefined") return
  delete (window as unknown as Record<string, unknown>)[TELLOYA_ANALYTICS_DEPLOYMENT_KEY]
}

function analyticsCollectionIsActive() {
  return telloyaAnalyticsCollectionAllowed(readPublishedTelloyaAnalyticsEnvironment())
}

export function sanitizePathname(pathname: string) {
  const raw = pathname.trim() || "/"
  const path = raw.split("?")[0]?.split("#")[0] || "/"
  return path.startsWith("/") ? path : `/${path}`
}

export function sanitizedPageLocation(origin: string, pathname: string) {
  return `${origin.replace(/\/$/, "")}${sanitizePathname(pathname)}`
}

export function pageViewPayload(origin: string, pathname: string) {
  return {
    page_path: sanitizePathname(pathname),
    page_location: sanitizedPageLocation(origin, pathname),
  }
}

export function readStoredConsent(): TelloyaAnalyticsConsent | null {
  if (typeof window === "undefined") return null
  try {
    const value = window.localStorage.getItem(TELLOYA_ANALYTICS_CONSENT_KEY)
    if (value === "accepted" || value === "rejected") return value
  } catch {
    return null
  }
  return null
}

export function storeConsent(value: TelloyaAnalyticsConsent) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(TELLOYA_ANALYTICS_CONSENT_KEY, value)
  } catch {
    // Preference storage is best-effort; in-memory listeners still update.
  }
  window.dispatchEvent(new CustomEvent(TELLOYA_ANALYTICS_CONSENT_EVENT, { detail: value }))
}

export function openTelloyaCookieSettings() {
  if (typeof window === "undefined") return
  window.dispatchEvent(new Event(TELLOYA_COOKIE_SETTINGS_EVENT))
}

export function gaDisableKey(measurementId: string) {
  return `ga-disable-${measurementId}`
}

export function setGaDisabled(measurementId: string, disabled: boolean) {
  if (typeof window === "undefined") return
  Object.assign(window, { [gaDisableKey(measurementId)]: disabled })
}

export function removeAnalyticsCookies() {
  if (typeof document === "undefined" || typeof location === "undefined") return

  const names = document.cookie
    .split(";")
    .map((part) => part.split("=")[0]?.trim() ?? "")
    .filter((name) => name === "_ga" || name.startsWith("_ga_"))

  const hostname = location.hostname
  const domains = ["", hostname, `.${hostname}`]
  const paths = ["/", location.pathname]

  for (const name of names) {
    for (const domain of domains) {
      for (const path of paths) {
        const domainPart = domain ? `; domain=${domain}` : ""
        document.cookie = `${name}=; Max-Age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=${path}${domainPart}`
      }
    }
  }
}

export function removeGoogleAnalyticsScripts() {
  if (typeof document === "undefined") return
  document
    .querySelectorAll('script[src*="www.googletagmanager.com/gtag/js"]')
    .forEach((node) => node.parentNode?.removeChild(node))
}

export function denyAdvertisingConsent() {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return
  window.gtag("consent", "update", { ...DENIED_AD_CONSENT })
}

export function withdrawAnalytics(measurementId: string) {
  setGaDisabled(measurementId, true)
  if (typeof window !== "undefined" && typeof window.gtag === "function") {
    window.gtag("consent", "update", {
      analytics_storage: "denied",
      ...DENIED_AD_CONSENT,
    })
  }
  removeAnalyticsCookies()
  removeGoogleAnalyticsScripts()
  storeConsent("rejected")
}

export function acceptAnalytics(measurementId: string) {
  setGaDisabled(measurementId, false)
  storeConsent("accepted")
}

export function sendSanitizedPageView(origin: string, pathname: string) {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return false
  if (!analyticsCollectionIsActive()) return false
  if (readStoredConsent() !== "accepted") return false
  window.gtag("event", "page_view", pageViewPayload(origin, pathname))
  return true
}

export function telloyaLeadPayload(input: {
  planTier?: string
  guardInterested?: boolean
}): TelloyaLeadPayload {
  const payload: TelloyaLeadPayload = {
    lead_type: TELLOYA_LEAD_TYPE,
    guard_interested: input.guardInterested === true,
  }
  if (input.planTier && (TELLOYA_PLAN_TIERS as readonly string[]).includes(input.planTier)) {
    payload.plan_tier = input.planTier as TelloyaLeadPlanTier
  }
  return payload
}

/**
 * Sends one GA4 generate_lead event for a Telloya enquiry.
 *
 * Call only after the server has confirmed a newly persisted enquiry with a
 * valid TY reference and leadConversion is true. This function never accepts
 * a reference, submission key, or enquiry field, and it never starts gtag.
 */
export function sendTelloyaLeadConversion(input: {
  planTier?: string
  guardInterested?: boolean
}) {
  if (typeof window === "undefined" || typeof window.gtag !== "function") return false
  if (!analyticsCollectionIsActive()) return false
  if (readStoredConsent() !== "accepted") return false
  const measurementId = readTelloyaGaMeasurementId()
  if (!measurementId) return false
  const disabled = (window as unknown as Record<string, unknown>)[gaDisableKey(measurementId)]
  if (disabled) return false
  window.gtag("event", TELLOYA_LEAD_EVENT, telloyaLeadPayload(input))
  return true
}

export function subscribeConsent(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {}
  window.addEventListener(TELLOYA_ANALYTICS_CONSENT_EVENT, onStoreChange)
  return () => window.removeEventListener(TELLOYA_ANALYTICS_CONSENT_EVENT, onStoreChange)
}

export function getConsentSnapshot() {
  return readStoredConsent()
}

declare global {
  interface Window {
    dataLayer?: unknown[]
    gtag?: (...args: unknown[]) => void
  }
}
