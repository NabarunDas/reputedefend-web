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
  /** Which slice owns the operation. */
  laterWork: string
  /** Present only for the two steps this preview can record. */
  decision?: "intake" | "verification"
  unlocksNext: string
}

export const journeyCatalogue: readonly JourneyStepDefinition[] = [
  {
    id: "CASE_RECEIVED",
    order: 1,
    title: "Case Received",
    purpose: "Confirm a new case has arrived and that somebody still has to read it.",
    responsibleParty: "ADMIN",
    dataDependencies: ["cases.reference", "cases.status", "cases.work_stage", "INTAKE_REVIEW work event"],
    completionEvidence: "The latest INTAKE_REVIEW work event has outcome REVIEWED and is not behind a reopen. A case row, a submitted form and a confirmation email do not complete this step. Outcome INCOMPLETE keeps it open.",
    applicability: "UNIVERSAL",
    unsupported: "Recording the review does not send email and does not change the technical stage. A confirmation email is still not a review.",
    decision: "intake",
    laterWork: "ADMIN-JOURNEY-02",
    unlocksNext: "A recorded intake review would unlock business, profile and contact verification. Moving the technical stage does not.",
  },
  {
    id: "VERIFICATION",
    order: 2,
    title: "Business, Profile & Contact Verification",
    purpose: "Make the initial check of the business, the Google Profile and the contact. Screening, verified email, business authority and the purchasing establishment stay separate.",
    responsibleParty: "ADMIN",
    dataDependencies: [
      "basic business screening",
      "verified customer email",
      "business authority",
      "Google listing state, including a suspended or missing listing",
      "legal purchasing establishment",
      "country and tax eligibility",
    ],
    completionEvidence:
      "The latest BUSINESS_VERIFICATION work event has outcome PRELIMINARY_COMPLETE, no material discrepancy, and is not behind a reopen or a revoked membership. Email control, business authority, a website, an accessible Google listing and the purchasing establishment are separate and are not created by this outcome.",
    applicability: "UNIVERSAL",
    unsupported: "This record does not verify email, grant business authority, or decide the purchasing establishment or tax eligibility. A saved Google URL is not a verified listing.",
    decision: "verification",
    laterWork: "ADMIN-JOURNEY-02",
    unlocksNext:
      "An evidence request does not wait for the legal purchasing establishment, and it does not wait for Google listing verification when that verification is unavailable because the listing is suspended or missing. The purchasing establishment and the country and tax eligibility checks stay required before a binding paid quote is issued. Verified email alone does not finish this step.",
  },
  {
    id: "REQUEST_DOCUMENTS",
    order: 3,
    title: "Review Request & Request Documents",
    purpose: "Record the evidence needed, review the drafted request, and issue it. Queued, provider-accepted and delivered remain three different statuses.",
    responsibleParty: "ADMIN_AND_CUSTOMER",
    dataDependencies: [
      "evidence requests",
      "draft and review of the evidence-request message",
      "queued, provider-accepted and delivered statuses",
    ],
    completionEvidence:
      "An evidence request exists and the newest evidence-request message is recorded as DELIVERED. A request record, a draft, a reviewed draft, a queued message, or provider acceptance is not delivery. A future decision that no documents are required is not in this projection, so an empty request list is not completion.",
    applicability: "UNIVERSAL",
    unsupported:
      "The guided preview does not record the evidence list, review a draft, or issue the message, and it has no evidence-waiver command. The communications workspace remains the existing place for the message.",
    laterWork: "ADMIN-JOURNEY-03",
    unlocksNext:
      "Confirmed delivery shows the customer was reached. It does not finish evidence review, and a customer upload can be reviewed before that confirmation arrives. Provider acceptance does not count as delivery. A no-documents decision stays unknown until ADMIN-JOURNEY-03 records it.",
  },
  {
    id: "EVIDENCE_REVIEW",
    order: 4,
    title: "Evidence Review",
    purpose: "Review what the customer submitted. A rejected file returns to the evidence loop, and an outstanding threat blocks that file.",
    responsibleParty: "ADMIN",
    dataDependencies: ["evidence version upload, scan, validation and review", "evidence request status"],
    completionEvidence:
      "At least one accepted version, no live file still blocked by a threat, invalid, scanning or awaiting review, and no evidence request left open. An upload is not acceptance. A rejected file is not acceptance. No evidence-waiver record exists, so a case with no documents cannot be completed from silence.",
    applicability: "UNIVERSAL",
    unsupported: "Accept, reject, fulfil and an evidence waiver stay on the evidence workspace. This preview does not add those commands.",
    laterWork: "ADMIN-JOURNEY-04",
    unlocksNext:
      "Accepted evidence with the request fulfilled unlocks assessment. A file sitting in review does not. A rejected file or a request for a replacement returns to the evidence loop. An outstanding malware threat continues to block use of the affected file.",
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
    unlocksNext:
      "A stored assessment would unlock the quote. Advancing the technical stage does not. Assessment of a suspended or missing Google listing does not wait for listing verification this projection does not have.",
  },
  {
    id: "QUOTE_ACCEPTANCE",
    order: 6,
    title: "Quote & Contract Acceptance",
    purpose: "Offer a quote the customer can accept, and record that acceptance.",
    responsibleParty: "ADMIN_AND_CUSTOMER",
    dataDependencies: [
      "quotes.status",
      "quote-acceptance customer action",
      "commercial.complete",
      "legal purchasing establishment",
      "country and tax eligibility",
    ],
    completionEvidence:
      "A quote whose status is ACCEPTED, read from a complete quote list. An open acceptance link is not acceptance. Acceptance is not a purchasing-establishment record and it is not a country or tax eligibility record.",
    applicability: "UNIVERSAL",
    unsupported: "Creating, offering and issuing the quote stay on the commercial workspace. This preview does not invent the establishment or tax check.",
    laterWork: "ADMIN-JOURNEY-06",
    unlocksNext:
      "An accepted quote is the authoritative acceptance and leads to that track's activation checks. Issuing a binding paid quote still requires the legally verified purchasing establishment and the country and tax eligibility checks. Opening the contract does not accept it, and this preview does not infer those checks from the quote status.",
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
