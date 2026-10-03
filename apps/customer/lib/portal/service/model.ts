import { formatPortalDate, serviceLabel } from "@/lib/portal/cases/model"
import { formatMoney } from "../../../../../lib/money"
import type { AgreementStatus, PaymentNext, ServiceAgreement, ServiceQuote, TaxBehaviour } from "./parse"

export function moneyLabel(minor: number, currency: string): string {
  return formatMoney(minor, currency)
}

export function taxExplanation(behaviour: TaxBehaviour): string | null {
  if (behaviour === "INCLUSIVE") return "Tax is included in the total."
  if (behaviour === "EXCLUSIVE") return "Tax is added to the quoted amount."
  if (behaviour === "NOT_APPLICABLE") return "Tax does not apply to this quote."
  return "Tax on this quote is not confirmed, so it cannot be accepted yet."
}

export function quoteStatusText(quote: ServiceQuote): string {
  if (quote.status === "offered") return "This quote is ready for you to review."
  if (quote.status === "accepted") return quote.acceptedAt ? `You accepted this quote on ${formatPortalDate(quote.acceptedAt)}.` : "You accepted this quote."
  if (quote.status === "declined") return "You declined this quote."
  if (quote.status === "expired") return "This quote has expired."
  return "This quote is no longer available."
}

export function paymentFollowUp(next: PaymentNext): string {
  if (next === "payment") return "Payment is the next step. Use the secure link in the ProfileRelaunch email for that step."
  return "Saving a payment method is the next step. Use the secure link in the ProfileRelaunch email for that step."
}

export function agreementStatusText(kind: "agreement" | "permission", item: ServiceAgreement): string {
  if (item.status === "review") return "Please read this and confirm whether you agree."
  if (item.status === "accepted") {
    const when = item.acceptedAt ? ` on ${formatPortalDate(item.acceptedAt)}` : ""
    return kind === "agreement" ? `You accepted this Service Agreement${when}.` : `You accepted this case management permission${when}.`
  }
  if (item.status === "declined") return kind === "agreement" ? "You declined this Service Agreement." : "You declined this case management permission."
  if (item.status === "revoked") {
    return kind === "agreement"
      ? "This Service Agreement is no longer in effect. That does not cancel a service order."
      : "This case management permission has been withdrawn."
  }
  if (item.status === "review_required") return "This needs a further review before it can be used."
  return "This is no longer available."
}

export function trackLabel(track: Parameters<typeof serviceLabel>[0]): string | null {
  return serviceLabel(track)
}

export const AGREEMENT_STATUSES_VISIBLE: AgreementStatus[] = ["review", "accepted", "declined", "revoked", "review_required", "unavailable"]
