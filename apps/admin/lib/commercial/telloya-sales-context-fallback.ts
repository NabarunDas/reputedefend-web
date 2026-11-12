import "server-only"
import { createHash } from "node:crypto"
import { backend, tokenHash } from "../auth/backend"
import { ADMIN_RECENT_SIGN_IN_MESSAGE } from "../admin/reauth-copy"
import type { OnboardingView } from "./onboarding"

const REASON = "Automatic Telloya sales context after a completed offline demonstration."

function stepKey(enquiryId: string, step: string): string {
  const digest = createHash("sha256").update(`telloya-sales-context-fallback:${enquiryId}:${step}`).digest("hex")
  return `${digest.slice(0, 8)}-${digest.slice(8, 12)}-4${digest.slice(13, 16)}-a${digest.slice(17, 20)}-${digest.slice(20, 32)}`
}

function norm(value: string | undefined): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ")
}

function websiteOf(value: string | undefined): string {
  const raw = (value ?? "").trim()
  if (!raw) return ""
  if (/^https?:\/\//i.test(raw)) return raw.slice(0, 2048)
  return `https://${raw}`.slice(0, 2048)
}

type CommandResult = { status: string; reason?: string; version?: number }

async function runCommercial(
  token: string,
  enquiryId: string,
  step: string,
  operation: string,
  version: number,
  payload: Record<string, unknown>,
): Promise<CommandResult> {
  return backend().rpc<CommandResult>("admin_commercial_command_v1", {
    p_token: tokenHash(token),
    p_request: stepKey(enquiryId, step),
    p_operation: operation,
    p_payload: { enquiryId, reason: REASON, ...payload },
    p_version: version,
  })
}

async function loadOnboarding(token: string, enquiryId: string): Promise<OnboardingView | null> {
  try {
    const result = await backend().rpc<OnboardingView | { missing: true } | null>("admin_commercial_onboarding_v1", {
      p_token: tokenHash(token),
      p_enquiry: enquiryId,
    })
    if (!result || "missing" in result) return null
    return result
  } catch {
    return null
  }
}

async function loadHints(token: string, enquiryId: string) {
  try {
    const result = await backend().rpc<{ payload?: Record<string, unknown>; missing?: true } | null>("admin_enquiry_detail_v1", {
      p_token: tokenHash(token),
      p_id: enquiryId,
    })
    if (!result || "missing" in result || !result.payload) return {}
    return result.payload
  } catch {
    return {}
  }
}

async function demoCompleted(token: string, enquiryId: string): Promise<boolean> {
  try {
    const result = await backend().rpc<{ status?: string; demo_status?: string } | null>("telloya_admin_demo_v1", {
      p_token: tokenHash(token),
      p_enquiry_id: enquiryId,
    })
    return result?.status === "ready" && result.demo_status === "COMPLETED"
  } catch {
    return false
  }
}

/** Evidence-safe Preview fallback used only when the composite migration is unapplied. */
export async function reconcileTelloyaSalesContextFallback(input: {
  token: string
  enquiryId: string
}): Promise<{ ok: boolean; status: number; message: string; exception?: string }> {
  if (!(await demoCompleted(input.token, input.enquiryId))) {
    return { ok: false, status: 409, message: "Complete the offline demonstration before preparing the offer workspace." }
  }
  const hints = await loadHints(input.token, input.enquiryId)
  const businessName = (typeof hints.businessName === "string" ? hints.businessName : "Telloya business").trim().slice(0, 200) || "Telloya business"
  const websiteUrl = websiteOf(typeof hints.websiteUrl === "string" ? hints.websiteUrl : "")
  const enquiryBusiness = norm(typeof hints.businessName === "string" ? hints.businessName : "")
  const enquiryWebsite = norm(typeof hints.websiteUrl === "string" ? hints.websiteUrl : "")
  const enquiryLocation = norm(typeof hints.locations === "string" ? hints.locations : "")

  let view = await loadOnboarding(input.token, input.enquiryId)
  if (!view?.supported) return { ok: false, status: 503, message: "Commercial onboarding is unavailable on this deployment." }

  if (!view.request) {
    const classified = await runCommercial(input.token, input.enquiryId, "classify", "classify", 0, { product: "TELLOYA" })
    if (classified.status === "reauth_required") return { ok: false, status: 403, message: ADMIN_RECENT_SIGN_IN_MESSAGE }
    if (classified.status !== "success") return { ok: false, status: 409, message: "Telloya onboarding could not be opened for this enquiry." }
    view = await loadOnboarding(input.token, input.enquiryId)
    if (!view?.supported || !view.request) return { ok: false, status: 503, message: "Telloya onboarding could not be reloaded after classify." }
  }
  if (view.request.product !== "TELLOYA") {
    return { ok: false, status: 403, message: "This enquiry already has a non-Telloya onboarding request.", exception: "resolve_customer" }
  }

  if (view.step === "customer") {
    if (view.candidates.length > 1) {
      return { ok: false, status: 409, message: "More than one customer matches this enquiry. Resolve the customer before continuing.", exception: "resolve_customer" }
    }
    const payload = view.candidates.length === 1 ? { customerId: view.candidates[0].id } : { create: true }
    const matched = await runCommercial(input.token, input.enquiryId, "match_customer", "match_customer", view.request.version, payload)
    if (matched.status === "reauth_required") return { ok: false, status: 403, message: ADMIN_RECENT_SIGN_IN_MESSAGE }
    if (matched.status !== "success") return { ok: false, status: 409, message: "The customer record could not be linked automatically.", exception: "resolve_customer" }
    view = await loadOnboarding(input.token, input.enquiryId)
    if (!view?.supported || !view.request) return { ok: false, status: 503, message: "Telloya onboarding could not be reloaded after customer match." }
  }

  if (view.step === "business") {
    const usable = view.businesses.filter(item => item.membership !== "revoked")
    if (view.businesses.length > 0 && usable.length === 0) {
      return { ok: false, status: 409, message: "Business authority has been withdrawn. Matching does not restore it.", exception: "revoked_membership" }
    }
    const evidenced = usable.filter(item => {
      const name = norm(item.name)
      return (enquiryBusiness !== "" && name === enquiryBusiness) || (enquiryWebsite !== "" && name === enquiryWebsite)
    })
    if (evidenced.length > 1) {
      return { ok: true, status: 200, message: "Confirm the matching business before continuing.", exception: "resolve_business" }
    }
    if (evidenced.length === 1) {
      const matched = await runCommercial(input.token, input.enquiryId, "match_business", "match_business", view.request.version, {
        businessId: evidenced[0].id,
        membership: evidenced[0].membership === "verified" ? "verified" : "pending",
      })
      if (matched.status === "reauth_required") return { ok: false, status: 403, message: ADMIN_RECENT_SIGN_IN_MESSAGE }
      if (matched.status !== "success") return { ok: false, status: 409, message: "The business record could not be linked automatically.", exception: "resolve_business" }
      view = await loadOnboarding(input.token, input.enquiryId)
      if (!view?.supported || !view.request) return { ok: false, status: 503, message: "Telloya onboarding could not be reloaded after business match." }
    } else if (usable.length === 0) {
      const matched = await runCommercial(input.token, input.enquiryId, "match_business", "match_business", view.request.version, {
        create: true,
        name: businessName,
        website: websiteUrl,
        membership: "pending",
      })
      if (matched.status === "reauth_required") return { ok: false, status: 403, message: ADMIN_RECENT_SIGN_IN_MESSAGE }
      if (matched.status !== "success") return { ok: false, status: 409, message: "The business record could not be linked automatically.", exception: "resolve_business" }
      view = await loadOnboarding(input.token, input.enquiryId)
      if (!view?.supported || !view.request) return { ok: false, status: 503, message: "Telloya onboarding could not be reloaded after business match." }
    } else {
      return {
        ok: true,
        status: 200,
        message: "Confirm the business. A sole existing membership is not selected without matching enquiry evidence.",
        exception: "confirm_business_authority",
      }
    }
  }

  if (view.step === "locations") {
    const evidenced = view.locations.filter(item => enquiryLocation !== "" && norm(item.name) === enquiryLocation)
    if (evidenced.length === 1) {
      const located = await runCommercial(input.token, input.enquiryId, "select_locations", "select_locations", view.request.version, {
        locationIds: [evidenced[0].id],
      })
      if (located.status !== "success") {
        return { ok: true, status: 200, message: "Confirm the operating location before a sendable offer.", exception: "confirm_operating_location" }
      }
      return { ok: true, status: 200, message: "Telloya offer workspace is ready for review. No offer email was sent." }
    }
    return {
      ok: true,
      status: 200,
      message: "Confirm the operating location. Enquiry location text is not a verified service address, and a sole existing location is not selected automatically.",
      exception: "confirm_operating_location",
    }
  }

  return { ok: true, status: 200, message: "Telloya offer workspace is ready for review. No offer email was sent." }
}
