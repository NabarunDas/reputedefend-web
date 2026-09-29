import type { EnvMap } from "../jobs/config"
import type { JobHandler, JobHandlerInput, JobHandlerResult } from "../jobs/model"
import { acceptanceWindowExpired, communicationsSendEnabled } from "./gate"
import { linkSecretForVersion, materializeUploadUrl, prepareCommunicationAccessLink } from "./link"
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
  senderAddress?: string | null
  replyToAddress?: string | null
  inReplyTo?: string | null
  referencesHeader?: string | null
  linkKeyVersion?: number | null
}

type BeginAttempt = {
  status?: string
  firstProviderAttemptAt?: string | null
  providerCallPermitted?: boolean
}

function integerVersion(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 ? value : null
}

const alreadySent = new Set(["DELIVERED", "PROVIDER_ACCEPTED", "TRANSIENT_BOUNCE", "UNDETERMINED_BOUNCE"])
const permanentlyFailed = new Set(["BOUNCED", "COMPLAINED", "SUPPRESSED"])

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
      if (!loaded.senderAddress) return { ok: false, retryable: false, error: "Communication is not sendable" }
      if (alreadySent.has(loaded.deliveryStatus || "")) return { ok: true }
      if (permanentlyFailed.has(loaded.deliveryStatus || "")) {
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
        const version = integerVersion(loaded.linkKeyVersion)
        const prepared = actionId && version !== null ? prepareCommunicationAccessLink(actionId, env, version) : null
        if (!actionId || !origin || version === null || !prepared || !linkSecretForVersion(version, env)) {
          return { ok: false, retryable: false, error: "Secure upload link cannot be materialised" }
        }
        const nextText = materializeUploadUrl(text, actionId, origin, prepared.token)
        const nextHtml = html ? materializeUploadUrl(html, actionId, origin, prepared.token) : html
        if (!nextText || (html && !nextHtml)) return { ok: false, retryable: false, error: "Secure upload link cannot be materialised" }
        text = nextText
        html = nextHtml
      }
      const begun = await input.rpc.rpc<BeginAttempt>("communication_begin_provider_attempt_v1", {
        p_communication: communicationId,
        p_content_version: contentVersion,
        p_idempotency_key: input.idempotencyKey,
      })
      if (begun?.status !== "success") return { ok: false, retryable: false, error: "Communication is not sendable" }
      if (begun.providerCallPermitted !== true) {
        return { ok: false, retryable: false, error: "Provider acceptance must be reconciled" }
      }
      const mail = provider ?? resolveMailProvider(env)
      if (mail === "disabled") return { ok: false, retryable: true, error: "Customer mail is not enabled" }
      const sent = await mail.send({
        idempotencyKey: input.idempotencyKey,
        from: loaded.senderAddress,
        to: loaded.recipient,
        subject: loaded.subject,
        text,
        html,
        replyTo: loaded.replyToAddress,
        inReplyTo: loaded.inReplyTo,
        referencesHeader: loaded.referencesHeader,
      })
      if (!sent.ok) {
        if (sent.acceptanceUnknown) {
          await input.rpc.rpc("communication_mark_acceptance_unknown_v1", {
            p_communication: communicationId,
            p_idempotency_key: input.idempotencyKey,
          })
          return {
            ok: false,
            retryable: !acceptanceWindowExpired(begun.firstProviderAttemptAt || loaded.firstProviderAttemptAt || new Date().toISOString()),
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
