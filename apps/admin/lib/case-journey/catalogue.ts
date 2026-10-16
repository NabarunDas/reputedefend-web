/**
 * The eleven operator steps for the guided case workflow.
 *
 * This is a catalogue, not a workflow engine. A technical `work_stage` is
 * not in this list and is not evidence that any step is finished. Completion
 * is decided later, from records the case projection already carries.
 */

export const journeyStepIds = [
  "CASE_RECEIVED",
  "VERIFICATION",
  "REQUEST_DOCUMENTS",
  "EVIDENCE_REVIEW",
  "ASSESSMENT",
  "QUOTE_ACCEPTANCE",
  "SERVICE_ACTIVATION",
  "PREPARATION",
  "SUBMISSION",
  "OUTCOME_BILLING",
  "CLOSURE",
] as const

export type JourneyStepId = (typeof journeyStepIds)[number]

export const journeyApplicabilities = ["UNIVERSAL", "GUIDED_ONLY", "MANAGED_ONLY", "CONDITIONAL"] as const

export type JourneyApplicability = (typeof journeyApplicabilities)[number]

export type JourneyParty = "ADMIN" | "CUSTOMER" | "GOOGLE" | "ADMIN_AND_CUSTOMER"

export type JourneyStepDefinition = {
  id: JourneyStepId
  /** Operator-facing position, 1 through 11. */
  order: number
  title: string
  purpose: string
  responsibleParty: JourneyParty
  /** Facts this step is allowed to read. Absence is a gap, not a default. */
  dataDependencies: readonly string[]
  /** The only record that may turn the step complete. */
  completionEvidence: string
  applicability: JourneyApplicability
  /** What this build cannot yet do for the step. */
  unsupported: string
  /** Which later slice owns the operation. This preview does not perform it. */
  laterWork: string
  unlocksNext: string
}

export const journeyCatalogue: readonly JourneyStepDefinition[] = [
  {
    id: "CASE_RECEIVED",
    order: 1,
    title: "Case Received",
    purpose: "Confirm a new case has arrived and that somebody still has to read it.",
    responsibleParty: "ADMIN",
    dataDependencies: ["cases.reference", "cases.status", "cases.work_stage"],
    completionEvidence: "No intake-review record is projected. A case row and a confirmation email do not complete this step.",
    applicability: "UNIVERSAL",
    unsupported: "There is no stored operator review of the intake, so this step cannot be marked complete.",
    laterWork: "ADMIN-JOURNEY-02",
    unlocksNext: "A recorded intake review would unlock business, profile and contact verification. Moving the technical stage does not.",
  },
  {
    id: "VERIFICATION",
    order: 2,
    title: "Business, Profile & Contact Verification",
    purpose: "Establish who the customer is, which business they speak for, and which Google listing the case is about.",
    responsibleParty: "ADMIN",
    dataDependencies: [
      "customer email verification",
      "business membership and authority",
      "case location",
      "Google listing verification",
      "legal purchasing establishment",
    ],
    completionEvidence:
      "Email control, business authority, Google listing verification and the legal purchasing establishment are separate facts. This projection does not carry the listing or the establishment, so the step cannot be completed from what is here.",
    applicability: "UNIVERSAL",
    unsupported: "Google listing verification and the legal purchasing establishment are not in the case-flow projection.",
    laterWork: "ADMIN-JOURNEY-02",
    unlocksNext: "All four facts have to be recorded before the request for documents can rely on them. Verifying the email alone does not.",
  },
  {
    id: "REQUEST_DOCUMENTS",
    order: 3,
    title: "Review Request & Request Documents",
    purpose: "Decide what the case needs and ask the customer for it in a message that actually arrives.",
    responsibleParty: "ADMIN_AND_CUSTOMER",
    dataDependencies: ["evidence requests", "EVIDENCE_REQUEST communications and delivery status"],
    completionEvidence: "An evidence request exists and the newest evidence-request message is recorded as DELIVERED. Raising a request, queueing a message, or a provider accepting it does not count.",
    applicability: "UNIVERSAL",
    unsupported: "The guided preview does not draft, review or send the request. The communications workspace remains the existing place for that work.",
    laterWork: "ADMIN-JOURNEY-03",
    unlocksNext: "Confirmed delivery unlocks waiting for the customer's documents. A sent message does not.",
  },
  {
    id: "EVIDENCE_REVIEW",
    order: 4,
    title: "Evidence Review",
    purpose: "Accept or reject what the customer submitted, and close the request only when the review is done.",
    responsibleParty: "ADMIN",
    dataDependencies: ["evidence version upload, scan, validation and review", "evidence request status"],
    completionEvidence:
      "At least one accepted version, no live file still blocked, invalid, scanning or awaiting review, and no evidence request left open. An upload is not acceptance.",
    applicability: "UNIVERSAL",
    unsupported: "Accept, reject and fulfil stay on the evidence workspace. This preview does not add those commands.",
    laterWork: "ADMIN-JOURNEY-04",
    unlocksNext: "Accepted evidence with the request fulfilled unlocks assessment. A file sitting in review does not.",
  },
  {
    id: "ASSESSMENT",
    order: 5,
    title: "Assessment & Recommended Path",
    purpose: "Record what the evidence shows and which path is recommended.",
    responsibleParty: "ADMIN",
    dataDependencies: ["an assessment record"],
    completionEvidence: "No assessment record is projected. The stage ASSESSMENT_READY means the case is ready to assess, not that an assessment was written.",
    applicability: "UNIVERSAL",
    unsupported: "There is no assessment document in the current case-flow facts.",
    laterWork: "ADMIN-JOURNEY-05",
    unlocksNext: "A stored assessment would unlock the quote. Advancing the technical stage does not.",
  },
  {
    id: "QUOTE_ACCEPTANCE",
    order: 6,
    title: "Quote & Contract Acceptance",
    purpose: "Offer a quote the customer can accept, and record that acceptance.",
    responsibleParty: "ADMIN_AND_CUSTOMER",
    dataDependencies: ["quotes.status", "quote-acceptance customer action", "commercial.complete"],
    completionEvidence: "A quote whose status is ACCEPTED, read from a complete quote list. An open acceptance link is not acceptance.",
    applicability: "UNIVERSAL",
    unsupported: "Creating, offering and issuing the quote stay on the commercial workspace.",
    laterWork: "ADMIN-JOURNEY-06",
    unlocksNext: "An accepted quote creates the order service activation checks. Opening the contract does not.",
  },
  {
    id: "SERVICE_ACTIVATION",
    order: 7,
    title: "Service Activation — Guided or Managed",
    purpose: "Start the accepted service only when that track's own conditions are recorded.",
    responsibleParty: "ADMIN_AND_CUSTOMER",
    dataDependencies: [
      "service track",
      "accepted order",
      "upfront obligation state",
      "case authorisation readiness",
      "business authority",
      "case-management permission",
      "Google manager access",
    ],
    completionEvidence:
      "Guided: an accepted order and an upfront obligation recorded as PAID. Managed: an accepted success-fee order, database authorisation readiness, verified business authority, an active case-management permission and verified Google access. Saved-card setup is not evidence.",
    applicability: "CONDITIONAL",
    unsupported:
      "The older Managed saved-card and automatic-charge path is still present in the existing case-flow recommendation. Agreement PS-2026-10-14.2 does not allow it as activation, and this preview does not offer it.",
    laterWork: "ADMIN-JOURNEY-07",
    unlocksNext: "Guided settlement, or Managed authority with Google access, unlocks preparation. Returning from Checkout, or choosing Managed, does not.",
  },
  {
    id: "PREPARATION",
    order: 8,
    title: "Case Preparation & Approval",
    purpose: "Assemble the evidence pack, approve it, and publish a current copy.",
    responsibleParty: "ADMIN",
    dataDependencies: ["prepared pack status", "published", "item count", "stale"],
    completionEvidence: "An approved pack that is published, non-empty, and not stale. Approval without publication is not enough, and a stale pack is not current.",
    applicability: "UNIVERSAL",
    unsupported: "Pack commands stay on the evidence workspace.",
    laterWork: "ADMIN-JOURNEY-08",
    unlocksNext: "A current published pack unlocks submission. A draft or a stale pack does not.",
  },
  {
    id: "SUBMISSION",
    order: 9,
    title: "Submission & Tracking",
    purpose: "Record a submission that actually went out, then track it until Google answers.",
    responsibleParty: "GOOGLE",
    dataDependencies: ["case submissions and their results", "google submission capability"],
    completionEvidence: "At least one submission, and every submission has a recorded result. A row with no result is still waiting. There is no live Google transport in this build.",
    applicability: "UNIVERSAL",
    unsupported: "Nothing here submits to Google. An operator can still record an externally completed submission on the case cockpit.",
    laterWork: "ADMIN-JOURNEY-09",
    unlocksNext: "A recorded result on every submission unlocks outcome review. Filing the row without a result does not.",
  },
  {
    id: "OUTCOME_BILLING",
    order: 10,
    title: "Outcome Verification & Billing",
    purpose: "Record what happened, and bill only what the service track actually allows.",
    responsibleParty: "ADMIN",
    dataDependencies: ["cases.outcome", "upfront obligation state", "a post-success Managed invoice"],
    completionEvidence:
      "Guided: a recorded case outcome and an upfront obligation already PAID. Managed: a recorded outcome is not enough, because no post-success invoice is projected. Checkout and a saved card are not billing.",
    applicability: "CONDITIONAL",
    unsupported: "Managed success-fee invoicing after documented success is not in the case-flow projection.",
    laterWork: "ADMIN-JOURNEY-10",
    unlocksNext: "A verified outcome and the track's real billing record unlock closure. An open outcome review does not.",
  },
  {
    id: "CLOSURE",
    order: 11,
    title: "Closure & Optional Guard",
    purpose: "Close the case, or leave it closed, without making optional Guard a condition.",
    responsibleParty: "ADMIN",
    dataDependencies: ["cases.status", "reopen events"],
    completionEvidence: "The case status is CLOSED or CANCELLED. Guard is optional and is not part of this evidence. A reopened case is open again.",
    applicability: "UNIVERSAL",
    unsupported: "Guard subscriptions, checks and alerts are not part of this preview and cannot block closure.",
    laterWork: "ADMIN-JOURNEY-10",
    unlocksNext: "Closure is the last step. Optional Guard can be offered later and must not hold the case open.",
  },
]

const byId = new Map(journeyCatalogue.map(step => [step.id, step]))

export function journeyStep(id: JourneyStepId): JourneyStepDefinition {
  const step = byId.get(id)
  if (!step) throw new Error(`Unknown journey step ${id}`)
  return step
}
