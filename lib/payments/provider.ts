import type {
  CancelPaymentResult,
  CancelSubscriptionResult,
  CreateCheckoutInput,
  CreateHostedInvoiceInput,
  CreateOffSessionInput,
  CreateRecurringPriceInput,
  CreateSetupInput,
  CreateSubscriptionCheckoutInput,
  MappedProviderEvent,
  ProviderCheckout,
  ProviderCustomer,
  ProviderInvoice,
  ProviderPaymentIntent,
  ProviderRecurringPrice,
  ProviderSchedule,
  RetrievedCheckout,
  RetrievedDispute,
  RetrievedInvoice,
  RetrievedPaymentIntent,
  RetrievedRefund,
  RetrievedSetupIntent,
  RetrievedSubscription,
  SafePaymentMethod,
} from "./model"

export class PaymentsDisabledError extends Error {
  constructor(message = "Payments are disabled.") {
    super(message)
    this.name = "PaymentsDisabledError"
  }
}

export class LiveStripeKeyError extends PaymentsDisabledError {
  constructor() {
    super("Live Stripe secrets are forbidden in stripe_test mode.")
    this.name = "LiveStripeKeyError"
  }
}

export interface PaymentProvider {
  readonly mode: "disabled" | "stripe_test" | "fake"
  createCustomer(input: { idempotencyKey: string; customerId: string }): Promise<ProviderCustomer>
  createPaymentCheckout(input: CreateCheckoutInput): Promise<ProviderCheckout>
  createSetupCheckout(input: CreateSetupInput): Promise<ProviderCheckout>
  createOffSessionPayment(input: CreateOffSessionInput): Promise<ProviderPaymentIntent>
  retrieveCheckout(id: string): Promise<RetrievedCheckout | null>
  retrievePaymentIntent(id: string): Promise<RetrievedPaymentIntent | null>
  retrieveSetupIntent(id: string): Promise<RetrievedSetupIntent | null>
  retrievePaymentMethod(id: string): Promise<SafePaymentMethod | null>
  retrieveInvoice(id: string): Promise<RetrievedInvoice | null>
  createHostedInvoice(input: CreateHostedInvoiceInput): Promise<ProviderInvoice>
  cancelPaymentIntent(input: { id: string; idempotencyKey: string }): Promise<CancelPaymentResult>
  createRecurringPrice(input: CreateRecurringPriceInput): Promise<ProviderRecurringPrice>
  createSubscriptionCheckout(input: CreateSubscriptionCheckoutInput): Promise<ProviderCheckout>
  retrieveSubscription(id: string): Promise<RetrievedSubscription | null>
  retrieveRecurringInvoice(id: string): Promise<RetrievedInvoice | null>
  setCancelAtPeriodEnd(input: { id: string; idempotencyKey: string; cancel: boolean }): Promise<CancelSubscriptionResult>
  cancelSubscriptionImmediate(input: { id: string; idempotencyKey: string }): Promise<CancelSubscriptionResult>
  createSubscriptionSchedule(input: {
    idempotencyKey: string
    subscriptionId: string
    subscriptionItemId: string
    currentPriceId: string
    nextPriceId: string
    periodEnd: number
  }): Promise<ProviderSchedule>
  createRefund(input: { idempotencyKey: string; paymentIntentId: string; amountMinor: number }): Promise<RetrievedRefund>
  retrieveRefund(id: string): Promise<RetrievedRefund | null>
  retrieveDispute(id: string): Promise<RetrievedDispute | null>
  mapEvent(event: { id: string; type: string; data?: { object?: Record<string, unknown> } }): MappedProviderEvent
}

const deny = async () => {
  throw new PaymentsDisabledError()
}

export function disabledPaymentProvider(): PaymentProvider {
  return {
    mode: "disabled",
    createCustomer: deny,
    createPaymentCheckout: deny,
    createSetupCheckout: deny,
    createOffSessionPayment: deny,
    retrieveCheckout: deny,
    retrievePaymentIntent: deny,
    retrieveSetupIntent: deny,
    retrievePaymentMethod: deny,
    retrieveInvoice: deny,
    createHostedInvoice: deny,
    cancelPaymentIntent: deny,
    createRecurringPrice: deny,
    createSubscriptionCheckout: deny,
    retrieveSubscription: deny,
    retrieveRecurringInvoice: deny,
    setCancelAtPeriodEnd: deny,
    cancelSubscriptionImmediate: deny,
    createSubscriptionSchedule: deny,
    createRefund: deny,
    retrieveRefund: deny,
    retrieveDispute: deny,
    mapEvent() {
      throw new PaymentsDisabledError()
    },
  }
}
