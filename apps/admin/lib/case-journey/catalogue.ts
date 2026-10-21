/**
 * The eleven operator steps for the guided case workflow.
 *
 * This is a catalogue, not a workflow engine. A technical `work_stage` is
 * not in this list and is not evidence that any step is finished. Completion
 * is decided later, from stored records. The technical stage is not one of
 * those records. The assessment is read separately from the case-flow projection.
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
      "An evidence request exists and either the newest evidence-request message is recorded as DELIVERED, or a stored file is linked to a live evidence request. A request record, a draft, a reviewed draft, a queued message, or provider acceptance is not delivery and is not that file. The linked file does not record a DELIVERED status and does not accept the file. A future decision that no documents are required is not in this projection, so an empty request list is not completion.",
    applicability: "UNIVERSAL",
    unsupported:
      "This step can save an evidence requirement and draft or review the evidence-request message through the existing commands. It does not send email, queue a worker, or record that no documents are required. An empty checklist is not that decision.",
    laterWork: "ADMIN-JOURNEY-03",
    unlocksNext:
      "Confirmed delivery shows the customer was reached. A stored file linked to a live request also shows a response is on file, so evidence review can open while delivery is still unconfirmed. Neither one finishes evidence review. Provider acceptance does not count as delivery and does not invent a DELIVERED status. A no-documents decision stays unknown until ADMIN-JOURNEY-03 records it.",
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
    unsupported:
      "Review uses the existing evidence commands. It does not send email, change the document-request message, or record that no documents are required. An empty evidence list is not that decision. Pack preparation stays on a later step.",
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
    dataDependencies: ["case_assessments", "the case issue and review URL", "the business and location profile", "evidence request title, text and status", "document title", "evidence version review"],
    completionEvidence:
      "The latest approved assessment is current: its basis still matches the case issue, review URL, business and location profile, evidence-request title and text, document title, and evidence version state. A blank Google profile URL is allowed. It was not approved before a later reopen, and it recommends Guided or Managed. A draft, a review, a stale approval, or moving the technical stage does not complete the step. The recommendation is not an accepted service agreement and does not activate the service.",
    applicability: "UNIVERSAL",
    unsupported:
      "This step records the assessment through the proposed commands. It does not send email, take a payment, submit anything to Google, accept a quote, or activate a service. A suspended or missing listing does not block the assessment.",
    laterWork: "ADMIN-JOURNEY-05",
    unlocksNext:
      "A current approved assessment unlocks the quote. Advancing the technical stage does not. Assessment of a suspended or missing Google listing does not wait for listing verification this projection does not have.",
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
      "A quote whose status is ACCEPTED, read from a complete quote list. An open acceptance link, a draft, a declined quote and an expired quote are not acceptance. A recommended pathway is not acceptance. Acceptance is not a purchasing-establishment record and it is not a country or tax eligibility record.",
    applicability: "UNIVERSAL",
    unsupported: "This step uses the existing quote commands. It does not change the selected service track, take a payment, activate the service, send email, or submit anything to Google. Offering a binding paid quote still uses the existing purchasing-establishment and country and tax eligibility checks. This step does not add a country list and does not infer those checks from the quote status.",
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
      "Guided: one accepted quote whose order id is the only upfront order, that order ACCEPTED_AWAITING_PAYMENT, the upfront obligation PAID, and a receipt, all read from complete lists. Managed: that same quote order id on the only success-fee order, plus an accepted service agreement, verified business authority, an active case-management permission, verified Google manager access, and database authorisation readiness. A checkout return, an accepted quote alone, a quote that names a different order, a saved card, a selected track, an expired link, and a revoked permission are not activation.",
    applicability: "CONDITIONAL",
    unsupported:
      "This step uses the existing payment-link and authorisation commands. It does not mark an obligation paid, grant Google access by itself, issue a saved-card setup, approve a success fee, prepare a pack, or submit anything to Google. Live collection stays on the existing payment gate. Agreement PS-2026-10-14.2 does not allow a saved card as activation.",
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
    completionEvidence: "The current pack, the latest one that is not superseded, is approved, published and non-empty, no other approved pack is still published, and no live pack is stale. A draft, an unpublished approval, a stale pack, a superseded pack, another published pack, disagreeing customer, business or authority records, and a pack whose detailed record disagrees with the case projection are not completion. Approval is not publication, and publication is not a Google submission.",
    applicability: "UNIVERSAL",
    unsupported: "This step uses the existing pack commands. Approval does not publish the pack. Publication does not submit anything to Google and does not create an open document link. An unscanned, rejected, superseded or unlinked file is not eligible evidence.",
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
    completionEvidence: "At least one submission, and every submission has a decision or a withdrawal. An open attempt is still waiting. A result that is not a decision or a withdrawal, a submitting party that does not match the service track, and a case record that disagrees with the projection are not completion. Recording an attempt does not submit it to Google.",
    applicability: "UNIVERSAL",
    unsupported: "Nothing here submits to Google. The step records an attempt already completed outside the portal, then its decision or withdrawal. Outcome review, billing and closure stay on later steps.",
    laterWork: "ADMIN-JOURNEY-09",
    unlocksNext: "A recorded result on every submission unlocks outcome review. Filing the row without a result does not.",
  },
  {
    id: "OUTCOME_BILLING",
    order: 10,
    title: "Outcome Verification & Billing",
    purpose: "Record what happened, and bill only what the service track actually allows.",
    responsibleParty: "ADMIN",
    dataDependencies: ["cases.outcome", "accepted quote and service order", "upfront obligation and receipt", "success-fee approval, invoice and receipt"],
    completionEvidence: "Guided: a recorded outcome, the accepted quote linked to the only upfront order, that order ACCEPTED_AWAITING_PAYMENT, the upfront obligation PAID, and a receipt. A paid obligation without a receipt, or a receipt without a paid obligation, is not settlement, and this step does not create a second charge. Managed: provider-confirmed settlement after a qualifying outcome, or a recorded non-qualifying outcome with no success-fee obligation. A stored outcome on an open case counts when it matches the recorded pre-closure shape. Recording that outcome does not close the case. Approval, an invoice link, a saved card and a checkout return are not payment. An unsuccessful case is not invoiced to finish the step. A conflicting or incomplete record, including a quote, order, case or customer that do not agree, is not completion. The close command still closes the case, and this step does not call it.",
    applicability: "CONDITIONAL",
    unsupported: "This step uses the case command to record an outcome, and the existing success-fee approval and TEST-MODE hosted-invoice commands. Recording an outcome does not close the case, approve a fee, create an invoice, or take a payment. It does not send email or submit anything to Google. Agreement PS-2026-10-14.2 invoices a Managed success fee only after documented success.",
    laterWork: "ADMIN-JOURNEY-10",
    unlocksNext: "A settled Guided fee, a settled Managed success fee, or a recorded non-billable outcome unlocks closure. An open fee does not. Closure itself stays on the next step.",
  },
  {
    id: "CLOSURE",
    order: 11,
    title: "Closure & Optional Guard",
    purpose: "Close the case, or leave it closed, without making optional Guard a condition.",
    responsibleParty: "ADMIN",
    dataDependencies: ["cases.status", "cases.outcome", "cases.closure_summary", "open tasks", "submission results", "reopen events"],
    completionEvidence: "The case status, outcome, customer summary and finished stage agree, and the loaded case record matches that projection. CLOSED holds a non-withdrawal. CANCELLED holds a withdrawal. A status that contradicts the outcome, a stage other than FINISHED, a missing summary, or a loaded record that disagrees is not completion. Guard is optional and is not part of this evidence. A reopened case is open again. A recorded outcome on an open case is not closure.",
    applicability: "UNIVERSAL",
    unsupported: "This step uses the existing close and reopen commands. It does not send a closure email, submit anything to Google, collect a payment, enrol Guard, or apply a Guard discount. Guard can stay unset and cannot block closure.",
    laterWork: "ADMIN-JOURNEY-11",
    unlocksNext: "Closure is the last step. Optional Guard can be offered later and must not hold the case open.",
  },
]

const byId = new Map(journeyCatalogue.map(step => [step.id, step]))

export function journeyStep(id: JourneyStepId): JourneyStepDefinition {
  const step = byId.get(id)
  if (!step) throw new Error(`Unknown journey step ${id}`)
  return step
}
