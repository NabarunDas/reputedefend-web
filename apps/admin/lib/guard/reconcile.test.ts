import { beforeEach, describe, expect, it, vi } from "vitest"
import { createFakePaymentProvider } from "../../../../lib/payments/fake"

const fake = createFakePaymentProvider()
vi.mock("../../../../lib/payments", () => ({
  paymentProvider: (env: Record<string, string | undefined> = {}) => {
    if (env.PAYMENTS_PROVIDER_MODE === "fake") return fake
    return { mode: "disabled" as const, retrieveSubscription: async () => { throw Object.assign(new Error("disabled"), { name: "PaymentsDisabledError" }) } }
  },
}))

import type { JobRpc } from "../jobs/model"
import { reconcileGuardBillingHandler } from "./reconcile"

const runId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"

function jobRpc(rpc: ReturnType<typeof vi.fn>): JobRpc {
  return { rpc } as unknown as JobRpc
}

beforeEach(() => {
  fake.objects.clear()
})

describe("guard billing reconciliation handler", () => {
  it("retrieves Stripe for every provider-backed target and isolates a failure", async () => {
    fake.objects.set("sub_ok_b", {
      id: "sub_ok_b",
      status: "active",
      customerId: "cus_b",
      priceId: "price_test",
      subscriptionItemId: "si_b",
      quantity: 1,
      cancelAtPeriodEnd: false,
    })
    const rpc = vi.fn(async (name: string, args?: Record<string, unknown>) => {
      if (name === "guard_list_reconciliation_targets_v1") {
        if (args?.p_after) return { status: "success", targets: [] }
        return {
          status: "success",
          targets: [
            { id: "11111111-1111-4111-8111-111111111111", subscriptionId: "22222222-2222-4222-8222-222222222222", expectedStripeSubscriptionId: "sub_missing_a", status: "PENDING" },
            { id: "33333333-3333-4333-8333-333333333333", subscriptionId: "44444444-4444-4444-8444-444444444444", expectedStripeSubscriptionId: "sub_ok_b", status: "PENDING" },
          ],
        }
      }
      if (name === "guard_reconcile_billing_v1") return { status: "pending", runStatus: "STARTED" }
      return { status: "success" }
    })
    const result = await reconcileGuardBillingHandler({ PAYMENTS_PROVIDER_MODE: "fake" }).execute({
      idempotencyKey: "reconcile-1",
      payload: { runId, serviceDate: "2026-09-30" },
      rpc: jobRpc(rpc),
    })
    expect(result).toEqual({ ok: false, retryable: true, error: "Guard billing targets remain unresolved." })
    const applied = rpc.mock.calls.filter(call => call[0] === "guard_apply_reconciliation_target_v1")
    expect(applied).toHaveLength(2)
    expect(applied[0][1]).toMatchObject({ p_payload: { outcome: "RETRY", lastError: "subscription_not_retrieved" } })
    expect(applied[1][1]).toMatchObject({
      p_payload: { outcome: "CHECKED", subscriptionId: "sub_ok_b", quantity: 1 },
    })
  })

  it("does not claim provider success when Stripe is disabled and targets are provider-backed", async () => {
    const rpc = vi.fn(async (name: string, args?: Record<string, unknown>) => {
      if (name === "guard_list_reconciliation_targets_v1") {
        if (args?.p_after) return { status: "success", targets: [] }
        return {
          status: "success",
          targets: [{
            id: "11111111-1111-4111-8111-111111111111",
            subscriptionId: "22222222-2222-4222-8222-222222222222",
            expectedStripeSubscriptionId: "sub_live",
            status: "PENDING",
          }],
        }
      }
      if (name === "guard_reconcile_billing_v1") return { status: "failed", runStatus: "FAILED" }
      return { status: "success" }
    })
    const result = await reconcileGuardBillingHandler({}).execute({
      idempotencyKey: "reconcile-disabled",
      payload: { runId },
      rpc: jobRpc(rpc),
    })
    expect(result).toEqual({ ok: true })
    expect(rpc).toHaveBeenCalledWith("guard_apply_reconciliation_target_v1", expect.objectContaining({
      p_payload: expect.objectContaining({ outcome: "PROVIDER_DISABLED" }),
    }))
  })

  it("can complete a run with no provider-backed targets", async () => {
    const rpc = vi.fn(async (name: string) => {
      if (name === "guard_list_reconciliation_targets_v1") return { status: "success", targets: [] }
      if (name === "guard_reconcile_billing_v1") return { status: "success", runStatus: "COMPLETED", expectedCount: 0 }
      return { status: "success" }
    })
    const result = await reconcileGuardBillingHandler({}).execute({
      idempotencyKey: "reconcile-empty",
      payload: { runId },
      rpc: jobRpc(rpc),
    })
    expect(result).toEqual({ ok: true })
    expect(rpc).toHaveBeenCalledWith("guard_reconcile_billing_v1", expect.objectContaining({ p_run: runId }))
  })

  it("continues other follow-ups when one refund retrieval fails", async () => {
    fake.objects.set("sub_ok_b", {
      id: "sub_ok_b",
      status: "active",
      customerId: "cus_b",
      priceId: "price_test",
      subscriptionItemId: "si_b",
      quantity: 1,
      cancelAtPeriodEnd: false,
    })
    fake.objects.set("re_ok", { id: "re_ok", status: "succeeded", amountMinor: 100, currency: "gbp" })
    const rpc = vi.fn(async (name: string, args?: Record<string, unknown>) => {
      if (name === "guard_list_reconciliation_targets_v1") {
        if (args?.p_after) return { status: "success", targets: [] }
        return {
          status: "success",
          targets: [{
            id: "11111111-1111-4111-8111-111111111111",
            subscriptionId: "22222222-2222-4222-8222-222222222222",
            expectedStripeSubscriptionId: "sub_ok_b",
            status: "PENDING",
            pendingRefunds: [
              { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", stripeRefundId: "re_missing", status: "PENDING" },
              { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", stripeRefundId: "re_ok", status: "PENDING" },
            ],
            unresolvedDisputes: [],
          }],
        }
      }
      if (name === "guard_reconcile_billing_v1") return { status: "success", runStatus: "COMPLETED" }
      return { status: "success" }
    })
    const result = await reconcileGuardBillingHandler({ PAYMENTS_PROVIDER_MODE: "fake" }).execute({
      idempotencyKey: "reconcile-followups",
      payload: { runId },
      rpc: jobRpc(rpc),
    })
    expect(result).toEqual({ ok: true })
    const applied = rpc.mock.calls.filter(call => call[0] === "guard_apply_subscription_event_v1")
    expect(applied).toHaveLength(1)
    expect(applied[0][1]).toMatchObject({ p_object_id: "re_ok" })
    const targetApply = rpc.mock.calls.filter(call => call[0] === "guard_apply_reconciliation_target_v1")
    expect(targetApply[0][1]).toMatchObject({
      p_payload: expect.objectContaining({
        followUpErrors: [expect.objectContaining({ code: "REFUND_NOT_RETRIEVED" })],
      }),
    })
  })

  it("retries the worker job when unresolved targets remain", async () => {
    const rpc = vi.fn(async (name: string, args?: Record<string, unknown>) => {
      if (name === "guard_list_reconciliation_targets_v1") {
        if (args?.p_after) return { status: "success", targets: [] }
        return {
          status: "success",
          targets: [{
            id: "11111111-1111-4111-8111-111111111111",
            subscriptionId: "22222222-2222-4222-8222-222222222222",
            expectedStripeSubscriptionId: "sub_missing",
            status: "PENDING",
          }],
        }
      }
      if (name === "guard_reconcile_billing_v1") return { status: "pending", runStatus: "STARTED" }
      return { status: "success" }
    })
    const result = await reconcileGuardBillingHandler({ PAYMENTS_PROVIDER_MODE: "fake" }).execute({
      idempotencyKey: "reconcile-retry",
      payload: { runId },
      rpc: jobRpc(rpc),
    })
    expect(result).toEqual({ ok: false, retryable: true, error: "Guard billing targets remain unresolved." })
  })
})
