import "server-only"
import { paymentProvider } from "../../../../lib/payments"
import type { JobHandler, JobHandlerInput, JobHandlerResult } from "../jobs/model"

export function reconcileGuardBillingHandler(env: Record<string, string | undefined> = process.env): JobHandler {
  return {
    jobType: "RECONCILE_GUARD_BILLING",
    async execute({ payload, rpc }: JobHandlerInput): Promise<JobHandlerResult> {
      if (!rpc) return { ok: false, retryable: false, error: "Reconciliation requires RPC." }
      const runId = typeof payload.runId === "string" ? payload.runId : ""
      if (!runId) return { ok: false, retryable: false, error: "Reconciliation payload is invalid." }
      const provider = paymentProvider(env)
      const evidence: Record<string, unknown> = { livemode: false }
      if (provider.mode !== "disabled" && typeof payload.stripeSubscriptionId === "string") {
        try {
          const subscription = await provider.retrieveSubscription(payload.stripeSubscriptionId)
          if (subscription) {
            evidence.stripePriceId = subscription.priceId
            evidence.quantity = subscription.quantity
            evidence.providerStatus = subscription.status
            evidence.cancelAtPeriodEnd = subscription.cancelAtPeriodEnd
            evidence.guardSubscriptionId = payload.guardSubscriptionId
          }
        } catch (error) {
          if ((error as { name?: string }).name === "PaymentsDisabledError") {
            return { ok: false, retryable: false, error: "Payments are disabled." }
          }
        }
      }
      const result = await rpc.rpc<{ status?: string }>("guard_reconcile_billing_v1", {
        p_run: runId,
        p_payload: evidence,
      })
      if (result.status === "success") return { ok: true }
      return { ok: false, retryable: true, error: "Guard billing reconciliation did not complete." }
    },
  }
}
