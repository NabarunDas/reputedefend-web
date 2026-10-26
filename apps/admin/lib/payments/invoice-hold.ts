import type { PaymentProvider } from "../../../../lib/payments/provider"

export type DisputeHold = "none" | "void_required" | "void_confirmed" | "already_paid" | "void_unconfirmed"

/**
 * Asks the payment provider to void an issued hosted invoice after a dispute
 * is already recorded. The local invoice stays unchanged until the provider
 * confirms void. A provider error or a disabled provider is a finance exception:
 * the customer link stays blocked, and Stripe collection is not described as stopped.
 */
export async function reconcileDisputedInvoice(input: {
  provider: Pick<PaymentProvider, "voidHostedInvoice">
  hold: string
  providerInvoiceId: string | null
  idempotencyKey: string
  record: (
    state: "VOID_CONFIRMED" | "ALREADY_PAID" | "VOID_UNCONFIRMED",
    providerStatus: string | null,
  ) => Promise<{ hold?: string } | void>
}): Promise<{ hold: DisputeHold; stripeCollectionStopped: boolean }> {
  if (input.hold === "none") return { hold: "none", stripeCollectionStopped: false }
  if (input.hold === "already_paid") return { hold: "already_paid", stripeCollectionStopped: false }
  if (input.hold === "void_confirmed") return { hold: "void_confirmed", stripeCollectionStopped: true }
  if (input.hold !== "void_required" && input.hold !== "void_unconfirmed") {
    return { hold: "void_unconfirmed", stripeCollectionStopped: false }
  }
  if (!input.providerInvoiceId) {
    return outcome(await input.record("VOID_UNCONFIRMED", null), "void_unconfirmed")
  }
  let result: Awaited<ReturnType<PaymentProvider["voidHostedInvoice"]>>
  try {
    result = await input.provider.voidHostedInvoice({
      id: input.providerInvoiceId,
      idempotencyKey: input.idempotencyKey,
    })
  } catch {
    return outcome(await input.record("VOID_UNCONFIRMED", null), "void_unconfirmed")
  }
  if (result.alreadyPaid) {
    return outcome(await input.record("ALREADY_PAID", result.status || "paid"), "already_paid")
  }
  if (result.voided && result.status === "void") {
    return outcome(await input.record("VOID_CONFIRMED", "void"), "void_confirmed")
  }
  return outcome(await input.record("VOID_UNCONFIRMED", result.status || null), "void_unconfirmed")
}

function outcome(
  recorded: { hold?: string } | void,
  fallback: DisputeHold,
): { hold: DisputeHold; stripeCollectionStopped: boolean } {
  const reported = recorded && typeof recorded.hold === "string" ? recorded.hold : fallback
  const hold: DisputeHold = reported === "none"
    || reported === "void_required"
    || reported === "void_confirmed"
    || reported === "already_paid"
    || reported === "void_unconfirmed"
    ? reported
    : fallback
  return { hold, stripeCollectionStopped: hold === "void_confirmed" }
}
