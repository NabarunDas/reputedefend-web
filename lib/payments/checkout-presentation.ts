import { createHash } from "node:crypto"
import { isUuid } from "./model"
import { PaymentsDisabledError } from "./provider"

/**
 * Customer-facing names for one-time Checkout and hosted invoices.
 * The accepted service code is read from the order. A browser payload cannot
 * choose the name, and the charged amount stays the accepted order amount.
 * Relaunch Guard keeps its own recurring product name and is not a one-time line.
 */
export const CHECKOUT_SERVICE_PRESENTATIONS = {
  GUIDED_RELAUNCH: {
    name: "Guided Relaunch",
    description: "One-time upfront fee for the accepted service. Completing the agreed work does not promise a decision by Google.",
  },
  GUIDED_REVIEW: {
    name: "Guided Review",
    description: "One-time upfront fee for the accepted service. Completing the agreed work does not promise a decision by Google.",
  },
  MANAGED_RELAUNCH: {
    name: "Managed Profile Recovery",
    description: "One-time success fee for the accepted service, payable only after the agreed outcome. A saved card is not charged automatically.",
  },
  MANAGED_REVIEW: {
    name: "Managed Review Protection",
    description: "One-time success fee for the accepted service, payable only after the agreed outcome. A saved card is not charged automatically.",
  },
} as const

export type CheckoutServiceCode = keyof typeof CHECKOUT_SERVICE_PRESENTATIONS

/** Already the Guard product name. Billing, trial and metadata stay unchanged. */
export const GUARD_PRODUCT_NAME = "Relaunch Guard"

export const CHECKOUT_PRESENTATION_RPC = "payment_checkout_presentation_v1"
export const CHECKOUT_EMAIL_UNVERIFIED_MESSAGE = "Checkout cannot open until the email on this account is verified."
export const HOSTED_INVOICE_EMAIL_UNVERIFIED_MESSAGE = "A hosted invoice cannot be issued until the customer email on this account is verified."

const CHECKOUT_EMAIL = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/

export class CheckoutEmailUnverifiedError extends PaymentsDisabledError {
  constructor() {
    super(CHECKOUT_EMAIL_UNVERIFIED_MESSAGE)
    this.name = "CheckoutEmailUnverifiedError"
  }
}

export function checkoutServicePresentation(serviceCode: string): { name: string; description: string } | null {
  if (!Object.hasOwn(CHECKOUT_SERVICE_PRESENTATIONS, serviceCode)) return null
  return CHECKOUT_SERVICE_PRESENTATIONS[serviceCode as CheckoutServiceCode]
}

export function requireCheckoutPresentation(serviceCode: string): { name: string; description: string } {
  const presentation = checkoutServicePresentation(serviceCode)
  if (!presentation) throw new PaymentsDisabledError("Checkout service is not recognised.")
  return presentation
}

export function normalisedCheckoutEmail(value: unknown): string | null {
  if (typeof value !== "string") return null
  const email = value.trim().toLowerCase()
  if (email.length < 3 || email.length > 254 || !CHECKOUT_EMAIL.test(email)) return null
  return email
}

/** Stable for the same customer and verified address. The address is not in the key. */
export function emailSyncIdempotencyKey(customerId: string, email: string): string {
  const digest = createHash("sha256").update(`${customerId}\n${email}`).digest("hex").slice(0, 40)
  return `cus-email-${digest}`
}

type Rpc = (name: string, args?: Record<string, unknown>) => Promise<unknown>

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

export async function readCheckoutPresentation(
  rpc: Rpc,
  input: { customerId: string; serviceOrderId: string; amountMinor: number; mode?: string },
): Promise<{ serviceCode: CheckoutServiceCode; verifiedEmail: string; amountMinor: number; name: string; description: string }> {
  if (!isUuid(input.customerId) || !isUuid(input.serviceOrderId)) {
    throw new PaymentsDisabledError("Checkout presentation was rejected.")
  }
  const row = asRecord(await rpc(CHECKOUT_PRESENTATION_RPC, {
    p_customer: input.customerId,
    p_service_order: input.serviceOrderId,
  }))
  if (row?.status === "denied" && row.reason === "email_unverified") throw new CheckoutEmailUnverifiedError()
  const serviceCode = typeof row?.serviceCode === "string" ? row.serviceCode : ""
  const presentation = checkoutServicePresentation(serviceCode)
  const verifiedEmail = normalisedCheckoutEmail(row?.verifiedEmail)
  const amountMinor = row?.amountMinor
  const currency = row?.currency
  if (
    row?.status !== "success"
    || !presentation
    || !verifiedEmail
    || currency !== "GBP"
    || typeof amountMinor !== "number"
    || !Number.isInteger(amountMinor)
    || amountMinor < 0
  ) {
    throw new PaymentsDisabledError("Checkout presentation was rejected.")
  }
  if ((input.mode ?? "payment") !== "setup" && amountMinor !== input.amountMinor) {
    throw new PaymentsDisabledError("Checkout amount does not match the accepted order.")
  }
  return {
    serviceCode: serviceCode as CheckoutServiceCode,
    verifiedEmail,
    amountMinor,
    name: presentation.name,
    description: presentation.description,
  }
}
