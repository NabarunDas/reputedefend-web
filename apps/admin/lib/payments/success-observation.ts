import "server-only"
import { NextRequest, NextResponse } from "next/server"
import { backend, tokenHash, validToken } from "../auth/backend"
import { authConfig, sessionCookie } from "../auth/config"
import { adminCommandOriginError } from "../auth/command-origin"
import { privateResponseHeaders } from "../access"
import { isUuid } from "../records/model"
import { ADMIN_RECENT_SIGN_IN_MESSAGE } from "../admin/reauth-copy"

const findings = ["ABSENT", "PRESENT", "RECURRENCE", "AMBIGUOUS", "UNRELATED"] as const
const visibilities = ["VISIBLE", "NOT_SHOWN", "NOT_APPLICABLE"] as const
const sources = ["ACCESSIBLE", "INACCESSIBLE"] as const

const reply = (message: string, status = 200) =>
  NextResponse.json({ message }, { status, headers: privateResponseHeaders })

function text(value: unknown, min: number, max: number): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length >= min && trimmed.length <= max ? trimmed : null
}

type RpcResult = { status?: string; replay?: boolean; reason?: string; message?: string }

function sessionProblem(result: RpcResult): NextResponse | null {
  if (result.status === "reauth_required") return reply(ADMIN_RECENT_SIGN_IN_MESSAGE, 403)
  if (result.status === "unauthorized") return reply("Your session has ended. Please sign in again.", 401)
  return null
}

function observationMessage(result: RpcResult): NextResponse {
  const blocked = sessionProblem(result)
  if (blocked) return blocked
  if (result.reason === "timestamp") {
    return reply("That time does not match the evidence. A live check uses the time it is recorded. Older evidence is used only when its upload time is the check time.", 400)
  }
  if (result.reason === "baseline_mismatch") {
    return reply("That check does not match the contracted profile or review, so it was not recorded.", 403)
  }
  if (result.reason === "baseline_missing") {
    return reply("Record the contracted profile or review before adding a check.", 403)
  }
  if (result.reason === "duplicate_evidence" || result.reason === "baseline_evidence") {
    return reply("Each check needs its own accepted evidence. One file cannot prove two checks, and the file that identified the target cannot be reused as a check.", 403)
  }
  if (result.reason === "visibility" || result.reason === "source") {
    return reply("The finding does not match what the check says was shown, or the source could not be opened for an absent result.", 400)
  }
  if (result.status === "invalid") return reply("Check the fields before saving.", 400)
  if (result.status === "denied") return reply("That check does not belong to this success-fee order, so it was not recorded.", 403)
  if (result.status !== "success") return reply("The check could not be recorded.", 503)
  return reply(result.replay
    ? "This check was already recorded. It was not recorded again."
    : "The check is recorded. It does not approve the success fee, create an invoice, or charge a card.")
}

export async function recordSuccessObservation(request: NextRequest): Promise<NextResponse> {
  const config = authConfig()
  if (!config) return reply("The workspace is unavailable. Please try again shortly.", 503)
  const originMessage = adminCommandOriginError(request.headers.get("origin"), request.nextUrl.origin, config, "Reload this page and try again.")
  if (originMessage) return reply(originMessage, 403)
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") return reply("Reload this page and try again.", 415)
  const token = request.cookies.get(sessionCookie)?.value
  const key = request.headers.get("idempotency-key")
  if (!validToken(token)) return reply("Please sign in again.", 401)
  if (!isUuid(key)) return reply("Reload the form and try again.", 400)
  let body: Record<string, unknown>
  try {
    const parsed = await request.json() as unknown
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return reply("Check the fields before saving.", 400)
    body = parsed as Record<string, unknown>
  } catch {
    return reply("Please check the form and try again.", 400)
  }
  const action = body.action
  if (action !== "baseline" && action !== "observation" && action !== "invalidate" && action !== "dispute") {
    return reply("Reload this page and try again.", 400)
  }
  const serviceOrderId = typeof body.serviceOrderId === "string" && isUuid(body.serviceOrderId) ? body.serviceOrderId : null
  if (!serviceOrderId && action !== "invalidate") return reply("Check the fields before saving.", 400)
  try {
    if (action === "baseline") return await recordBaseline(token, key, serviceOrderId, body)
    if (action === "observation") return await recordCheck(token, key, serviceOrderId, body)
    if (action === "invalidate") return await invalidateCheck(token, key, body)
    return await recordDispute(token, key, serviceOrderId, body)
  } catch {
    return reply("We couldn’t confirm that change. Reload the page before trying again.", 503)
  }
}

async function recordBaseline(token: string, key: string, serviceOrderId: string | null, body: Record<string, unknown>) {
  const evidenceVersionId = typeof body.evidenceVersionId === "string" && isUuid(body.evidenceVersionId) ? body.evidenceVersionId : null
  if (!serviceOrderId || !evidenceVersionId) return reply("Choose the accepted evidence that identifies the contracted profile or review.", 400)
  const result = await backend().rpc<RpcResult & { targetRef?: string }>("admin_record_success_baseline_v1", {
    p_token: tokenHash(token),
    p_request: key,
    p_payload: {
      serviceOrderId,
      evidenceVersionId,
      ...(typeof body.targetRef === "string" && body.targetRef.trim() ? { targetRef: body.targetRef.trim() } : {}),
    },
  })
  const blocked = sessionProblem(result)
  if (blocked) return blocked
  if (result.reason === "baseline_mismatch" || result.reason === "mismatch") {
    return reply("The saved profile or review address does not match this order, so it was not frozen.", 403)
  }
  if (result.reason === "baseline_recorded") return reply("The contracted profile or review is already recorded. It was not recorded again.", 409)
  if (result.reason === "target" || result.reason === "evidence" || result.reason === "restriction") {
    return reply("The case has no usable profile or review address, or the selected evidence is not accepted for this case.", 403)
  }
  if (result.status === "invalid") return reply("Check the fields before saving.", 400)
  if (result.status === "denied") return reply("That order cannot freeze a success target.", 403)
  if (result.status !== "success") return reply("The contracted target could not be recorded.", 503)
  return reply(result.replay
    ? "The contracted profile or review was already recorded. It was not recorded again."
    : "The contracted profile or review is now the only target these checks can use. This does not approve a fee or charge a card.")
}

async function recordCheck(token: string, key: string, serviceOrderId: string | null, body: Record<string, unknown>) {
  const evidenceVersionId = typeof body.evidenceVersionId === "string" && isUuid(body.evidenceVersionId) ? body.evidenceVersionId : null
  const observerRef = text(body.observerRef, 8, 200)
  const note = text(body.note, 10, 2000)
  const finding = typeof body.finding === "string" && findings.includes(body.finding as typeof findings[number]) ? body.finding : null
  const reviewVisibility = typeof body.reviewVisibility === "string" && visibilities.includes(body.reviewVisibility as typeof visibilities[number]) ? body.reviewVisibility : null
  const sourceAccess = typeof body.sourceAccess === "string" && sources.includes(body.sourceAccess as typeof sources[number]) ? body.sourceAccess : null
  const historicException = body.historicException === true
  const historicReason = text(body.historicReason, 20, 2000)
  if (!serviceOrderId || !evidenceVersionId || !observerRef || !note || !finding || !reviewVisibility || !sourceAccess) {
    return reply("Check the fields before saving.", 400)
  }
  if (historicException && !historicReason) {
    return reply("Older evidence needs a short explanation of why this check uses that file’s upload time.", 400)
  }
  if (!historicException && body.historicReason) return reply("A live check does not take a backdated time.", 400)
  const result = await backend().rpc<RpcResult>("admin_record_success_observation_v1", {
    p_token: tokenHash(token),
    p_request: key,
    p_payload: {
      serviceOrderId,
      evidenceVersionId,
      finding,
      reviewVisibility,
      sourceAccess,
      observerRef,
      note,
      historicException,
      ...(historicReason ? { historicReason } : {}),
      ...(typeof body.targetRef === "string" && body.targetRef.trim() ? { targetRef: body.targetRef.trim() } : {}),
    },
  })
  return observationMessage(result)
}

async function invalidateCheck(token: string, key: string, body: Record<string, unknown>) {
  const observationId = typeof body.observationId === "string" && isUuid(body.observationId) ? body.observationId : null
  const reason = text(body.reason, 20, 2000)
  if (!observationId || !reason) return reply("Explain why this check should be withdrawn. The original check stays in the history.", 400)
  const result = await backend().rpc<RpcResult>("admin_invalidate_success_observation_v1", {
    p_token: tokenHash(token),
    p_request: key,
    p_payload: { observationId, reason },
  })
  const blocked = sessionProblem(result)
  if (blocked) return blocked
  if (result.reason === "already_invalidated") return reply("That check was already withdrawn. It was not changed again.", 409)
  if (result.status === "invalid") return reply("Check the fields before saving.", 400)
  if (result.status === "denied") return reply("That check could not be withdrawn.", 403)
  if (result.status !== "success") return reply("The check could not be withdrawn.", 503)
  return reply(result.replay
    ? "That withdrawal was already recorded. The check was not changed again."
    : "The check is withdrawn from the qualifying pair. The original record remains. This does not delete it, approve a fee, or charge a card.")
}

async function recordDispute(token: string, key: string, serviceOrderId: string | null, body: Record<string, unknown>) {
  const disputeAction = body.disputeAction === "open" || body.disputeAction === "resolve" ? body.disputeAction : null
  if (!serviceOrderId || !disputeAction) return reply("Check the fields before saving.", 400)
  const payload: Record<string, unknown> = { serviceOrderId, action: disputeAction }
  if (disputeAction === "open") {
    const reason = text(body.reason, 20, 2000)
    if (!reason) return reply("Record the customer’s written dispute before pausing collection.", 400)
    payload.reason = reason
  } else {
    const resolution = text(body.resolution, 20, 2000)
    const outcome = body.outcome === "UPHELD" || body.outcome === "NOT_UPHELD" ? body.outcome : null
    if (!resolution || !outcome) return reply("Record how the dispute was decided before collection can change.", 400)
    payload.resolution = resolution
    payload.outcome = outcome
  }
  const result = await backend().rpc<RpcResult>("admin_success_fee_dispute_v1", {
    p_token: tokenHash(token),
    p_request: key,
    p_payload: payload,
  })
  const blocked = sessionProblem(result)
  if (blocked) return blocked
  if (result.reason === "collection_paused") {
    return reply("Collection is already paused for this success fee. No new invoice was created and no card was charged.", 409)
  }
  if (result.status === "invalid") return reply("Check the fields before saving.", 400)
  if (result.status === "denied") return reply("That dispute could not be recorded for this success-fee order.", 403)
  if (result.status !== "success") return reply("The dispute could not be recorded.", 503)
  if (result.replay) return reply("That dispute update was already recorded. It was not recorded again.")
  if (disputeAction === "open") {
    return reply("Collection is paused. No new invoice or payment action will be created while the dispute is open, and no card is charged. An invoice that was already issued is not cancelled here.")
  }
  return reply(body.outcome === "UPHELD"
    ? "The dispute is upheld. The success fee stays not payable. No card was charged."
    : "The dispute is not upheld. A hosted invoice can be issued when the checks still qualify. No card was charged.")
}
