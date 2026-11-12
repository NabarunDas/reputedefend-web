import "server-only"
import { NextRequest, NextResponse } from "next/server"
import { backend, tokenHash, validToken } from "../auth/backend"
import { authConfig, sessionCookie } from "../auth/config"
import { adminCommandOriginError } from "../auth/command-origin"
import { privateResponseHeaders } from "../access"
import { isUuid } from "../records/model"
import { telloyaSalesBootstrapAllowed } from "./telloya-sales-context"
import { parseTelloyaDraftPlanTier, type TelloyaDraftPlanTier } from "./telloya-offer-draft"

const reply = (message: string, status: number, extra: Record<string, unknown> = {}) =>
  NextResponse.json({ message, ...extra }, { status, headers: privateResponseHeaders })

const UNAVAILABLE =
  "Telloya offer draft storage is unavailable on this deployment until the source-only draft migration is applied. The calculator still works for this session."

export function parseTelloyaOfferDraftCommand(body: unknown): {
  enquiryId: string
  expectedVersion: number
  planTier: TelloyaDraftPlanTier | null
  proposedGuardQuantity: number
  guardLocationIds: string[]
  overageOptIn: boolean
  overageCapPence: number | null
  notes: string
} | null {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null
  const record = body as Record<string, unknown>
  if (!isUuid(record.enquiryId)) return null
  if (!Number.isInteger(record.expectedVersion) || (record.expectedVersion as number) < 0) return null
  const planTier = record.planTier === null || record.planTier === undefined || record.planTier === ""
    ? null
    : parseTelloyaDraftPlanTier(record.planTier)
  if (record.planTier !== null && record.planTier !== undefined && record.planTier !== "" && planTier === null) return null
  if (!Number.isInteger(record.proposedGuardQuantity) || (record.proposedGuardQuantity as number) < 0 || (record.proposedGuardQuantity as number) > 50) return null
  const guardLocationIds = Array.isArray(record.guardLocationIds)
    ? record.guardLocationIds.map(String)
    : []
  if (guardLocationIds.length > 20 || guardLocationIds.some(id => !isUuid(id))) return null
  const overageOptIn = record.overageOptIn === true
  const overageCapPence = overageOptIn
    ? (record.overageCapPence === null || record.overageCapPence === undefined || record.overageCapPence === ""
      ? null
      : Number.isInteger(record.overageCapPence) && (record.overageCapPence as number) > 0 ? record.overageCapPence as number : undefined)
    : null
  if (overageCapPence === undefined) return null
  const notes = typeof record.notes === "string" ? record.notes : ""
  if (notes.length > 1000) return null
  return {
    enquiryId: record.enquiryId,
    expectedVersion: record.expectedVersion as number,
    planTier,
    proposedGuardQuantity: record.proposedGuardQuantity as number,
    guardLocationIds,
    overageOptIn,
    overageCapPence,
    notes,
  }
}

type CommandResult = {
  status: string
  reason?: string
  message?: string
  version?: number
  draft?: Record<string, unknown>
}

function mapResult(result: CommandResult): { ok: boolean; status: number; message: string; version?: number; draft?: Record<string, unknown> } {
  if (result.status === "unauthorized") return { ok: false, status: 401, message: "Your session has ended. Please sign in again." }
  if (result.status === "success") {
    return {
      ok: true,
      status: 200,
      message: result.message || "Draft offer estimate saved. This is not an official commercial offer.",
      version: result.version,
      draft: result.draft,
    }
  }
  if (result.status === "denied" && result.reason === "offer_locked") {
    return { ok: false, status: 409, message: "An official offer already exists. Use the revision flow instead of editing this draft." }
  }
  if (result.status === "denied" && result.reason === "onboarding_missing") {
    return { ok: false, status: 409, message: "Prepare the sales context before saving a draft estimate." }
  }
  if (result.status === "conflict" && result.reason === "stale_version") {
    return { ok: false, status: 409, message: "This draft changed elsewhere. Reload the enquiry before saving again." }
  }
  if (result.status === "invalid") return { ok: false, status: 400, message: "Check the draft selections and try again." }
  if (result.status === "conflict") return { ok: false, status: 409, message: "Reload the enquiry before saving the draft again." }
  return { ok: false, status: 503, message: "We couldn’t save the draft estimate. Reload the enquiry before trying again." }
}

export async function saveTelloyaOfferDraft(input: {
  token: string
  enquiryId: string
  expectedVersion: number
  planTier: TelloyaDraftPlanTier | null
  proposedGuardQuantity: number
  guardLocationIds: string[]
  overageOptIn: boolean
  overageCapPence: number | null
  notes: string
  idempotencyKey: string
}): Promise<{ ok: boolean; status: number; message: string; version?: number; draft?: Record<string, unknown> }> {
  if (!telloyaSalesBootstrapAllowed()) {
    return { ok: false, status: 403, message: "Telloya offer drafts stay closed outside Preview with the journey flag enabled." }
  }
  try {
    const result = await backend().rpc<CommandResult>("telloya_offer_draft_command_v1", {
      p_token: tokenHash(input.token),
      p_request: input.idempotencyKey,
      p_operation: "save",
      p_payload: {
        enquiryId: input.enquiryId,
        expectedVersion: input.expectedVersion,
        planTier: input.planTier,
        proposedGuardQuantity: input.proposedGuardQuantity,
        guardLocationIds: input.guardLocationIds,
        overageOptIn: input.overageOptIn,
        overageCapPence: input.overageCapPence,
        notes: input.notes,
      },
    })
    return mapResult(result)
  } catch {
    return { ok: false, status: 503, message: UNAVAILABLE }
  }
}

export async function telloyaOfferDraftCommand(request: NextRequest) {
  const config = authConfig()
  if (!config) return reply("The workspace is unavailable. Please try again shortly.", 503)
  const originMessage = adminCommandOriginError(request.headers.get("origin"), request.nextUrl.origin, config, "Reload this page and try again.")
  if (originMessage) return reply(originMessage, 403)
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") return reply("Reload this page and try again.", 415)
  const token = request.cookies.get(sessionCookie)?.value
  const key = request.headers.get("idempotency-key")
  if (!validToken(token)) return reply("Please sign in again.", 401)
  if (!isUuid(key)) return reply("Reload the form and try again.", 400)
  if (!telloyaSalesBootstrapAllowed()) {
    return reply("Telloya offer drafts stay closed outside Preview with the journey flag enabled.", 403)
  }
  try {
    const reader = request.body?.getReader()
    const decoder = new TextDecoder()
    let raw = "", size = 0
    if (reader) for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > 8192) { await reader.cancel(); return reply("That request is too large.", 413) }
      raw += decoder.decode(value, { stream: true })
    }
    raw += decoder.decode()
    let body: unknown
    try { body = JSON.parse(raw) } catch { return reply("Please check the form and try again.", 400) }
    const parsed = parseTelloyaOfferDraftCommand(body)
    if (!parsed) return reply("Check the draft selections and try again.", 400)
    const result = await saveTelloyaOfferDraft({
      token,
      ...parsed,
      idempotencyKey: key,
    })
    return reply(result.message, result.status, {
      ...(result.version !== undefined ? { version: result.version } : {}),
      ...(result.draft ? { draft: result.draft } : {}),
    })
  } catch {
    return reply("We couldn’t save the draft estimate. Reload the enquiry before trying again.", 503)
  }
}
