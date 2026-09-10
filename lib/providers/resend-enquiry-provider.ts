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

export type ResendEmailClient = {
  emails: {
    send: (payload: ResendEmailPayload) => Promise<{ data: { id: string } | null; error: { message?: string } | null }>
  }
}

async function sendWithResend(apiKey: string, payload: ResendEmailPayload) {
  return new Resend(apiKey).emails.send({
    from: payload.from,
    to: payload.to,
    replyTo: payload.replyTo,
    subject: payload.subject,
    text: payload.text,
    html: payload.html,
  })
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
        const { data, error } = client
          ? await client.emails.send(payload)
          : await sendWithResend(apiKey, payload)

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
