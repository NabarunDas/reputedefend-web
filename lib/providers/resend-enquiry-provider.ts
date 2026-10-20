import { Resend } from "resend"
import type { EnquiryEmailMessage, EnquiryProvider, EnquiryProviderResult } from "@/lib/enquiry-provider"

export type ResendEmailPayload = {
  from: string
  to: string | string[]
  replyTo?: string | string[]
  subject: string
  text: string
  html: string
}

export type ResendEmailOptions = {
  idempotencyKey?: string
}

export type ResendEmailClient = {
  emails: {
    send: (
      payload: ResendEmailPayload,
      options?: ResendEmailOptions,
    ) => Promise<{ data: { id: string } | null; error: { message?: string } | null }>
  }
}

async function sendWithResend(apiKey: string, payload: ResendEmailPayload, options?: ResendEmailOptions) {
  return new Resend(apiKey).emails.send({
    from: payload.from,
    to: payload.to,
    replyTo: payload.replyTo,
    subject: payload.subject,
    text: payload.text,
    html: payload.html,
  }, options?.idempotencyKey ? { idempotencyKey: options.idempotencyKey } : undefined)
}

export function createResendEnquiryProvider(
  apiKey: string,
  client?: ResendEmailClient,
): EnquiryProvider {
  return {
    async send(message: EnquiryEmailMessage): Promise<EnquiryProviderResult> {
      try {
        const payload: ResendEmailPayload = {
          from: message.from,
          to: message.to,
          replyTo: message.replyTo,
          subject: message.subject,
          text: message.text,
          html: message.html,
        }
        const options = message.idempotencyKey ? { idempotencyKey: message.idempotencyKey } : undefined
        const sent = client
          ? (options ? await client.emails.send(payload, options) : await client.emails.send(payload))
          : await sendWithResend(apiKey, payload, options)
        const { data, error } = sent

        if (error || !data?.id) {
          console.error("[enquiry] provider rejected delivery", {
            kind: message.kind,
            hasId: Boolean(data?.id),
          })
          return { ok: false, reason: "rejected" }
        }

        return { ok: true, id: data.id }
      } catch {
        console.error("[enquiry] provider threw during delivery", { kind: message.kind })
        return { ok: false, reason: "error" }
      }
    },
  }
}
