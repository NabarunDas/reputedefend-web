import "server-only"
import { canRegisterLiveProvider, resolveProviderMode, type EnvMap } from "../jobs/config"

export type OutgoingMailMessage = {
  idempotencyKey: string
  to: string
  subject: string
  text: string
  html?: string | null
}

export type OutgoingMailResult =
  | { ok: true; providerMessageId: string; replay: boolean }
  | { ok: false; retryable: boolean; error: string }

export type OutgoingMailProvider = {
  send(message: OutgoingMailMessage): Promise<OutgoingMailResult>
}

export function createIdempotentMailProvider(): OutgoingMailProvider & { effects: number; calls: number } {
  const processed = new Map<string, string>()
  let effects = 0
  let calls = 0
  return {
    get effects() { return effects },
    get calls() { return calls },
    async send(message) {
      calls += 1
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
  client?: { emails: { send: (input: Record<string, unknown>) => Promise<{ data?: { id?: string } | null; error?: { message?: string } | null }> } },
): OutgoingMailProvider {
  return {
    async send(message) {
      try {
        const resend = client ?? new (await import("resend")).Resend(apiKey)
        const { data, error } = await resend.emails.send({
          from,
          to: message.to,
          subject: message.subject,
          text: message.text,
          html: message.html || undefined,
          headers: { "Idempotency-Key": message.idempotencyKey },
        })
        if (error || !data?.id) {
          const retryable = /rate|timeout|temporar|unavailable|429|5\d\d/i.test(error?.message || "")
          return { ok: false, retryable, error: "Email provider rejected the message" }
        }
        return { ok: true, providerMessageId: data.id, replay: false }
      } catch {
        return { ok: false, retryable: true, error: "Email provider was unavailable" }
      }
    },
  }
}
