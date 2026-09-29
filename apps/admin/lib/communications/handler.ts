import type { EnvMap } from "../jobs/config"
import type { JobHandler, JobHandlerInput, JobHandlerResult } from "../jobs/model"
import { acceptanceWindowExpired, communicationsSendEnabled } from "./gate"
import { linkSecret, materializeUploadUrl, prepareCommunicationAccessLink } from "./link"
import { resolveMailProvider, type OutgoingMailProvider } from "./mail"

type LoadedSend = {
  status?: string
  deliveryStatus?: string
  recipient?: string
  subject?: string
  bodyText?: string
  bodyHtml?: string | null
  suppressed?: boolean
  templateKey?: string
  customerActionId?: string | null
  customerOrigin?: string | null
  firstProviderAttemptAt?: string | null
  contentVersion?: number
  lifecycle?: string
  contentLocked?: boolean
}

function integerVersion(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 ? value : null
}

export function sendEmailHandler(env: EnvMap = process.env, provider?: OutgoingMailProvider | "disabled"): JobHandler {
  return {
    jobType: "SEND_EMAIL",
    async execute(input: JobHandlerInput): Promise<JobHandlerResult> {
      const communicationId = typeof input.payload.communicationId === "string" ? input.payload.communicationId : ""
      const contentVersion = integerVersion(input.payload.contentVersion)
      if (!communicationId || contentVersion === null || !input.rpc) return { ok: false, retryable: false, error: "Invalid email job" }
      const loaded = await input.rpc.rpc<LoadedSend>("communication_load_send_v1", {
        p_communication: communicationId,
        p_content_version: contentVersion,
      })
      if (loaded?.status !== "success" || loaded.lifecycle !== "QUEUED" || loaded.contentLocked !== true) {
        return { ok: false, retryable: false, error: "Communication is not sendable" }
      }
      if (!loaded.recipient || !loaded.subject || !loaded.bodyText || loaded.contentVersion !== contentVersion) {
        return { ok: false, retryable: false, error: "Communication is not sendable" }
      }
      if (loaded.deliveryStatus === "DELIVERED" || loaded.deliveryStatus === "PROVIDER_ACCEPTED") return { ok: true }
      if (loaded.deliveryStatus === "BOUNCED" || loaded.deliveryStatus === "COMPLAINED" || loaded.deliveryStatus === "SUPPRESSED") {
        return { ok: false, retryable: false, error: "Recipient cannot be retried" }
      }
      if (loaded.suppressed) return { ok: false, retryable: false, error: "Recipient is suppressed" }
      if (loaded.deliveryStatus === "ACCEPTANCE_UNKNOWN" && acceptanceWindowExpired(loaded.firstProviderAttemptAt)) {
        return { ok: false, retryable: false, error: "Provider acceptance must be reconciled" }
      }
      if (!communicationsSendEnabled(env) && provider === undefined) {
        return { ok: false, retryable: true, error: "Customer mail is not enabled" }
      }
      let text = loaded.bodyText
      let html = loaded.bodyHtml
      if (loaded.templateKey === "EVIDENCE_REQUEST") {
        const actionId = loaded.customerActionId
        const origin = loaded.customerOrigin
        const prepared = actionId ? prepareCommunicationAccessLink(actionId, env) : null
        if (!actionId || !origin || !prepared || !linkSecret(env)) {
          return { ok: false, retryable: false, error: "Secure upload link cannot be materialised" }
        }
        const nextText = materializeUploadUrl(text, actionId, origin, prepared.token)
        const nextHtml = html ? materializeUploadUrl(html, actionId, origin, prepared.token) : html
        if (!nextText || (html && !nextHtml)) return { ok: false, retryable: false, error: "Secure upload link cannot be materialised" }
        text = nextText
        html = nextHtml
      }
      const mail = provider ?? resolveMailProvider(env)
      if (mail === "disabled") return { ok: false, retryable: true, error: "Customer mail is not enabled" }
      const sent = await mail.send({
        idempotencyKey: input.idempotencyKey,
        to: loaded.recipient,
        subject: loaded.subject,
        text,
        html,
      })
      if (!sent.ok) {
        if (sent.acceptanceUnknown) {
          await input.rpc.rpc("communication_mark_acceptance_unknown_v1", {
            p_communication: communicationId,
            p_idempotency_key: input.idempotencyKey,
          })
          return {
            ok: false,
            retryable: !acceptanceWindowExpired(loaded.firstProviderAttemptAt || new Date().toISOString()),
            error: sent.error,
          }
        }
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
