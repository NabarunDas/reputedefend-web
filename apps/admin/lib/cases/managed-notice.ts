import "server-only"
import { NextRequest, NextResponse } from "next/server"
import { renderManagedNotice, type ManagedNoticeVariant } from "../../../../lib/email/managed-journey"
import { backend, tokenHash, validToken } from "../auth/backend"
import { authConfig, customerPortalOrigin, sessionCookie } from "../auth/config"
import { adminCommandOriginError } from "../auth/command-origin"
import { privateResponseHeaders } from "../access"
import { confirmedReplyMailbox } from "../communications/brand-email"
import { communicationsSendEnabled, outgoingFromAddress } from "../communications/gate"
import { isUuid } from "../records/model"

const kinds = ["submission", "result", "invoice", "completion"] as const
type NoticeKind = (typeof kinds)[number]
const variants = new Set<ManagedNoticeVariant>([
  "submitted", "follow_up", "google_reply", "unsuccessful_reply", "invoice", "complete_paid", "complete_no_fee", "withdrawn",
])

const reply = (message: string, status: number) =>
  NextResponse.json({ message }, { status, headers: privateResponseHeaders })

type NoticeContext = {
  status?: string
  variant?: string
  caseRef?: string
  serviceCode?: string
  serviceName?: string
  amountMinor?: number | null
  currency?: string
}

function clause(status: string | undefined): string {
  if (status === "success") return " The customer email is queued. Queued is not delivered."
  if (status === "replay" || status === "already_queued") return " The customer email was already queued. Another copy was not sent."
  if (status === "reauth_required") return " The customer email was not queued because this sign-in is older than 30 minutes. Sign in again to send it. Another copy is not sent if one is already queued."
  if (status === "mail_off") return " The customer email was not queued because outgoing mail is off. The notification stays pending."
  if (status === "not_applicable" || status === undefined) return ""
  return " The customer email could not be queued. The record itself was saved, and another copy was not sent."
}

export async function queueManagedNotice(input: {
  token: string
  requestId: string
  caseId?: string | null
  orderId?: string | null
  kind: NoticeKind
}): Promise<string> {
  if (!communicationsSendEnabled()) return ""
  const origin = customerPortalOrigin()
  const from = outgoingFromAddress()
  const replyTo = confirmedReplyMailbox()
  if (!origin || !from || !replyTo) return clause("mail_off")
  const context = await backend().rpc<NoticeContext>("admin_managed_notice_context_v1", {
    p_token: tokenHash(input.token),
    p_kind: input.kind,
    p_case: input.caseId ?? null,
    p_order: input.orderId ?? null,
  })
  if (context.status === "already_queued") return clause("already_queued")
  if (context.status !== "applicable" || !context.variant || !variants.has(context.variant as ManagedNoticeVariant)) {
    return clause(context.status)
  }
  const rendered = renderManagedNotice({
    variant: context.variant as ManagedNoticeVariant,
    serviceCode: context.serviceCode || "",
    serviceName: context.serviceName || "",
    caseRef: context.caseRef || "",
    amountMinor: context.amountMinor,
    currency: context.currency,
    origin,
    replyTo,
  })
  if (!rendered) return clause("invalid")
  const queued = await backend().rpc<{ status?: string; replay?: boolean }>("admin_queue_managed_notice_v1", {
    p_token: tokenHash(input.token),
    p_request: input.requestId,
    p_case: input.caseId ?? null,
    p_kind: input.kind,
    p_order: input.orderId ?? null,
    p_data: {
      subject: rendered.subject,
      bodyText: rendered.text,
      bodyHtml: rendered.html,
      fromAddress: from,
      replyTo,
      customerOrigin: origin,
    },
  })
  if (queued.replay) return clause("replay")
  return clause(queued.status)
}

export async function managedNoticeCommand(request: NextRequest) {
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
      if (size > 4096) { await reader.cancel(); return reply("That request is too large.", 413) }
      raw += decoder.decode(value, { stream: true })
    }
    raw += decoder.decode()
    let body: unknown
    try { body = JSON.parse(raw) } catch { return reply("Reload this page and try again.", 400) }
    if (!body || typeof body !== "object" || Array.isArray(body)) return reply("Reload this page and try again.", 400)
    const fields = body as { id?: unknown; kind?: unknown }
    if (!isUuid(fields.id) || typeof fields.kind !== "string" || !kinds.includes(fields.kind as NoticeKind)) {
      return reply("Reload this page and try again.", 400)
    }
    if (!communicationsSendEnabled()) {
      return reply("The customer email was not queued because outgoing mail is off. The notification stays pending. Nothing was submitted to Google and no card was charged.", 200)
    }
    const sentence = await queueManagedNotice({
      token,
      requestId: key,
      caseId: fields.id,
      kind: fields.kind as NoticeKind,
    })
    if (!sentence) return reply("There is no customer update waiting to be sent. Another copy was not sent.", 200)
    return reply(sentence.trim(), 200)
  } catch {
    return reply("We couldn’t confirm the email. Reload the case before trying again.", 503)
  }
}
