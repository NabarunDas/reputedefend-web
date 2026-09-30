import "server-only"
import { paymentProvider } from "../../../../lib/payments"
import { mapBoundedProviderEvent } from "../../../../lib/payments/model"
import type { JobHandler, JobHandlerInput, JobHandlerResult } from "../jobs/model"

export function collectPaymentHandler(env: Record<string, string | undefined> = process.env): JobHandler {
  return {
    jobType: "COLLECT_PAYMENT",
    async execute({ payload, rpc }: JobHandlerInput): Promise<JobHandlerResult> {
      const provider = paymentProvider(env)
      if (provider.mode === "disabled") return { ok: false, retryable: false, error: "Payments are disabled." }
      const obligationId = typeof payload.obligationId === "string" ? payload.obligationId : ""
      if (!obligationId || !rpc) return { ok: false, retryable: false, error: "Collect payload is invalid." }
      const prepared = await rpc.rpc<{
        status?: string
        idempotencyKey?: string
        providerOperationId?: string
        attemptId?: string
        amountMinor?: number
        currency?: string
        stripeCustomerId?: string
        paymentMethodId?: string
        serviceOrderId?: string
        customerId?: string
      }>("payment_collect_prepare_v1", { p_obligation: obligationId })
      if (prepared.status !== "success" || !prepared.idempotencyKey || !prepared.stripeCustomerId || !prepared.paymentMethodId) {
        return { ok: false, retryable: false, error: "Obligation is not collectable." }
      }
      const intent = await provider.createOffSessionPayment({
        idempotencyKey: prepared.idempotencyKey,
        stripeCustomerId: prepared.stripeCustomerId,
        paymentMethodId: prepared.paymentMethodId,
        amountMinor: prepared.amountMinor || 0,
        currency: "GBP",
        metadata: {
          customerId: prepared.customerId || "",
          serviceOrderId: prepared.serviceOrderId || "",
          obligationId,
          attemptId: prepared.attemptId,
        },
      })
      await rpc.rpc("payment_record_provider_refs_v1", {
        p_operation: prepared.providerOperationId, p_object_id: intent.id, p_object_type: "payment_intent",
      })
      const type = intent.requiresAction ? "payment_intent.requires_action" : intent.status === "succeeded" ? "payment_intent.succeeded" : "payment_intent.payment_failed"
      await rpc.rpc("payment_apply_provider_event_v1", {
        p_event_id: `collect:${prepared.idempotencyKey}:${intent.id}`,
        p_type: type,
        p_object_id: intent.id,
        p_payload: { status: intent.status },
      })
      return { ok: true }
    },
  }
}

export function processStripeEventHandler(env: Record<string, string | undefined> = process.env): JobHandler {
  return {
    jobType: "PROCESS_STRIPE_EVENT",
    async execute({ payload, rpc }: JobHandlerInput): Promise<JobHandlerResult> {
      if (!rpc) return { ok: false, retryable: false, error: "Event processor requires RPC." }
      const eventId = typeof payload.eventId === "string" ? payload.eventId : ""
      const eventType = typeof payload.eventType === "string" ? payload.eventType : ""
      const objectId = typeof payload.objectId === "string" ? payload.objectId : null
      if (!eventId || !eventType) return { ok: false, retryable: false, error: "Event payload is invalid." }
      const kind = eventType.startsWith("payment_intent.") ? "payment_intent" : eventType.startsWith("setup_intent.") ? "setup_intent" : "checkout.session" as const
      const provider = paymentProvider(env)
      let object: Record<string, unknown> = { id: objectId || undefined }
      if (objectId && provider.retrieveObject) {
        object = await provider.retrieveObject(kind, objectId) ?? object
      }
      const mapped = mapBoundedProviderEvent({
        id: eventId,
        type: eventType,
        data: { object },
      })
      const result = await rpc.rpc<{ status?: string }>("payment_apply_provider_event_v1", {
        p_event_id: eventId,
        p_type: mapped.outcome === "setup_succeeded" && eventType === "checkout.session.completed" ? "checkout.session.completed_setup" : eventType,
        p_object_id: objectId,
        p_payload: {
          stripeCustomerId: mapped.stripeCustomerId,
          paymentMethodId: mapped.paymentMethod?.id,
          brand: mapped.paymentMethod?.brand,
          last4: mapped.paymentMethod?.last4,
          expMonth: mapped.paymentMethod?.expMonth,
          expYear: mapped.paymentMethod?.expYear,
          fingerprint: mapped.paymentMethod?.fingerprint,
          chargeId: mapped.chargeId,
          receiptUrl: mapped.receiptUrl,
          failureCategory: mapped.failureCategory,
          failureCode: mapped.failureCode,
        },
      })
      if (result.status !== "success") return { ok: false, retryable: true, error: "Provider event could not be applied." }
      return { ok: true }
    },
  }
}
