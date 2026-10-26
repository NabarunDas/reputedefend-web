import { emailSyncIdempotencyKey, normalisedCheckoutEmail } from "./checkout-presentation"
import { declaredLivemodeArgument, guardExternalPayment } from "./lane-agreement"
import { paymentProvider, paymentProviderWithLane } from "./index"
import { PaymentsDisabledError } from "./provider"

type Rpc = (name: string, args?: Record<string, unknown>) => Promise<unknown>

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

/**
 * Creates the mapped Stripe customer, or updates the email on that same
 * customer. The address comes from the verified order lookup. It is not
 * written into PaymentIntent or invoice metadata, and a second customer is
 * not created when a map already exists.
 */
export async function ensureMappedStripeCustomer(input: {
  rpc: Rpc
  customerId: string
  verifiedEmail: string
}): Promise<string> {
  const email = normalisedCheckoutEmail(input.verifiedEmail)
  if (!email) throw new PaymentsDisabledError("Stripe customer email was rejected.")
  const lane = await guardExternalPayment(input.rpc)
  const provider = lane ? paymentProviderWithLane(lane) : paymentProvider()
  const prepared = asRecord(await input.rpc("payment_prepare_customer_v1", {
    p_customer: input.customerId,
    ...declaredLivemodeArgument(),
  }))
  const existing = typeof prepared?.stripeCustomerId === "string" ? prepared.stripeCustomerId : ""
  if (existing) {
    await provider.syncCustomerEmail({
      idempotencyKey: emailSyncIdempotencyKey(input.customerId, email),
      stripeCustomerId: existing,
      customerId: input.customerId,
      email,
    })
    return existing
  }
  const created = await provider.createCustomer({
    idempotencyKey: typeof prepared?.idempotencyKey === "string" ? prepared.idempotencyKey : "",
    customerId: input.customerId,
    email,
  })
  const mapped = asRecord(await input.rpc("payment_record_customer_map_v1", {
    p_operation: prepared?.providerOperationId,
    p_stripe_customer_id: created.id,
  }))
  if (mapped?.status !== "success" || typeof mapped.stripeCustomerId !== "string" || !mapped.stripeCustomerId) {
    throw new PaymentsDisabledError("Stripe customer mapping was rejected.")
  }
  return mapped.stripeCustomerId
}
