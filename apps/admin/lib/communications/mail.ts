import "server-only"
import { canRegisterLiveProvider, resolveProviderMode, type EnvMap } from "../jobs/config"

export type OutgoingMailMessage = {
  idempotencyKey: string
  from?: string
  to: string
  subject: string
  text: string
  html?: string | null
}

export type OutgoingMailResult =
  | { ok: true; providerMessageId: string; replay: boolean }
  | { ok: false; retryable: boolean; error: string; acceptanceUnknown?: boolean }

export type OutgoingMailProvider = {
  send(message: OutgoingMailMessage): Promise<OutgoingMailResult>
}

export type ResendEmailPayload = {
  from: string
  to: string
  subject: string
  text: string
  html?: string
}

export type ResendSendOptions = {
  idempotencyKey: string
}

export type ResendMailClient = {
  emails: {
    send: (
      payload: ResendEmailPayload,
      options?: ResendSendOptions,
    ) => Promise<{ data?: { id?: string } | null; error?: { message?: string } | null }>
  }
}

export function createIdempotentMailProvider(): OutgoingMailProvider & {
  effects: number
  calls: number
  payloads: OutgoingMailMessage[]
} {
  const processed = new Map<string, string>()
  const payloads: OutgoingMailMessage[] = []
  let effects = 0
  let calls = 0
  return {
    get effects() { return effects },
    get calls() { return calls },
    payloads,
    async send(message) {
      calls += 1
      payloads.push({
        idempotencyKey: message.idempotencyKey,
        from: message.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html ?? null,
      })
      const existing = processed.get(message.idempotencyKey)
      if (existing) return { ok: true, providerMessageId: existing, replay: true }
      const providerMessageId = crypto.randomUUID()
      processed.set(message.idempotencyKey, providerMessageId)
      effects += 1
      return { ok: true, providerMessageId, replay: false }
    },
  }
}

export function mailFromAddress(env: EnvMap = process.env): string | null {
  const raw = env.COMMUNICATIONS_FROM_EMAIL
  if (!raw || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw) || raw.length > 254) return null
  return raw
}

export function resolveMailProvider(env: EnvMap = process.env): OutgoingMailProvider | "disabled" {
  const mode = resolveProviderMode(env)
  if (mode === "mock") return createIdempotentMailProvider()
  if (mode === "production" && canRegisterLiveProvider(mode, env)) {
    const from = mailFromAddress(env)
    const apiKey = env.RESEND_API_KEY
    if (!from || !apiKey) return "disabled"
    return createResendMailProvider(apiKey, from)
  }
  return "disabled"
}

export function createResendMailProvider(
  apiKey: string,
  from: string,
  client?: ResendMailClient,
): OutgoingMailProvider {
  return {
    async send(message) {
      const payload: ResendEmailPayload = {
        from: message.from || from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html || undefined,
      }
      const options: ResendSendOptions = { idempotencyKey: message.idempotencyKey }
      try {
        const resend = client ?? new (await import("resend")).Resend(apiKey)
        const { data, error } = await resend.emails.send(payload, options)
        if (error || !data?.id) {
          const text = error?.message || ""
          if (/timeout|temporar|unavailable|unable to fetch|network|econnreset|etimedout/i.test(text)) {
            return { ok: false, retryable: true, acceptanceUnknown: true, error: "Email provider acceptance is unknown" }
          }
          const retryable = /rate|429|5\d\d/i.test(text)
          return { ok: false, retryable, error: "Email provider rejected the message" }
        }
        return { ok: true, providerMessageId: data.id, replay: false }
      } catch {
        return { ok: false, retryable: true, acceptanceUnknown: true, error: "Email provider acceptance is unknown" }
      }
    },
  }
}
