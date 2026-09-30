import "server-only"
import { paymentProvider } from "../../../../lib/payments"
import type { JobHandler, JobHandlerInput, JobHandlerResult } from "../jobs/model"

const PAGE = 25

type ReconciliationTarget = {
  id: string
  subscriptionId: string
  expectedStripeSubscriptionId?: string | null
  status: string
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
              await rpc.rpc("guard_apply_reconciliation_target_v1", {
                p_target: target.id,
                p_payload: { outcome: "SUCCEEDED", localOnly: true, livemode: false },
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
                guardSubscriptionId: target.subscriptionId,
                livemode: false,
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
      return { ok: false, retryable: true, error: "Guard billing reconciliation did not complete." }
    },
  }
}
