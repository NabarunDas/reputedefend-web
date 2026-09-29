import type { EnvMap } from "../jobs/config"
import type { JobHandler, JobHandlerInput, JobHandlerResult } from "../jobs/model"
import { resolveMailProvider, type OutgoingMailProvider } from "./mail"

export function sendEmailHandler(env: EnvMap = process.env, provider?: OutgoingMailProvider | "disabled"): JobHandler {
  return {
    jobType: "SEND_EMAIL",
    async execute(input: JobHandlerInput): Promise<JobHandlerResult> {
      const communicationId = typeof input.payload.communicationId === "string" ? input.payload.communicationId : ""
      if (!communicationId || !input.rpc) return { ok: false, retryable: false, error: "Invalid email job" }
      const loaded = await input.rpc.rpc<{
        status?: string
        deliveryStatus?: string
        recipient?: string
        subject?: string
        bodyText?: string
        bodyHtml?: string | null
        suppressed?: boolean
      }>("communication_load_send_v1", { p_communication: communicationId })
      if (loaded?.status !== "success" || !loaded.recipient || !loaded.subject || !loaded.bodyText) {
        return { ok: false, retryable: false, error: "Communication is not sendable" }
      }
      if (loaded.deliveryStatus === "DELIVERED" || loaded.deliveryStatus === "PROVIDER_ACCEPTED") return { ok: true }
      if (loaded.deliveryStatus === "BOUNCED" || loaded.deliveryStatus === "COMPLAINED" || loaded.deliveryStatus === "SUPPRESSED") {
        return { ok: false, retryable: false, error: "Recipient cannot be retried" }
      }
      if (loaded.suppressed) return { ok: false, retryable: false, error: "Recipient is suppressed" }
      const mail = provider ?? resolveMailProvider(env)
      if (mail === "disabled") return { ok: false, retryable: false, error: "Email provider is disabled" }
      const sent = await mail.send({
        idempotencyKey: input.idempotencyKey,
        to: loaded.recipient,
        subject: loaded.subject,
        text: loaded.bodyText,
        html: loaded.bodyHtml,
      })
      if (!sent.ok) {
        if (!sent.retryable) {
          await input.rpc.rpc("communication_mark_provider_rejected_v1", {
            p_communication: communicationId,
            p_error: sent.error,
            p_retryable: false,
            p_idempotency_key: input.idempotencyKey,
          })
        }
        return { ok: false, retryable: sent.retryable, error: sent.error }
      }
      return {
        ok: true,
        providerAccepted: { communicationId, provider: "resend", providerMessageId: sent.providerMessageId },
      }
    },
  }
}
