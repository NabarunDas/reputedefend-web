import type {
  CancelPaymentResult,
  CreateCheckoutInput,
  CreateOffSessionInput,
  CreateSetupInput,
  MappedProviderEvent,
  ProviderCheckout,
  ProviderCustomer,
  ProviderPaymentIntent,
  RetrievedCheckout,
  RetrievedPaymentIntent,
  RetrievedSetupIntent,
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
  cancelPaymentIntent(input: { id: string; idempotencyKey: string }): Promise<CancelPaymentResult>
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
    cancelPaymentIntent: deny,
    mapEvent() {
      throw new PaymentsDisabledError()
    },
  }
}
