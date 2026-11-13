import type { TelloyaBillingState } from "./telloya-checkout"
import type { TelloyaOfferVersion } from "./telloya-offer"

export type TelloyaServiceView = {
  planLabel: string
  includedMinutes: string
  guardLocations: string
  invoice: string
  renewal: string
  service: string
  usage: string
  refund: string
}

export function telloyaServiceView(input: {
  offer: TelloyaOfferVersion | null
  billing: TelloyaBillingState
  renewalDate: string | null
}): TelloyaServiceView {
  const offer = input.offer
  const service = input.billing === "cancelled" || input.billing === "failed"
    ? "Inactive"
    : input.billing === "past_due"
      ? "Payment needs attention"
      : input.billing === "cancel_at_period_end"
        ? "Cancellation requested"
        : input.billing === "initial_paid" || input.billing === "recurring_paid"
          ? "Preparing your receptionist"
          : "Not active"
  return {
    planLabel: offer ? offer.planCode : "Plan to be confirmed",
    includedMinutes: offer?.includedMinutes == null ? "Quoted individually" : `${offer.includedMinutes} minutes each month`,
    guardLocations: offer ? `${offer.guardLocations} agreed locations` : "None agreed",
    invoice: input.billing === "initial_paid" || input.billing === "recurring_paid" ? "Paid" : input.billing === "failed" || input.billing === "past_due" ? "Unpaid" : "Not paid",
    renewal: input.renewalDate ?? "No renewal date is recorded.",
    service,
    usage: "Call usage is not available in this preview.",
    refund: "A cancellation request is for the end of the paid period. It does not promise a pro-rata refund.",
  }
}

export function requestTelloyaCancellation(billing: TelloyaBillingState): { result: string; billing: TelloyaBillingState } {
  if (billing !== "initial_paid" && billing !== "recurring_paid" && billing !== "past_due") return { result: "closed", billing }
  return { result: "recorded", billing: "cancel_at_period_end" }
}

export function telloyaVoiceAllowed(billing: TelloyaBillingState): boolean {
  // Payment evidence does not open live answering. The voice safety gates are still unverified.
  void billing
  return false
}
