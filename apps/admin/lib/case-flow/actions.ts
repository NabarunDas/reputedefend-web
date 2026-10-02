/**
 * Every next action this model can recommend, and the order they win in.
 *
 * The priority is a table rather than the order of some `if` chain, because
 * the point of the whole exercise is that a business-critical blocker is
 * never hidden behind routine work. A resolver proposes candidates; this
 * module picks one, and it picks the same one every time.
 *
 * Four bands, highest first:
 *
 *   1 SAFETY       Integrity of the case: a threat in an upload, evidence
 *                  that is no longer valid, an authorisation that has been
 *                  invalidated, a payment that needs reconciling, a message
 *                  that failed to reach the customer it was blocking.
 *   2 ADMIN_ACTION Work ProfileRelaunch owes the case right now: review the
 *                  evidence, complete the assessment, approve the pack,
 *                  record the Google decision.
 *   3 JOURNEY      The earliest unresolved step in the case journey, whether
 *                  that step is issuing something to the customer or waiting
 *                  for what was already issued.
 *   4 PROGRESSION  A step the case has earned: advance a stage, close.
 *
 * Issuing and waiting deliberately share one band. An earlier "every
 * outbound action beats every waiting action" rule meant a later request
 * overtook an earlier customer wait, so a case with an agreement already out
 * with the customer told the operator to send the next thing instead of
 * waiting for the answer. Journey position decides between them now.
 *
 * Within a band, the earlier entry in `actionCatalogue` wins, and the
 * catalogue is declared in journey order. That tie-break settles conflicts
 * between phases. Sequencing *within* a phase is the per-phase rule's job:
 * the Managed prerequisite ladder in particular returns one candidate and
 * does not rely on this table to order its own steps.
 */

import type { CaseDestinationKind } from "./destinations"
import type { CaseActionOwner, CaseActionState, CaseNextActionId, CasePriorityBand } from "./model"

/**
 * The bands and the order they win in. The names are the shared
 * `CasePriorityBand` type; the numbers are this module's business, because
 * ordering is what this table is for.
 */
export const priorityBands: Record<CasePriorityBand, number> = {
  SAFETY: 1,
  ADMIN_ACTION: 2,
  JOURNEY: 3,
  PROGRESSION: 4,
}

export type PriorityBand = CasePriorityBand

export type ActionDefinition = {
  band: CasePriorityBand
  owner: CaseActionOwner
  /** What this action normally means; a resolver may narrow it. */
  state: CaseActionState
  label: string
  description: string
  /** Where the operator has to go. Resolved to a path by the resolver. */
  surface: CaseDestinationKind
}

/**
 * Declaration order is journey order and is load-bearing: it breaks ties
 * inside a band. Do not sort this object.
 */
export const actionCatalogue: Record<CaseNextActionId, ActionDefinition> = {
  // --- Safety and integrity ------------------------------------------------
  RESOLVE_EVIDENCE_THREAT: {
    band: "SAFETY",
    owner: "ADMIN",
    state: "ACTION_REQUIRED",
    surface: "CASE_EVIDENCE",
    label: "Deal with a blocked evidence file",
    description:
      "The malware scan found a threat in an uploaded file, so the file is blocked and cannot be read, reviewed or included in a pack. Reject the version and ask the customer for a clean replacement.",
  },
  REPLACE_INVALID_EVIDENCE: {
    band: "SAFETY",
    owner: "ADMIN",
    state: "ACTION_REQUIRED",
    surface: "CASE_EVIDENCE",
    label: "Deal with an unreadable evidence file",
    description:
      "An uploaded file passed the malware scan but its contents could not be validated, so it cannot be accepted or packed. Refresh the check, and ask for a replacement if it fails again.",
  },
  RESOLVE_AUTHORISATION_REVIEW: {
    band: "SAFETY",
    owner: "ADMIN",
    state: "ACTION_REQUIRED",
    surface: "CASE",
    label: "Re-establish an invalidated permission",
    description:
      "A permission the customer previously gave has been moved to review because the email, the business authority or the service track changed. It does not come back on its own and has to be issued and accepted again.",
  },
  RESOLVE_PAYMENT_EXCEPTION: {
    band: "SAFETY",
    owner: "ADMIN",
    state: "ACTION_REQUIRED",
    surface: "MONEY",
    label: "Resolve a payment problem",
    description:
      "The upfront payment did not complete. Until it is resolved the case cannot move to preparation, because payment is a prerequisite rather than a formality.",
  },
  RESOLVE_MANAGED_PAYMENT_EXCEPTION: {
    band: "SAFETY",
    owner: "ADMIN",
    state: "ACTION_REQUIRED",
    surface: "MONEY",
    label: "Resolve a payment-setup problem",
    description:
      "Saving the customer's payment method did not complete. Managed cases cannot proceed without a usable saved method, so this has to be resolved before preparation.",
  },
  RECOVER_CUSTOMER_CONTACT: {
    band: "SAFETY",
    owner: "ADMIN",
    state: "ACTION_REQUIRED",
    surface: "CASE_COMMUNICATIONS",
    label: "Re-establish contact with the customer",
    description:
      "The evidence request did not reach the customer: the email bounced, was complained about or was suppressed. Sending the same message to the same address again will not work. Establish a usable contact route before anything else is expected of them.",
  },

  // --- Admin work the case is waiting on ----------------------------------
  REVIEW_NEW_CASE: {
    band: "ADMIN_ACTION",
    owner: "ADMIN",
    state: "ACTION_REQUIRED",
    surface: "CASE",
    label: "Review the new case",
    description:
      "Read what the customer reported and decide whether evidence is needed or the case can be assessed as it stands.",
  },
  CONFIRM_CASE_LOCATION: {
    band: "ADMIN_ACTION",
    owner: "ADMIN",
    state: "ACTION_REQUIRED",
    surface: "BUSINESS_RECORD",
    label: "Confirm which location this case is about",
    description:
      "The case has no location recorded. A Managed case cannot verify Google Manager access without one, so the location has to be confirmed before permissions can be completed.",
  },
  CHECK_EVIDENCE_SCAN: {
    band: "ADMIN_ACTION",
    owner: "ADMIN",
    state: "ACTION_REQUIRED",
    surface: "CASE_EVIDENCE",
    label: "Refresh the evidence security check",
    description:
      "A scan result is not available for an uploaded file. Nothing polls for it, so the check has to be refreshed from the evidence workspace before the file can be reviewed.",
  },
  REVIEW_EVIDENCE: {
    band: "ADMIN_ACTION",
    owner: "ADMIN",
    state: "ACTION_REQUIRED",
    surface: "CASE_EVIDENCE",
    label: "Review the uploaded evidence",
    description:
      "Evidence has been uploaded, scanned clean and validated, and is waiting for somebody to accept or reject it.",
  },
  COMPLETE_ASSESSMENT: {
    band: "ADMIN_ACTION",
    owner: "ADMIN",
    state: "ACTION_REQUIRED",
    surface: "CASE",
    label: "Complete the assessment",
    description:
      "There is enough evidence to decide what ProfileRelaunch can do. Record the assessment and move the case on to choosing a service.",
  },
  APPROVE_PREPARED_PACK: {
    band: "ADMIN_ACTION",
    owner: "ADMIN",
    state: "ACTION_REQUIRED",
    surface: "CASE_EVIDENCE",
    label: "Approve the evidence pack",
    description:
      "The draft pack holds the evidence it needs and is waiting for approval. Approving does not make it visible to the customer; publishing does that.",
  },
  FIX_PREPARED_PACK: {
    band: "ADMIN_ACTION",
    owner: "ADMIN",
    state: "ACTION_REQUIRED",
    surface: "CASE_EVIDENCE",
    label: "Rebuild the evidence pack",
    description:
      "The approved pack went stale because evidence inside it stopped being valid. A stale pack is not a submittable pack and has to be put right.",
  },
  REVIEW_SUBMISSION_DECISION: {
    band: "ADMIN_ACTION",
    owner: "ADMIN",
    state: "ACTION_REQUIRED",
    surface: "CASE",
    label: "Record what Google decided",
    description:
      "A submission is recorded with no decision against it. Record the decision, or record that the attempt was withdrawn.",
  },
  PERFORM_FURTHER_REVIEW: {
    band: "ADMIN_ACTION",
    owner: "ADMIN",
    state: "ACTION_REQUIRED",
    surface: "CASE",
    label: "Do the further work this case needs",
    description:
      "The case came back for more work. Decide whether it goes back to preparation for another attempt or forward to an outcome.",
  },
  REVIEW_OUTCOME: {
    band: "ADMIN_ACTION",
    owner: "ADMIN",
    state: "ACTION_REQUIRED",
    surface: "CASE",
    label: "Review the outcome",
    description: "The result is in. Agree the outcome with the customer and get the case ready to close.",
  },
  CONFIRM_COMMERCIAL_STATE: {
    band: "ADMIN_ACTION",
    owner: "ADMIN",
    state: "BLOCKED",
    surface: "COMMERCIAL",
    label: "Check the commercial position for this case",
    description:
      "The quote list this view reads is capped, so this case's quote may not have been in it. Open Commercial and confirm before raising anything new.",
  },
  CONFIRM_PAYMENT_STATE: {
    band: "ADMIN_ACTION",
    owner: "ADMIN",
    state: "BLOCKED",
    surface: "MONEY",
    label: "Check the payment position for this case",
    description:
      "The order list this view reads did not come back complete, so nothing here can be treated as the full picture. Open Money and confirm before issuing anything.",
  },

  // --- The journey, in the order an operator walks it ----------------------
  REQUEST_EVIDENCE: {
    band: "JOURNEY",
    owner: "ADMIN",
    state: "ACTION_REQUIRED",
    surface: "CASE_EVIDENCE",
    label: "Raise an evidence request",
    description:
      "Record what the customer has to provide. Raising a request does not contact anybody; the message is a separate step.",
  },
  PREPARE_EVIDENCE_REQUEST_MESSAGE: {
    band: "JOURNEY",
    owner: "ADMIN",
    state: "ACTION_REQUIRED",
    surface: "CASE_COMMUNICATIONS",
    label: "Draft the evidence request message",
    description:
      "An evidence request exists but the customer has not been written to. Draft the message that carries their secure upload link.",
  },
  REVIEW_EVIDENCE_REQUEST_MESSAGE: {
    band: "JOURNEY",
    owner: "ADMIN",
    state: "ACTION_REQUIRED",
    surface: "CASE_COMMUNICATIONS",
    label: "Review the drafted message",
    description: "The evidence request message is drafted and needs checking before it can be queued.",
  },
  SEND_EVIDENCE_REQUEST: {
    band: "JOURNEY",
    owner: "ADMIN",
    state: "ACTION_REQUIRED",
    surface: "CASE_COMMUNICATIONS",
    label: "Send the evidence request",
    description: "The message has been reviewed and is ready to go to the customer.",
  },
  WAIT_FOR_EMAIL_DELIVERY: {
    band: "JOURNEY",
    owner: "SYSTEM",
    state: "WAITING",
    surface: "CASE_COMMUNICATIONS",
    label: "Waiting for the email provider",
    description:
      "The message has been queued, but delivery has not yet been confirmed. Accepted by the provider is not the same as delivered, so the customer cannot be treated as having been reached and cannot yet be treated as unresponsive.",
  },
  RECONCILE_EMAIL_DELIVERY: {
    band: "JOURNEY",
    owner: "ADMIN",
    state: "ACTION_REQUIRED",
    surface: "CASE_COMMUNICATIONS",
    label: "Reconcile the message with the email provider",
    description:
      "The provider was called but it is not known whether it accepted the message, so nothing can be concluded about delivery. Reconcile the outcome against the provider before drafting a replacement; sending again blind risks either a duplicate or another silent failure.",
  },
  WAIT_FOR_CUSTOMER_EVIDENCE: {
    band: "JOURNEY",
    owner: "CUSTOMER",
    state: "WAITING",
    surface: "CASE_EVIDENCE",
    label: "Waiting for the customer to upload evidence",
    description:
      "The request has been delivered to the customer and nothing has been uploaded against it yet.",
  },
  WAIT_FOR_EVIDENCE_SCAN: {
    band: "JOURNEY",
    owner: "SYSTEM",
    state: "WAITING",
    surface: "CASE_EVIDENCE",
    label: "Waiting for the security scan",
    description:
      "A file has been uploaded and is being scanned for malware. It cannot be opened or reviewed until the scan reports back.",
  },
  SELECT_SERVICE: {
    band: "JOURNEY",
    owner: "ADMIN",
    state: "ACTION_REQUIRED",
    surface: "CASE",
    label: "Choose the service track",
    description:
      "Decide whether the customer submits with our guidance or ProfileRelaunch submits on their behalf. Everything commercial follows from this.",
  },
  CREATE_QUOTE: {
    band: "JOURNEY",
    owner: "ADMIN",
    state: "ACTION_REQUIRED",
    surface: "COMMERCIAL",
    label: "Create the quote",
    description: "The service track is chosen and there is no quote this case can proceed on.",
  },
  COMPLETE_QUOTE_CONFIGURATION: {
    band: "JOURNEY",
    owner: "ADMIN",
    state: "BLOCKED",
    surface: "COMMERCIAL",
    label: "Finish the quote configuration",
    description:
      "The draft quote cannot be offered as it stands. Tax treatment has to be confirmed on the quote before it can go to the customer.",
  },
  OFFER_QUOTE: {
    band: "JOURNEY",
    owner: "ADMIN",
    state: "ACTION_REQUIRED",
    surface: "COMMERCIAL",
    label: "Offer the quote",
    description: "The draft quote is configured and can be offered to the customer.",
  },
  VERIFY_CUSTOMER_CONTACT: {
    band: "JOURNEY",
    owner: "ADMIN",
    state: "ACTION_REQUIRED",
    surface: "CLIENT_RECORD",
    label: "Verify the customer's email address",
    description:
      "Secure customer links are tied to a verified email address. Until the address on the record is verified, nothing the customer accepts can be relied on and the database refuses to issue the link.",
  },
  VERIFY_BUSINESS_AUTHORITY: {
    band: "JOURNEY",
    owner: "ADMIN",
    state: "ACTION_REQUIRED",
    surface: "BUSINESS_RECORD",
    label: "Verify the customer's authority over the business",
    description:
      "ProfileRelaunch only acts for somebody who can show they speak for the business. Record the evidence and mark the membership verified.",
  },
  ISSUE_QUOTE_ACCEPTANCE: {
    band: "JOURNEY",
    owner: "ADMIN",
    state: "ACTION_REQUIRED",
    surface: "COMMERCIAL",
    label: "Send the quote for acceptance",
    description:
      "The quote has been offered but the customer has no way to accept it yet. Issue the acceptance link.",
  },
  WAIT_FOR_QUOTE_ACCEPTANCE: {
    band: "JOURNEY",
    owner: "CUSTOMER",
    state: "WAITING",
    surface: "COMMERCIAL",
    label: "Waiting for the customer to accept the quote",
    description: "The acceptance link is open and the customer has not accepted or declined it.",
  },
  REVIEW_DECLINED_QUOTE: {
    band: "JOURNEY",
    owner: "ADMIN",
    state: "ACTION_REQUIRED",
    surface: "COMMERCIAL",
    label: "Pick up the declined quote",
    description:
      "The customer declined the quote. Decide whether to re-quote on different terms or close the case.",
  },
  ISSUE_SERVICE_AGREEMENT: {
    band: "JOURNEY",
    owner: "ADMIN",
    state: "ACTION_REQUIRED",
    surface: "CASE",
    label: "Issue the service agreement",
    description: "Send the service agreement for the customer to accept.",
  },
  WAIT_FOR_SERVICE_AGREEMENT: {
    band: "JOURNEY",
    owner: "CUSTOMER",
    state: "WAITING",
    surface: "CASE",
    label: "Waiting for the service agreement",
    description:
      "The agreement has been issued and the customer has not accepted it. Nothing further is asked of them until this comes back.",
  },
  ISSUE_CASE_PERMISSION: {
    band: "JOURNEY",
    owner: "ADMIN",
    state: "ACTION_REQUIRED",
    surface: "CASE",
    label: "Issue the case-management permission",
    description:
      "Send the permission that lets ProfileRelaunch act on this case. It is specific to this case and separate from the service agreement.",
  },
  WAIT_FOR_CASE_PERMISSION: {
    band: "JOURNEY",
    owner: "CUSTOMER",
    state: "WAITING",
    surface: "CASE",
    label: "Waiting for the case-management permission",
    description:
      "The permission has been issued and the customer has not accepted it. Nothing further is asked of them until this comes back.",
  },
  VERIFY_MANAGER_ACCESS: {
    band: "JOURNEY",
    owner: "ADMIN",
    state: "ACTION_REQUIRED",
    surface: "CASE",
    label: "Verify Google Manager access",
    description:
      "Record that ProfileRelaunch has Manager or Owner access to the location's Google profile, with the evidence for it.",
  },
  START_UPFRONT_PAYMENT: {
    band: "JOURNEY",
    owner: "ADMIN",
    state: "ACTION_REQUIRED",
    surface: "MONEY",
    label: "Send the payment link",
    description: "The order is accepted and the upfront payment has not been started.",
  },
  WAIT_FOR_UPFRONT_PAYMENT: {
    band: "JOURNEY",
    owner: "CUSTOMER",
    state: "WAITING",
    surface: "MONEY",
    label: "Waiting for the upfront payment",
    description:
      "Collection has started and no confirmation has arrived. A completed checkout page is not payment; the case moves when the provider confirms the money was taken.",
  },
  START_MANAGED_PAYMENT_SETUP: {
    band: "JOURNEY",
    owner: "ADMIN",
    state: "ACTION_REQUIRED",
    surface: "MONEY",
    label: "Send the payment-setup link",
    description:
      "A Managed case charges on success, so the customer has to consent to a later charge and save a payment method before work begins.",
  },
  WAIT_FOR_MANAGED_PAYMENT_SETUP: {
    band: "JOURNEY",
    owner: "CUSTOMER",
    state: "WAITING",
    surface: "MONEY",
    label: "Waiting for the customer to save a payment method",
    description: "The setup link is open and no usable payment method has been saved yet.",
  },
  REQUEST_CUSTOMER_ACTION: {
    band: "JOURNEY",
    owner: "ADMIN",
    state: "ACTION_REQUIRED",
    surface: "CASE",
    label: "Ask the customer to act on Google's request",
    description:
      "Google has asked the profile owner to do something. Record what is needed as a customer task and tell them.",
  },
  WAIT_FOR_CUSTOMER_ACTION: {
    band: "JOURNEY",
    owner: "CUSTOMER",
    state: "WAITING",
    surface: "CASE",
    label: "Waiting for the customer to act on Google's request",
    description: "The customer has been asked to do something on their own profile.",
  },
  FOLLOW_UP_GOOGLE: {
    band: "JOURNEY",
    owner: "ADMIN",
    state: "ACTION_REQUIRED",
    surface: "CASE",
    label: "Follow up with Google",
    description: "A follow-up somebody set on this submission has come due.",
  },
  WAIT_FOR_GOOGLE: {
    band: "JOURNEY",
    owner: "GOOGLE",
    state: "WAITING",
    surface: "CASE",
    label: "Waiting for Google",
    description:
      "The submission is with Google. There is no agreed response time, so there is nothing to chase until a follow-up somebody set falls due.",
  },

  // --- Progression ---------------------------------------------------------
  FULFIL_EVIDENCE_REQUEST: {
    band: "PROGRESSION",
    owner: "ADMIN",
    state: "READY",
    surface: "CASE_EVIDENCE",
    label: "Close off the evidence request",
    description:
      "Evidence against this request has been accepted but the request is still open. Marking it fulfilled is a separate step and nothing does it automatically.",
  },
  ADVANCE_TO_ASSESSMENT: {
    band: "PROGRESSION",
    owner: "ADMIN",
    state: "READY",
    surface: "CASE",
    label: "Move the case to assessment",
    description: "The evidence that was asked for is in and accepted, so the case can be assessed.",
  },
  ADVANCE_TO_PREREQUISITES: {
    band: "PROGRESSION",
    owner: "ADMIN",
    state: "READY",
    surface: "CASE",
    label: "Move the case on to its prerequisites",
    description:
      "The customer has accepted the quote. Move the case to the stage that collects what has to be in place before work begins.",
  },
  CREATE_PREPARED_PACK: {
    band: "PROGRESSION",
    owner: "ADMIN",
    state: "READY",
    surface: "CASE_EVIDENCE",
    label: "Start the evidence pack",
    description: "Prerequisites are met and there is no pack for this case yet.",
  },
  ADD_PREPARED_PACK_ITEMS: {
    band: "PROGRESSION",
    owner: "ADMIN",
    state: "READY",
    surface: "CASE_EVIDENCE",
    label: "Add evidence to the pack",
    description: "The draft pack is empty, so there is nothing in it to approve.",
  },
  PUBLISH_PREPARED_PACK: {
    band: "PROGRESSION",
    owner: "ADMIN",
    state: "READY",
    surface: "CASE_EVIDENCE",
    label: "Publish the pack to the customer",
    description:
      "The pack is approved but the customer cannot see it. Approval and publication are separate, and the case cannot be marked ready to submit until a pack is published.",
  },
  ADVANCE_TO_PREPARATION: {
    band: "PROGRESSION",
    owner: "ADMIN",
    state: "READY",
    surface: "CASE",
    label: "Move the case to preparation",
    description: "Every prerequisite is satisfied and work on the submission can begin.",
  },
  ADVANCE_TO_READY_TO_SUBMIT: {
    band: "PROGRESSION",
    owner: "ADMIN",
    state: "READY",
    surface: "CASE",
    label: "Mark the case ready to submit",
    description:
      "The published pack and the prerequisites are in place. This means ProfileRelaunch is ready internally; it does not mean Google has received anything.",
  },
  RECORD_EXTERNAL_SUBMISSION: {
    band: "PROGRESSION",
    owner: "ADMIN",
    state: "READY",
    surface: "CASE",
    label: "Submit externally, then record the submission",
    description:
      "Nothing here submits to Google. Make the submission through the agreed channel and record its reference, channel, time and evidence; recording it is what moves the case on.",
  },
  MOVE_TO_WAITING_GOOGLE: {
    band: "PROGRESSION",
    owner: "ADMIN",
    state: "READY",
    surface: "CASE",
    label: "Move the case to waiting for Google",
    description: "The submission is recorded, so the case can move to waiting on Google's decision.",
  },
  RETURN_TO_PREPARATION: {
    band: "PROGRESSION",
    owner: "ADMIN",
    state: "READY",
    surface: "CASE",
    label: "Take the case back to preparation",
    description: "Another attempt needs preparing before anything else can happen.",
  },
  CLOSE_CASE: {
    band: "PROGRESSION",
    owner: "ADMIN",
    state: "READY",
    surface: "CASE",
    label: "Close the case",
    description: "The outcome is agreed and there is no open work left.",
  },

  // --- Fallback ------------------------------------------------------------
  // Proposed only when nothing else was, so its position cannot shadow a
  // real recommendation. An open case always gets an answer, and when the
  // honest answer is "this does not fit the model", it says so rather than
  // guessing or showing nothing.
  REVIEW_CASE_STATE: {
    band: "ADMIN_ACTION",
    owner: "ADMIN",
    state: "BLOCKED",
    surface: "CASE",
    label: "Check this case by hand",
    description:
      "This case is in a combination of states the journey model does not recognise, so it is not recommending anything. Work out the next step from the case itself and raise it, because something here is worth understanding.",
  },
}

/** Declaration order, cached so tie-breaking does not re-scan the object. */
const catalogueOrder = new Map<CaseNextActionId, number>(
  (Object.keys(actionCatalogue) as CaseNextActionId[]).map((id, index) => [id, index]),
)

export type ActionCandidate = {
  id: CaseNextActionId
  /** Narrows the catalogue default, e.g. a step blocked by a dead provider. */
  state?: CaseActionState
  dueAt?: string | null
  overdue?: boolean
  reasonCodes?: string[]
  /** Replaces the catalogue description when the case needs a specific one. */
  description?: string
}

/** The sort key: band first, then position in the journey. */
export function priorityKey(id: CaseNextActionId): number {
  return priorityBands[actionCatalogue[id].band] * 1000 + (catalogueOrder.get(id) ?? 0)
}

/**
 * The single recommendation. Highest band wins; inside a band the step
 * earliest in the journey wins. A case with ten things wrong still gets one
 * answer, and it is always the same answer for the same facts.
 */
export function highestPriority(candidates: ActionCandidate[]): ActionCandidate | null {
  let best: ActionCandidate | null = null
  let bestKey = Number.POSITIVE_INFINITY
  for (const candidate of candidates) {
    const key = priorityKey(candidate.id)
    if (key < bestKey) {
      best = candidate
      bestKey = key
    }
  }
  return best
}

export function bandOf(id: CaseNextActionId): CasePriorityBand {
  return actionCatalogue[id].band
}
