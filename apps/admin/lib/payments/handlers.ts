import "server-only"
import { paymentProvider } from "../../../../lib/payments"
import type { JobHandler, JobHandlerInput, JobHandlerResult } from "../jobs/model"

function applyResult(result: { status?: string }): JobHandlerResult {
  if (result.status === "unmatched") return { ok: false, retryable: true, error: "correlation_pending" }
  if (result.status === "success" || result.status === "denied") return { ok: true }
  return { ok: false, retryable: true, error: "Provider event could not be applied." }
}

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
          p_payload: {
            status: intent.status,
            paymentIntentStatus: intent.status,
            amountMinor: intent.amountMinor,
            currency: "gbp",
            providerOperationId: prepared.providerOperationId,
            customerId: prepared.customerId,
            serviceOrderId: prepared.serviceOrderId,
            obligationId,
          },
        })
        return { ok: true }
      }
      if (intent.classification === "declined") {
        await rpc.rpc("payment_apply_provider_event_v1", {
          p_event_id: `collect:${prepared.idempotencyKey}:${intent.id || "declined"}:failed`,
          p_type: "payment_intent.payment_failed",
          p_object_id: intent.id || prepared.providerOperationId,
          p_payload: {
            status: intent.status,
            failureCategory: intent.failureCategory,
            failureCode: intent.failureCode,
            providerOperationId: prepared.providerOperationId,
          },
        })
        return { ok: false, retryable: false, error: intent.failureCode || "Payment declined." }
      }
      await rpc.rpc("payment_apply_provider_event_v1", {
        p_event_id: `collect:${prepared.idempotencyKey}:${intent.id}`,
        p_type: "payment_intent.succeeded",
        p_object_id: intent.id,
        p_payload: {
          status: intent.status,
          paymentIntentStatus: "succeeded",
          amountMinor: intent.amountMinor,
          currency: "gbp",
          stripeCustomerId: prepared.stripeCustomerId,
          providerOperationId: prepared.providerOperationId,
          customerId: prepared.customerId,
          serviceOrderId: prepared.serviceOrderId,
          obligationId,
        },
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
          applyPayload.customerId = session.metadata.customerId
          applyPayload.serviceOrderId = session.metadata.serviceOrderId
          applyPayload.obligationId = session.metadata.obligationId
          applyPayload.attemptId = session.metadata.attemptId
          applyPayload.providerOperationId = session.metadata.providerOperationId
          applyPayload.orderRef = session.metadata.orderRef
          if (session.mode === "subscription" || session.metadata.guardSubscriptionId) {
            const guard = await rpc.rpc<{ status?: string }>("guard_apply_subscription_event_v1", {
              p_event_id: eventId, p_type: eventType, p_object_id: objectId,
              p_payload: {
                ...applyPayload,
                guardSubscriptionId: session.metadata.guardSubscriptionId,
                guardCoverageId: session.metadata.guardCoverageId,
              },
            })
            return applyResult(guard)
          }
          const correlated = await rpc.rpc<{ status?: string }>("payment_apply_provider_event_v1", {
            p_event_id: eventId, p_type: eventType, p_object_id: objectId, p_payload: applyPayload,
          })
          return applyResult(correlated)
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
              amountMinor: intent.amountMinor,
              currency: intent.currency,
              customerId: intent.metadata.customerId,
              serviceOrderId: intent.metadata.serviceOrderId,
              obligationId: intent.metadata.obligationId,
              attemptId: intent.metadata.attemptId,
              providerOperationId: intent.metadata.providerOperationId,
              orderRef: intent.metadata.orderRef,
            },
          })
          return applyResult(result)
        }
        if (eventType.startsWith("setup_intent.") && objectId) {
          const setup = await provider.retrieveSetupIntent(objectId)
          if (!setup) return { ok: false, retryable: true, error: "SetupIntent could not be retrieved." }
          const method = setup.paymentMethodId?.startsWith("pm_") ? await provider.retrievePaymentMethod(setup.paymentMethodId) : null
          if (setup.metadata.guardSubscriptionId) {
            const guard = await rpc.rpc<{ status?: string }>("guard_apply_subscription_event_v1", {
              p_event_id: eventId, p_type: eventType, p_object_id: setup.id,
              p_payload: {
                stripeCustomerId: setup.customerId,
                paymentMethodId: method?.id,
                guardSubscriptionId: setup.metadata.guardSubscriptionId,
                customerId: setup.metadata.customerId,
                serviceOrderId: setup.metadata.serviceOrderId,
                providerOperationId: setup.metadata.providerOperationId,
                livemode: false,
              },
            })
            if (guard.status !== "success") return applyResult(guard)
            if (eventType === "setup_intent.succeeded" && setup.status === "succeeded" && method?.id && setup.customerId) {
              const prepared = await rpc.rpc<{
                status?: string
                providerOperationId?: string
                idempotencyKey?: string
                stripeSubscriptionId?: string
              }>("guard_apply_recovery_setup_v1", {
                p_setup_intent: setup.id,
                p_customer: setup.customerId,
                p_payment_method: method.id,
                p_guard_subscription: setup.metadata.guardSubscriptionId,
                p_operation: setup.metadata.providerOperationId || null,
              })
              if (prepared.status === "success" && prepared.stripeSubscriptionId && prepared.providerOperationId) {
                const updated = await provider.updateSubscriptionPaymentMethod({
                  id: prepared.stripeSubscriptionId,
                  idempotencyKey: prepared.idempotencyKey || eventId,
                  paymentMethodId: method.id,
                })
                await rpc.rpc("guard_confirm_payment_method_v1", {
                  p_operation: prepared.providerOperationId, p_object_id: updated.id,
                })
              }
            }
            return applyResult(guard)
          }
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
          return applyResult(result)
        }
        if (eventType.startsWith("customer.subscription.") && objectId) {
          const subscription = await provider.retrieveSubscription(objectId)
          if (!subscription) return { ok: false, retryable: true, error: "Subscription could not be retrieved." }
          const result = await rpc.rpc<{ status?: string }>("guard_apply_subscription_event_v1", {
            p_event_id: eventId,
            p_type: eventType,
            p_object_id: subscription.id,
            p_payload: {
              subscriptionId: subscription.id,
              providerStatus: subscription.status,
              stripeCustomerId: subscription.customerId,
              priceId: subscription.priceId,
              subscriptionItemId: subscription.subscriptionItemId,
              quantity: subscription.quantity,
              cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
              periodStart: subscription.currentPeriodStart,
              periodEnd: subscription.currentPeriodEnd,
              scheduleId: subscription.scheduleId,
              guardSubscriptionId: subscription.metadata.guardSubscriptionId,
              customerId: subscription.metadata.customerId,
              serviceOrderId: subscription.metadata.serviceOrderId,
              livemode: false,
            },
          })
          return applyResult(result)
        }
        if ((eventType.startsWith("refund.") || eventType === "charge.refunded") && objectId) {
          if (eventType === "charge.refunded") {
            const result = await rpc.rpc<{ status?: string }>("guard_apply_subscription_event_v1", {
              p_event_id: eventId, p_type: eventType, p_object_id: objectId,
              p_payload: { chargeId: objectId, livemode: false, supplemental: true },
            })
            return applyResult(result)
          }
          const refund = await provider.retrieveRefund(objectId)
          if (!refund) return { ok: false, retryable: true, error: "Refund could not be retrieved." }
          const result = await rpc.rpc<{ status?: string }>("guard_apply_subscription_event_v1", {
            p_event_id: eventId, p_type: eventType, p_object_id: refund.id,
            p_payload: {
              refundStatus: refund.status, amountMinor: refund.amountMinor, currency: refund.currency,
              failureCode: refund.failureReason, paymentIntentId: refund.paymentIntentId,
              chargeId: refund.chargeId, livemode: false,
            },
          })
          return applyResult(result)
        }
        if (eventType.startsWith("charge.dispute.") && objectId) {
          const dispute = await provider.retrieveDispute(objectId)
          if (!dispute) return { ok: false, retryable: true, error: "Dispute could not be retrieved." }
          const result = await rpc.rpc<{ status?: string }>("guard_apply_subscription_event_v1", {
            p_event_id: eventId, p_type: eventType, p_object_id: dispute.id,
            p_payload: {
              disputeStatus: dispute.status, amountMinor: dispute.amountMinor, currency: dispute.currency,
              chargeId: dispute.chargeId, outcome: dispute.reason, livemode: false,
            },
          })
          return applyResult(result)
        }
        if (eventType.startsWith("invoice.") && objectId) {
          let recurring
          try {
            recurring = await provider.retrieveRecurringInvoice(objectId)
          } catch (error) {
            if ((error as { name?: string }).name === "PaymentsDisabledError") throw error
            return { ok: false, retryable: true, error: "Recurring invoice retrieval failed." }
          }
          const parentMeta = recurring?.subscriptionMetadata ?? {}
          let guardSubscriptionId = recurring?.metadata.guardSubscriptionId || parentMeta.guardSubscriptionId
          let customerId = recurring?.metadata.customerId || parentMeta.customerId
          let serviceOrderId = recurring?.metadata.serviceOrderId || parentMeta.serviceOrderId
          let providerOperationId = recurring?.metadata.providerOperationId || parentMeta.providerOperationId
          if (recurring?.subscriptionId && !guardSubscriptionId) {
            const subscription = await provider.retrieveSubscription(recurring.subscriptionId)
            if (!subscription) return { ok: false, retryable: true, error: "Subscription could not be retrieved." }
            guardSubscriptionId = subscription.metadata.guardSubscriptionId
            customerId = customerId || subscription.metadata.customerId
            serviceOrderId = serviceOrderId || subscription.metadata.serviceOrderId
            providerOperationId = providerOperationId || subscription.metadata.providerOperationId
          }
          if (recurring && (recurring.subscriptionId || guardSubscriptionId)) {
            const type = recurring.status === "paid" || eventType === "invoice.paid" ? "invoice.paid" : eventType
            const result = await rpc.rpc<{ status?: string }>("guard_apply_subscription_event_v1", {
              p_event_id: eventId,
              p_type: type,
              p_object_id: recurring.id,
              p_payload: {
                stripeCustomerId: recurring.customerId,
                amountPaidMinor: recurring.amountPaidMinor,
                amountMinor: recurring.amountDueMinor,
                currency: recurring.currency || undefined,
                subscriptionId: recurring.subscriptionId,
                subscriptionItemId: recurring.subscriptionItemId,
                priceId: recurring.priceId,
                quantity: recurring.quantity,
                periodStart: recurring.periodStart,
                periodEnd: recurring.periodEnd,
                paymentIntentId: recurring.paymentIntentId,
                chargeId: recurring.chargeId,
                guardSubscriptionId,
                customerId,
                serviceOrderId,
                providerOperationId,
                continuationId: parentMeta.continuationId || recurring.metadata.continuationId,
                priceVersionId: parentMeta.priceVersionId || recurring.metadata.priceVersionId,
                livemode: false,
              },
            })
            return applyResult(result)
          }
          const invoice = await provider.retrieveInvoice(objectId)
          if (!invoice) return { ok: false, retryable: true, error: "Invoice could not be retrieved." }
          const type = invoice.status === "paid" || eventType === "invoice.paid" ? "invoice.paid" : eventType
          const result = await rpc.rpc<{ status?: string }>("payment_apply_provider_event_v1", {
            p_event_id: eventId,
            p_type: type,
            p_object_id: invoice.id,
            p_payload: {
              stripeCustomerId: invoice.customerId,
              amountPaidMinor: invoice.amountPaidMinor,
              amountMinor: invoice.amountDueMinor,
              currency: invoice.currency,
              hostedInvoiceUrl: invoice.hostedInvoiceUrl,
              customerId: invoice.metadata.customerId,
              serviceOrderId: invoice.metadata.serviceOrderId,
              obligationId: invoice.metadata.obligationId,
              providerOperationId: invoice.metadata.providerOperationId,
              orderRef: invoice.metadata.orderRef,
            },
          })
          return applyResult(result)
        }
        const ignored = await rpc.rpc<{ status?: string }>("payment_apply_provider_event_v1", {
          p_event_id: eventId, p_type: eventType, p_object_id: objectId, p_payload: applyPayload,
        })
        return applyResult(ignored)
      } catch (error) {
        if ((error as { name?: string }).name === "PaymentsDisabledError") {
          return { ok: false, retryable: false, error: "Payments are disabled." }
        }
        return { ok: false, retryable: true, error: "Provider retrieval failed." }
      }
    },
  }
}
