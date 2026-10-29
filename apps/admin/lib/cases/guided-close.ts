import "server-only"
import { NextRequest, NextResponse } from "next/server"
import { renderGuidedCompletion } from "../../../../lib/email/fulfilment"
import { backend, tokenHash, validToken } from "../auth/backend"
import { authConfig, customerPortalOrigin, sessionCookie } from "../auth/config"
import { adminCommandOriginError } from "../auth/command-origin"
import { privateResponseHeaders } from "../access"
import { confirmedReplyMailbox } from "../communications/brand-email"
import { communicationsSendEnabled, outgoingFromAddress } from "../communications/gate"
import { isUuid } from "../records/model"

const reply = (message: string, status: number) =>
  NextResponse.json({ message }, { status, headers: privateResponseHeaders })

function textField(value: unknown, min: number, max: number): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length >= min && value.length <= max ? value : null
}

export async function guidedFulfilmentClose(request: NextRequest) {
  const config = authConfig()
  if (!config) return reply("The workspace is unavailable. Please try again shortly.", 503)
  const originMessage = adminCommandOriginError(request.headers.get("origin"), request.nextUrl.origin, config, "Reload this page and try again.")
  if (originMessage) return reply(originMessage, 403)
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
      if (size > 32768) { await reader.cancel(); return reply("That request is too large.", 413) }
      raw += decoder.decode(value, { stream: true })
    }
    raw += decoder.decode()
    let body: unknown
    try { body = JSON.parse(raw) } catch { return reply("Please check the form and try again.", 400) }
    if (!body || typeof body !== "object" || Array.isArray(body)) return reply("Check the summary before closing.", 400)
    const fields = body as { id?: unknown; version?: unknown; summary?: unknown; note?: unknown }
    if (!isUuid(fields.id) || !Number.isInteger(fields.version)) return reply("Check the summary before closing.", 400)
    const summary = textField(fields.summary, 10, 2000)
    const note = textField(fields.note, 10, 1000)
    if (!summary || !note) return reply("Write a customer summary and a supporting note before closing.", 400)
    let email: Record<string, unknown> = {}
    if (communicationsSendEnabled()) {
      const context = await backend().rpc<{
        status?: string
        caseRef?: string
        amountMinor?: number
        currency?: string
        serviceCode?: string
        serviceName?: string
      }>("admin_guided_completion_context_v1", { p_token: tokenHash(token), p_case: fields.id })
      if (context.status === "already_queued") {
        return reply("The completion email is already queued. Another copy was not sent.", 200)
      }
      if (context.status !== "applicable") return reply("The case was not closed. The completion email could not be prepared.", 503)
      const origin = customerPortalOrigin()
      const from = outgoingFromAddress()
      const replyTo = confirmedReplyMailbox()
      const rendered = origin && from && replyTo && context.caseRef && context.serviceCode && context.serviceName && context.amountMinor != null && context.currency
        ? renderGuidedCompletion({
          serviceCode: context.serviceCode,
          serviceName: context.serviceName,
          caseRef: context.caseRef,
          amountMinor: context.amountMinor,
          currency: context.currency,
          origin,
          replyTo,
        })
        : null
      if (rendered && from && origin && replyTo) {
        email = {
          subject: rendered.subject,
          bodyText: rendered.text,
          bodyHtml: rendered.html,
          fromAddress: from,
          replyTo,
          customerOrigin: origin,
          sendEnabled: true,
        }
      }
    }
    const result = await backend().rpc<{ status?: string; reason?: string; completionEmail?: string; recovered?: boolean }>("admin_guided_fulfilment_close_v1", {
      p_token: tokenHash(token),
      p_request: key,
      p_case: fields.id,
      p_version: fields.version,
      p_data: { note, summary, ...email },
    })
    if (result.status === "success") {
      if (result.recovered) {
        if (result.completionEmail === "already_queued") {
          return reply("The completion update was already queued. Another copy was not sent. The case stays closed.", 200)
        }
        if (result.completionEmail === "success") {
          return reply("The completion update is queued. Queued is not delivered. The case was already closed. This does not record a Google decision and it does not enrol Relaunch Guard.", 200)
        }
        return reply("The completion update was not sent. The case stays closed. This does not record a Google decision and it does not enrol Relaunch Guard.", 200)
      }
      const queued = result.completionEmail === "success"
        ? "The completion email is queued. Queued is not delivered."
        : result.completionEmail === "already_queued"
          ? "The completion email was already queued. Another copy was not sent."
          : "The completion email was not sent, so the notification is pending."
      return reply(`The Guided preparation is closed. ${queued} This does not record a Google decision and it does not enrol Relaunch Guard.`, 200)
    }
    if (result.status === "unauthorized") return reply("Your session has ended. Please sign in again.", 401)
    if (result.status === "conflict") return reply("This case has changed. Reload it before trying again.", 409)
    if (result.status === "open_work") return reply("Resolve open tasks and outstanding submission attempts before closing.", 409)
    if (result.status === "denied") {
      if (result.reason === "unpaid" || result.reason === "receipt" || result.reason === "refunded") {
        return reply("This Guided preparation cannot close until the upfront payment is settled and the receipt is on the case.", 403)
      }
      if (result.reason === "outcome_recorded") return reply("A Google outcome is already recorded. Close with that outcome instead.", 403)
      if (result.reason === "not_guided") return reply("This close is only for a Guided preparation.", 403)
      if (result.reason === "pack") return reply("Send the completed pack before closing this Guided preparation.", 403)
      return reply("This Guided preparation cannot be closed from its current record.", 403)
    }
    if (result.status === "invalid") return reply("Check the summary and the supporting note before closing.", 400)
    return reply("We couldn’t confirm the change. Reload the case before trying again.", 503)
  } catch {
    return reply("We couldn’t confirm the change. Reload the case before trying again.", 503)
  }
}
