import "server-only"
import { NextRequest, NextResponse } from "next/server"
import { backend, tokenHash, validToken } from "../auth/backend"
import { authConfig, sessionCookie } from "../auth/config"
import { privateResponseHeaders } from "../access"
import { isUuid } from "../records/model"
import { devCaseJourneyPreviewEnabled } from "./gate"
import { intakeDecisionArgs, intakeReviewComplete, preliminaryBlock, verificationDecisionArgs, type JourneyWorkEvent } from "./decisions"
import { buildJourneyIntake, type JourneySnapshot } from "./intake"
import { parseJourneyExtension } from "./read"

const reply = (message: string, status: number) => NextResponse.json({ message }, { status, headers: privateResponseHeaders })

function decisionArgs(raw: unknown) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null
  const body = raw as Record<string, unknown>
  const keys = Object.keys(body)
  if (keys.length !== 4 || !["caseId", "version", "kind", "data"].every(key => Object.hasOwn(body, key))) return null
  if (!isUuid(body.caseId) || !Number.isSafeInteger(body.version) || (body.version as number) < 1) return null
  if (body.kind === "intake") {
    const data = intakeDecisionArgs(body.data)
    return data ? { caseId: body.caseId, version: body.version as number, kind: "intake" as const, data } : null
  }
  if (body.kind === "verification") {
    const data = verificationDecisionArgs(body.data)
    return data ? { caseId: body.caseId, version: body.version as number, kind: "verification" as const, data } : null
  }
  return null
}

/** Staff intake review and business screening. DEV/develop only. The actor is the session, never the body. */
export async function journeyDecisionCommand(request: NextRequest) {
  if (!devCaseJourneyPreviewEnabled()) return reply("Unavailable.", 404)
  const config = authConfig()
  if (!config) return reply("The workspace is unavailable. Please try again shortly.", 503)
  // Same rule as the other Admin commands: the browser origin must be this
  // request's own origin, and that origin must already be on the Preview
  // allowlist. The list is not widened here. The DEV gate above still runs first.
  const requestOrigin = request.nextUrl.origin
  if (request.headers.get("origin") !== requestOrigin || !config.allowedOrigins.includes(requestOrigin)) {
    return reply("Reload this page and try again.", 403)
  }
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") return reply("Reload this page and try again.", 415)
  const token = request.cookies.get(sessionCookie)?.value
  const key = request.headers.get("idempotency-key")
  if (!validToken(token)) return reply("Please sign in again.", 401)
  if (!isUuid(key)) return reply("Reload the form and try again.", 400)
  try {
    const reader = request.body?.getReader()
    const decoder = new TextDecoder()
    let raw = ""
    let size = 0
    if (reader) for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 8192) {
        await reader.cancel()
        return reply("That request is too large.", 413)
      }
      raw += decoder.decode(value, { stream: true })
    }
    raw += decoder.decode()
    let body: unknown
    try { body = JSON.parse(raw) } catch { return reply("Please check the form and try again.", 400) }
    const args = decisionArgs(body)
    if (!args) return reply("Check the outcome, the reason and the note before saving.", 400)
    if (args.kind === "verification" && args.data.outcome === "PRELIMINARY_COMPLETE") {
      const block = await preliminaryWriteBlock(tokenHash(token), args.caseId)
      if (block === "review") return reply("Record a reviewed intake before completing this screening.", 409)
      if (block === "records") return reply("The screening cannot be completed while the email, authority or submitted details disagree.", 409)
      if (block === "unavailable") return reply("The decision could not be stored. Reload before trying again.", 503)
    }
    const result = await backend().rpc<{ status?: string }>("admin_case_journey_decision_v1", {
      p_token: tokenHash(token),
      p_request: key,
      p_case: args.caseId,
      p_version: args.version,
      p_kind: args.kind,
      p_data: args.data,
    })
    switch (result?.status) {
      case "success": return reply("Saved. The case history now includes this staff decision.", 200)
      case "unauthorized": return reply("Your session has ended. Please sign in again.", 401)
      case "conflict": return reply("This case has changed. Reload it before trying again.", 409)
      case "denied": return reply("This case is closed. Reopen it before recording another review.", 403)
      case "prerequisite": return reply("Record a reviewed intake before completing this screening.", 409)
      case "invalid": return reply("The decision was rejected. Check the outcome and the recorded reason.", 400)
      default: return reply("The decision could not be stored. The reviewed database change may not be applied yet. Reload before trying again.", 503)
    }
  } catch {
    return reply("The decision could not be stored. The reviewed database change may not be applied yet. Reload before trying again.", 503)
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function workEvents(value: unknown): JourneyWorkEvent[] | null {
  const body = asRecord(value)
  if (!body || !Array.isArray(body.events)) return null
  const events: JourneyWorkEvent[] = []
  for (const row of body.events) {
    const event = asRecord(row)
    if (!event || typeof event.event !== "string" || typeof event.createdAt !== "string") return null
    const details = asRecord(event.details) ?? {}
    events.push({ event: event.event, createdAt: event.createdAt, details })
  }
  return events
}

/**
 * Re-reads the live case, contact, membership and snapshot before a completing
 * screening write. The client checkbox is not consulted.
 */
async function preliminaryWriteBlock(token: string, caseId: string): Promise<"review" | "records" | "unavailable" | null> {
  const store = backend()
  const detail = await store.rpc<unknown>("admin_case_detail_v1", { p_token: token, p_id: caseId, p_before: null })
  const detailBody = asRecord(detail)
  const events = workEvents(detail)
  if (!detailBody || detailBody.missing === true || !events) return "unavailable"
  if (!intakeReviewComplete(events)) return "review"
  const customerId = typeof detailBody.customerId === "string" ? detailBody.customerId : ""
  const businessId = typeof detailBody.businessId === "string" ? detailBody.businessId : ""
  const locationId = typeof detailBody.locationId === "string" ? detailBody.locationId : ""
  if (!customerId || !businessId || !locationId) return "unavailable"
  const [customer, business, location, membership, ready] = await Promise.all([
    store.rpc<unknown>("admin_record_detail_v1", { p_token: token, p_entity: "client", p_id: customerId }),
    store.rpc<unknown>("admin_record_detail_v1", { p_token: token, p_entity: "business", p_id: businessId }),
    store.rpc<unknown>("admin_record_detail_v1", { p_token: token, p_entity: "location", p_id: locationId }),
    store.rpc<unknown>("admin_membership_get_v1", { p_token: token, p_customer: customerId, p_business: businessId }),
    store.rpc<unknown>("admin_case_authorization_readiness_v1", { p_token: token, p_case: caseId }),
  ])
  const customerBody = asRecord(customer)
  const businessBody = asRecord(business)
  const locationBody = asRecord(location)
  const readyBody = asRecord(ready)
  if (!customerBody || !businessBody || !locationBody || !readyBody || customerBody.missing === true || businessBody.missing === true || locationBody.missing === true) {
    return "unavailable"
  }
  let snapshot: JourneySnapshot | null = null
  try {
    snapshot = parseJourneyExtension(await store.rpc<unknown>("admin_case_journey_intake_v1", { p_token: token, p_case: caseId }))?.snapshot ?? null
  } catch {
    snapshot = null
  }
  const membershipBody = asRecord(membership)
  const brief = buildJourneyIntake({
    message: "",
    reviewUrl: null,
    customer: asRecord(customerBody.record) ?? {},
    business: asRecord(businessBody.record) ?? {},
    location: asRecord(locationBody.record) ?? {},
    duplicates: [],
    projectedEmailVerified: readyBody.customerEmailVerified === true,
    projectedAuthority: readyBody.businessAuthorityVerified === true,
    membershipStatus: membershipBody && membershipBody.missing !== true && typeof membershipBody.status === "string" ? membershipBody.status : null,
    snapshot,
  })
  return preliminaryBlock({
    events,
    emailRecordsDisagree: brief.emailControl === "records_disagree",
    authorityRecordsDisagree: brief.authority === "records_disagree",
    submittedConflict: brief.conflicts.length > 0,
  })
}
