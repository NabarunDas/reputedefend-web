import type {
  CreateCheckoutInput,
  CreateOffSessionInput,
  CreateSetupInput,
  MappedProviderEvent,
  ProviderCheckout,
  ProviderCustomer,
  ProviderPaymentIntent,
} from "./model"

export class PaymentsDisabledError extends Error {
  constructor(message = "Payments are disabled.") {
    super(message)
    this.name = "PaymentsDisabledError"
  }
}

export interface PaymentProvider {
  readonly mode: "disabled" | "stripe_test" | "fake"
  createCustomer(input: { idempotencyKey: string; customerId: string }): Promise<ProviderCustomer>
  createPaymentCheckout(input: CreateCheckoutInput): Promise<ProviderCheckout>
  createSetupCheckout(input: CreateSetupInput): Promise<ProviderCheckout>
  createOffSessionPayment(input: CreateOffSessionInput): Promise<ProviderPaymentIntent>
  mapEvent(event: { id: string; type: string; data?: { object?: Record<string, unknown> } }): MappedProviderEvent
}

export function disabledPaymentProvider(): PaymentProvider {
  const deny = async () => {
    throw new PaymentsDisabledError()
  }
  return {
    mode: "disabled",
    createCustomer: deny,
    createPaymentCheckout: deny,
    createSetupCheckout: deny,
    createOffSessionPayment: deny,
    mapEvent() {
      throw new PaymentsDisabledError()
    },
  }
}
