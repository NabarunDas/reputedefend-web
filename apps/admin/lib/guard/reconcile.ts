import "server-only"
import { paymentProvider } from "../../../../lib/payments"
import type { JobHandler, JobHandlerInput, JobHandlerResult } from "../jobs/model"

const PAGE = 25

type PendingOperation = {
  id: string
  kind: string
  status: string
  idempotencyKey?: string
  providerObjectId?: string | null
}

type PendingRefund = {
  id: string
  stripeRefundId?: string | null
  providerOperationId?: string | null
  status: string
  amountMinor?: number
}

type UnresolvedDispute = {
  id: string
  stripeDisputeId?: string | null
  status?: string
  amountMinor?: number
}

type ReconciliationTarget = {
  id: string
  subscriptionId: string
  expectedStripeSubscriptionId?: string | null
  status: string
  pendingOperations?: PendingOperation[]
  pendingRefunds?: PendingRefund[]
  unresolvedDisputes?: UnresolvedDispute[]
}

export function reconcileGuardBillingHandler(env: Record<string, string | undefined> = process.env): JobHandler {
  return {
    jobType: "RECONCILE_GUARD_BILLING",
    async execute({ payload, rpc }: JobHandlerInput): Promise<JobHandlerResult> {
      if (!rpc) return { ok: false, retryable: false, error: "Reconciliation requires RPC." }
      const runId = typeof payload.runId === "string" ? payload.runId : ""
      if (!runId) return { ok: false, retryable: false, error: "Reconciliation payload is invalid." }
      const provider = paymentProvider(env)
      let after: string | null = null
      for (;;) {
        const page: { status?: string; targets?: ReconciliationTarget[] } = await rpc.rpc(
          "guard_list_reconciliation_targets_v1",
          { p_run: runId, p_after: after, p_limit: PAGE },
        )
        const targets: ReconciliationTarget[] = page.targets ?? []
        if (!targets.length) break
        for (const target of targets) {
          try {
            if (!target.expectedStripeSubscriptionId) {
              const followUpErrors = await reconcileFollowUps(provider, rpc, runId, target)
              await rpc.rpc("guard_apply_reconciliation_target_v1", {
                p_target: target.id,
                p_payload: { outcome: "SUCCEEDED", localOnly: true, livemode: false, followUpErrors },
              })
              continue
            }
            if (provider.mode === "disabled") {
              await rpc.rpc("guard_apply_reconciliation_target_v1", {
                p_target: target.id,
                p_payload: { outcome: "PROVIDER_DISABLED", lastError: "provider_disabled", livemode: false },
              })
              continue
            }
            const subscription = await provider.retrieveSubscription(target.expectedStripeSubscriptionId)
            if (!subscription) {
              await rpc.rpc("guard_apply_reconciliation_target_v1", {
                p_target: target.id,
                p_payload: { outcome: "RETRY", lastError: "subscription_not_retrieved" },
              })
              continue
            }
            const followUpErrors = await reconcileFollowUps(provider, rpc, runId, target)
            await rpc.rpc("guard_apply_reconciliation_target_v1", {
              p_target: target.id,
              p_payload: {
                outcome: "CHECKED",
                subscriptionId: subscription.id,
                stripeCustomerId: subscription.customerId,
                stripePriceId: subscription.priceId,
                subscriptionItemId: subscription.subscriptionItemId,
                quantity: subscription.quantity,
                providerStatus: subscription.status,
                cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
                periodStart: subscription.currentPeriodStart,
                periodEnd: subscription.currentPeriodEnd,
                scheduleId: subscription.scheduleId,
                defaultPaymentMethodId: subscription.defaultPaymentMethodId,
                paymentMethodUpdated: Boolean(subscription.defaultPaymentMethodId),
                guardSubscriptionId: target.subscriptionId,
                livemode: false,
                followUpErrors,
              },
            })
          } catch (error) {
            if ((error as { name?: string }).name === "PaymentsDisabledError") {
              await rpc.rpc("guard_apply_reconciliation_target_v1", {
                p_target: target.id,
                p_payload: { outcome: "PROVIDER_DISABLED", lastError: "provider_disabled" },
              })
              continue
            }
            await rpc.rpc("guard_apply_reconciliation_target_v1", {
              p_target: target.id,
              p_payload: { outcome: "RETRY", lastError: "provider_retrieval_failed" },
            })
          }
        }
        after = targets[targets.length - 1]?.id ?? null
        if (targets.length < PAGE) break
      }
      const result = await rpc.rpc<{ status?: string; runStatus?: string }>("guard_reconcile_billing_v1", {
        p_run: runId,
        p_payload: { livemode: false },
      })
      if (result.status === "success") return { ok: true }
      if (result.status === "pending") return { ok: false, retryable: true, error: "Guard billing targets remain unresolved." }
      return { ok: true }
    },
  }
}

async function reconcileFollowUps(
  provider: ReturnType<typeof paymentProvider>,
  rpc: NonNullable<JobHandlerInput["rpc"]>,
  runId: string,
  target: ReconciliationTarget,
) {
  const errors: Array<Record<string, unknown>> = []
  for (const refund of target.pendingRefunds ?? []) {
    if (!refund.stripeRefundId) continue
    try {
      const retrieved = await provider.retrieveRefund(refund.stripeRefundId)
      if (!retrieved) {
        errors.push({ code: "REFUND_NOT_RETRIEVED", refundId: refund.id, stripeRefundId: refund.stripeRefundId })
        continue
      }
      const applied = await rpc.rpc<{ status?: string; reason?: string }>("guard_apply_subscription_event_v1", {
        p_event_id: `reconcile-refund:${runId}:${refund.id}`,
        p_type: "refund.updated",
        p_object_id: retrieved.id,
        p_payload: {
          refundStatus: retrieved.status,
          ...(typeof retrieved.amountMinor === "number" ? { amountMinor: retrieved.amountMinor } : {}),
          ...(retrieved.currency ? { currency: retrieved.currency } : {}),
          paymentIntentId: retrieved.paymentIntentId,
          chargeId: retrieved.chargeId,
          failureCode: retrieved.failureReason,
          guardRefundId: refund.id,
          providerOperationId: refund.providerOperationId,
          livemode: false,
        },
      })
      if (applied.status !== "success") {
        errors.push({ code: "REFUND_APPLY_FAILED", refundId: refund.id, reason: applied.reason || applied.status })
      }
    } catch (error) {
      errors.push({ code: "REFUND_RETRIEVAL_FAILED", refundId: refund.id, error: (error as Error).name })
    }
  }
  for (const dispute of target.unresolvedDisputes ?? []) {
    if (!dispute.stripeDisputeId) continue
    try {
      const retrieved = await provider.retrieveDispute(dispute.stripeDisputeId)
      if (!retrieved) {
        errors.push({ code: "DISPUTE_NOT_RETRIEVED", disputeId: dispute.id, stripeDisputeId: dispute.stripeDisputeId })
        continue
      }
      const applied = await rpc.rpc<{ status?: string; reason?: string }>("guard_apply_subscription_event_v1", {
        p_event_id: `reconcile-dispute:${runId}:${dispute.id}`,
        p_type: "charge.dispute.updated",
        p_object_id: retrieved.id,
        p_payload: {
          disputeStatus: retrieved.status,
          ...(typeof retrieved.amountMinor === "number" ? { amountMinor: retrieved.amountMinor } : {}),
          ...(retrieved.currency ? { currency: retrieved.currency } : {}),
          chargeId: retrieved.chargeId,
          outcome: retrieved.reason,
          livemode: false,
        },
      })
      if (applied.status !== "success") {
        errors.push({ code: "DISPUTE_APPLY_FAILED", disputeId: dispute.id, reason: applied.reason || applied.status })
      }
    } catch (error) {
      errors.push({ code: "DISPUTE_RETRIEVAL_FAILED", disputeId: dispute.id, error: (error as Error).name })
    }
  }
  return errors
}
