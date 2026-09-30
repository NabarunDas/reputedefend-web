import "server-only"
import { paymentProvider } from "../../../../lib/payments"
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
          providerOperationId: prepared.providerOperationId,
        },
      })
      if (intent.classification === "retryable") {
        return { ok: false, retryable: true, error: intent.failureCode || "Provider unavailable." }
      }
      if (intent.id) {
        await rpc.rpc("payment_record_provider_refs_v1", {
          p_operation: prepared.providerOperationId, p_object_id: intent.id, p_object_type: "payment_intent",
        })
      }
      if (intent.classification === "requires_action") {
        await rpc.rpc("payment_apply_provider_event_v1", {
          p_event_id: `collect:${prepared.idempotencyKey}:${intent.id}:action`,
          p_type: "payment_intent.requires_action",
          p_object_id: intent.id,
          p_payload: { status: intent.status },
        })
        return { ok: true }
      }
      if (intent.classification === "declined") {
        await rpc.rpc("payment_apply_provider_event_v1", {
          p_event_id: `collect:${prepared.idempotencyKey}:${intent.id || "declined"}:failed`,
          p_type: "payment_intent.payment_failed",
          p_object_id: intent.id || prepared.providerOperationId,
          p_payload: { status: intent.status, failureCategory: intent.failureCategory, failureCode: intent.failureCode },
        })
        return { ok: false, retryable: false, error: intent.failureCode || "Payment declined." }
      }
      await rpc.rpc("payment_apply_provider_event_v1", {
        p_event_id: `collect:${prepared.idempotencyKey}:${intent.id}`,
        p_type: "payment_intent.succeeded",
        p_object_id: intent.id,
        p_payload: { status: intent.status, paymentIntentStatus: "succeeded" },
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
      if (payload.livemode === true) {
        const ignored = await rpc.rpc<{ status?: string }>("payment_apply_provider_event_v1", {
          p_event_id: eventId, p_type: eventType, p_object_id: objectId, p_payload: { livemode: true },
        })
        return ignored.status === "success" ? { ok: true } : { ok: false, retryable: false, error: "Live event rejected." }
      }
      const provider = paymentProvider(env)
      if (provider.mode === "disabled") return { ok: false, retryable: false, error: "Payments are disabled." }
      try {
        const applyPayload: Record<string, unknown> = { livemode: false }
        if (eventType.startsWith("checkout.session.")) {
          if (!objectId) return { ok: false, retryable: false, error: "Checkout object is missing." }
          const session = await provider.retrieveCheckout(objectId)
          if (!session) return { ok: false, retryable: true, error: "Checkout session could not be retrieved." }
          applyPayload.mode = session.mode
          applyPayload.paymentStatus = session.paymentStatus
          applyPayload.paymentIntentId = session.paymentIntentId
          applyPayload.setupIntentId = session.setupIntentId
          applyPayload.stripeCustomerId = session.customerId
          if (session.mode === "payment" && session.paymentStatus === "paid" && session.paymentIntentId) {
            const intent = await provider.retrievePaymentIntent(session.paymentIntentId)
            if (intent?.status === "succeeded") {
              const result = await rpc.rpc<{ status?: string }>("payment_apply_provider_event_v1", {
                p_event_id: eventId,
                p_type: "payment_intent.succeeded",
                p_object_id: intent.id,
                p_payload: {
                  paymentIntentStatus: intent.status,
                  paymentStatus: "paid",
                  chargeId: intent.chargeId,
                  receiptUrl: intent.receiptUrl,
                  stripeCustomerId: intent.customerId,
                },
              })
              return result.status === "success" ? { ok: true } : { ok: false, retryable: true, error: "Provider event could not be applied." }
            }
          }
          if (session.mode === "setup" && session.setupIntentId) {
            const setup = await provider.retrieveSetupIntent(session.setupIntentId)
            if (setup?.status === "succeeded" && setup.usage === "off_session" && setup.paymentMethodId?.startsWith("pm_")) {
              const method = await provider.retrievePaymentMethod(setup.paymentMethodId)
              const result = await rpc.rpc<{ status?: string }>("payment_apply_provider_event_v1", {
                p_event_id: eventId,
                p_type: "setup_intent.succeeded",
                p_object_id: setup.id,
                p_payload: {
                  stripeCustomerId: setup.customerId,
                  paymentMethodId: method?.id,
                  usage: setup.usage,
                  brand: method?.brand,
                  last4: method?.last4,
                  expMonth: method?.expMonth,
                  expYear: method?.expYear,
                  fingerprint: method?.fingerprint,
                  customerId: setup.metadata.customerId,
                  serviceOrderId: setup.metadata.serviceOrderId,
                  providerOperationId: setup.metadata.providerOperationId,
                },
              })
              return result.status === "success" || result.status === "denied" ? { ok: true } : { ok: false, retryable: true, error: "Setup event could not be applied." }
            }
          }
          const correlated = await rpc.rpc<{ status?: string }>("payment_apply_provider_event_v1", {
            p_event_id: eventId, p_type: eventType, p_object_id: objectId, p_payload: applyPayload,
          })
          return correlated.status === "success" ? { ok: true } : { ok: false, retryable: true, error: "Checkout event could not be applied." }
        }
        if (eventType.startsWith("payment_intent.") && objectId) {
          const intent = await provider.retrievePaymentIntent(objectId)
          if (!intent) return { ok: false, retryable: true, error: "PaymentIntent could not be retrieved." }
          const type = intent.status === "succeeded" ? "payment_intent.succeeded"
            : intent.status === "requires_action" ? "payment_intent.requires_action"
            : eventType
          const result = await rpc.rpc<{ status?: string }>("payment_apply_provider_event_v1", {
            p_event_id: eventId,
            p_type: type,
            p_object_id: intent.id,
            p_payload: {
              paymentIntentStatus: intent.status,
              chargeId: intent.chargeId,
              receiptUrl: intent.receiptUrl,
              stripeCustomerId: intent.customerId,
              failureCode: intent.lastErrorCode,
            },
          })
          return result.status === "success" ? { ok: true } : { ok: false, retryable: true, error: "PaymentIntent event could not be applied." }
        }
        if (eventType.startsWith("setup_intent.") && objectId) {
          const setup = await provider.retrieveSetupIntent(objectId)
          if (!setup) return { ok: false, retryable: true, error: "SetupIntent could not be retrieved." }
          const method = setup.paymentMethodId?.startsWith("pm_") ? await provider.retrievePaymentMethod(setup.paymentMethodId) : null
          const result = await rpc.rpc<{ status?: string }>("payment_apply_provider_event_v1", {
            p_event_id: eventId,
            p_type: eventType,
            p_object_id: setup.id,
            p_payload: {
              stripeCustomerId: setup.customerId,
              paymentMethodId: method?.id,
              usage: setup.usage,
              brand: method?.brand,
              last4: method?.last4,
              expMonth: method?.expMonth,
              expYear: method?.expYear,
              fingerprint: method?.fingerprint,
              customerId: setup.metadata.customerId,
              serviceOrderId: setup.metadata.serviceOrderId,
              providerOperationId: setup.metadata.providerOperationId,
            },
          })
          return result.status === "success" || result.status === "denied" ? { ok: true } : { ok: false, retryable: true, error: "SetupIntent event could not be applied." }
        }
        const ignored = await rpc.rpc<{ status?: string }>("payment_apply_provider_event_v1", {
          p_event_id: eventId, p_type: eventType, p_object_id: objectId, p_payload: applyPayload,
        })
        return ignored.status === "success" ? { ok: true } : { ok: false, retryable: true, error: "Provider event could not be applied." }
      } catch (error) {
        if ((error as { name?: string }).name === "PaymentsDisabledError") {
          return { ok: false, retryable: false, error: "Payments are disabled." }
        }
        return { ok: false, retryable: true, error: "Provider retrieval failed." }
      }
    },
  }
}
