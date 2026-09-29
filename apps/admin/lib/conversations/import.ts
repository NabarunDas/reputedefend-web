import type { EnvMap } from "../jobs/config"
import type { JobHandler, JobHandlerInput, JobHandlerResult } from "../jobs/model"
import { communicationsInboundEnabled, inboundMailDomain, inboundOwnedAddresses } from "./gate"
import { parseMailbox, parseMailboxList } from "./mailbox"

export type ReceivedEmailAttachment = {
  id: string
  filename?: string
  content_type?: string
  size?: number
}

export type ReceivedEmail = {
  id?: string
  from?: string
  to?: string[]
  cc?: string[]
  subject?: string | null
  text?: string | null
  html?: string | null
  message_id?: string | null
  created_at?: string
  headers?: Array<{ name?: string; value?: string }> | Record<string, string>
  attachments?: ReceivedEmailAttachment[]
}

export type InboundEmailProvider = {
  getReceivedEmail(emailId: string): Promise<ReceivedEmail | null>
}

type LoadedImport = {
  status?: string
  alreadyImported?: boolean
  importStatus?: string
  providerEmailId?: string
  providerEventId?: string
}

function headerValue(headers: ReceivedEmail["headers"], name: string): string | null {
  const wanted = name.toLowerCase()
  if (Array.isArray(headers)) {
    const found = headers.find(item => String(item.name || "").toLowerCase() === wanted)
    return found?.value ? String(found.value) : null
  }
  if (headers && typeof headers === "object") {
    for (const [key, value] of Object.entries(headers)) {
      if (key.toLowerCase() === wanted && value) return String(value)
    }
  }
  return null
}

function addresses(value: unknown): string[] {
  return parseMailboxList(value)
}

export function createDisabledInboundProvider(): InboundEmailProvider {
  return {
    async getReceivedEmail() {
      return null
    },
  }
}

export function createIdempotentInboundProvider(emails: Record<string, ReceivedEmail>): InboundEmailProvider & { calls: number } {
  let calls = 0
  return {
    get calls() { return calls },
    async getReceivedEmail(emailId) {
      calls += 1
      return emails[emailId] ?? null
    },
  }
}

export function resolveInboundProvider(env: EnvMap = process.env, override?: InboundEmailProvider): InboundEmailProvider | "disabled" {
  if (override) return override
  if (!communicationsInboundEnabled(env)) return "disabled"
  const apiKey = env.RESEND_API_KEY
  if (!apiKey) return "disabled"
  return createResendInboundProvider(apiKey)
}

function asReceivedEmail(value: unknown): ReceivedEmail | null {
  if (!value || typeof value !== "object") return null
  const row = value as Record<string, unknown>
  const from = typeof row.from === "string" ? row.from
    : row.from && typeof row.from === "object" && typeof (row.from as { email?: unknown }).email === "string"
      ? String((row.from as { email: string }).email)
      : undefined
  return {
    id: typeof row.id === "string" ? row.id : undefined,
    from,
    to: addresses(row.to),
    cc: addresses(row.cc),
    subject: typeof row.subject === "string" ? row.subject : null,
    text: typeof row.text === "string" ? row.text : null,
    html: typeof row.html === "string" ? row.html : null,
    message_id: typeof row.message_id === "string" ? row.message_id : null,
    created_at: typeof row.created_at === "string" ? row.created_at : undefined,
    headers: Array.isArray(row.headers) || (row.headers && typeof row.headers === "object")
      ? row.headers as ReceivedEmail["headers"]
      : undefined,
    attachments: Array.isArray(row.attachments)
      ? row.attachments.filter((item): item is ReceivedEmailAttachment => !!item && typeof item === "object" && typeof (item as { id?: unknown }).id === "string")
          .map(item => ({
            id: item.id,
            filename: typeof item.filename === "string" ? item.filename : undefined,
            content_type: typeof item.content_type === "string" ? item.content_type : undefined,
            size: typeof item.size === "number" ? item.size : undefined,
          }))
      : undefined,
  }
}

export function createResendInboundProvider(
  apiKey: string,
  client?: { emails: { receiving: { get: (id: string) => Promise<{ data?: unknown }> } } },
): InboundEmailProvider {
  return {
    async getReceivedEmail(emailId) {
      const resend = client ?? new (await import("resend")).Resend(apiKey)
      const { data } = await resend.emails.receiving.get(emailId)
      return asReceivedEmail(data)
    },
  }
}

export function importInboundEmailHandler(env: EnvMap = process.env, provider?: InboundEmailProvider | "disabled"): JobHandler {
  return {
    jobType: "IMPORT_INBOUND_EMAIL",
    async execute(input: JobHandlerInput): Promise<JobHandlerResult> {
      const emailId = typeof input.payload.providerEmailId === "string" ? input.payload.providerEmailId : ""
      const eventId = typeof input.payload.providerEventId === "string" ? input.payload.providerEventId : ""
      if (!emailId || !input.rpc) return { ok: false, retryable: false, error: "Invalid inbound email job" }
      const loaded = await input.rpc.rpc<LoadedImport>("inbound_email_load_import_v1", {
        p_provider: "resend",
        p_provider_email_id: emailId,
      })
      if (loaded?.status !== "success") return { ok: false, retryable: false, error: "Inbound receipt is unavailable" }
      if (loaded.alreadyImported) return { ok: true }
      const inbound = provider ?? resolveInboundProvider(env)
      if (inbound === "disabled") return { ok: false, retryable: true, error: "Inbound mail is not enabled" }
      const email = await inbound.getReceivedEmail(emailId)
      if (!email) return { ok: false, retryable: true, error: "Received email is not available" }
      const sender = parseMailbox(email.from)
      const attachments = (email.attachments || []).slice(0, 10).map(item => {
        const sizeBytes = typeof item.size === "number" && Number.isFinite(item.size) ? item.size : -1
        return {
          providerAttachmentId: item.id,
          filename: (item.filename || "attachment").slice(0, 200),
          mimeType: (item.content_type || "application/octet-stream").slice(0, 120),
          sizeBytes,
        }
      })
      if (attachments.some(item => item.sizeBytes < 0 || item.sizeBytes > 104857600)) {
        return { ok: false, retryable: false, error: "Inbound attachment metadata is invalid" }
      }
      const result = await input.rpc.rpc<{ status?: string }>("inbound_email_import_v1", {
        p_payload: {
          providerEmailId: emailId,
          providerEventId: eventId || loaded.providerEventId,
          rfcMessageId: email.message_id || headerValue(email.headers, "message-id"),
          senderAddress: sender?.address ?? null,
          senderDisplay: sender?.display ?? null,
          subject: email.subject,
          bodyText: email.text || "",
          bodyHtml: email.html || "",
          inReplyTo: headerValue(email.headers, "in-reply-to"),
          referencesHeader: headerValue(email.headers, "references"),
          autoSubmitted: headerValue(email.headers, "auto-submitted"),
          toAddresses: addresses(email.to),
          ccAddresses: addresses(email.cc),
          inboundDomain: inboundMailDomain(env),
          ownedAddresses: inboundOwnedAddresses(env),
          receivedAt: email.created_at,
          attachments,
        },
      })
      if (result?.status !== "success") return { ok: false, retryable: false, error: "Inbound import failed" }
      return { ok: true }
    },
  }
}
