/**
 * Derived Telloya sales progress. It reads the enquiry the staff already have.
 * It does not replace the enquiry status or a subscription state.
 */

export const telloyaStages = [
  "enquiry",
  "demo",
  "offer",
  "agreement",
  "payment",
  "setup",
  "active",
] as const

export type TelloyaStage = (typeof telloyaStages)[number]

export const telloyaStageLabels: Record<TelloyaStage, string> = {
  enquiry: "Enquiry",
  demo: "Demo",
  offer: "Offer",
  agreement: "Agreement",
  payment: "Payment",
  setup: "Setup",
  active: "Active",
}

export type TelloyaDemoStatus = "NOT_BOOKED" | "BOOKED" | "COMPLETED"
export type TelloyaOfferProgress = "none" | "draft" | "sent" | "amendment" | "accepted"
export type TelloyaPaymentProgress = "none" | "verifying" | "paid" | "failed"
export type TelloyaSetupProgress = "none" | "preparing" | "testing" | "ready" | "active"

export type TelloyaJourneySnapshot = {
  source?: string
  requestIntent?: string
  planTier?: string
  guardLocationCount?: number
  assigned?: boolean
  nextAction?: string
  nextActionAt?: string | null
  demoStatus?: TelloyaDemoStatus
  offerStatus?: TelloyaOfferProgress
  agreementAccepted?: boolean
  paymentStatus?: TelloyaPaymentProgress
  setupStatus?: TelloyaSetupProgress
}

export type TelloyaJourneyProgress = {
  telloya: boolean
  planLabel: string
  requestLabel: string
  current: TelloyaStage
  next: string
  owner: string
  followUp: string
  stages: { id: TelloyaStage; label: string; state: "complete" | "current" | "upcoming" }[]
}

const PLAN_LABELS: Record<string, string> = {
  basic: "Basic",
  growth: "Growth",
  pro: "Pro",
  custom: "Custom",
}

export function telloyaPlanInterestLabel(planTier: string | undefined): string {
  const plan = (planTier ?? "").trim().toLowerCase()
  if (!plan) return "Plan to be confirmed"
  return PLAN_LABELS[plan] ?? plan
}

export function telloyaJourneyProgress(input: TelloyaJourneySnapshot): TelloyaJourneyProgress | null {
  if (input.source !== "telloya") return null
  const demo = input.demoStatus ?? "NOT_BOOKED"
  const offer = input.offerStatus ?? "none"
  const payment = input.paymentStatus ?? "none"
  const setup = input.setupStatus ?? "none"
  let current: TelloyaStage = "enquiry"
  let next = "Record whether the offline demonstration is booked."
  if (demo === "NOT_BOOKED" || demo === "BOOKED") {
    current = "demo"
    next = demo === "BOOKED"
      ? "Mark the demonstration completed only after it has actually finished."
      : "Mark the demonstration booked after it is arranged offline."
  } else if (offer === "none" || offer === "draft") {
    current = "offer"
    next = "Prepare the offer after the demonstration is completed and business authority is verified."
  } else if (offer === "sent" || offer === "amendment") {
    current = "offer"
    next = offer === "amendment"
      ? "Review the amendment request. The sent offer stays unchanged until a new version is issued."
      : "Wait for the customer to review the current offer in the authenticated portal."
  } else if (!input.agreementAccepted) {
    current = "agreement"
    next = "The customer must accept the exact current terms. Legal approval is still required before a real acceptance."
  } else if (payment !== "paid") {
    current = "payment"
    next = payment === "verifying"
      ? "Payment is being verified. A return from Checkout is not payment."
      : payment === "failed"
        ? "The latest payment failed. Do not start setup."
        : "Recurring payment stays closed until the accepted terms and tax treatment are approved."
  } else if (setup !== "active") {
    current = "setup"
    next = "Work through the existing setup checklist. Going live stays blocked."
  } else {
    current = "active"
    next = "The service is active only after an authorised transition. This preview does not perform that transition."
  }
  const index = telloyaStages.indexOf(current)
  return {
    telloya: true,
    planLabel: telloyaPlanInterestLabel(input.planTier),
    requestLabel: input.requestIntent === "personalised-demo" ? "Personalised live demonstration" : "General enquiry",
    current,
    next,
    owner: input.assigned ? "Assigned administrator" : "Unassigned",
    followUp: input.nextAction?.trim()
      ? `${input.nextAction.trim()}${input.nextActionAt ? ` · ${input.nextActionAt}` : ""}`
      : "No follow-up deadline recorded.",
    stages: telloyaStages.map((id, position) => ({
      id,
      label: telloyaStageLabels[id],
      state: position < index ? "complete" : position === index ? "current" : "upcoming",
    })),
  }
}
