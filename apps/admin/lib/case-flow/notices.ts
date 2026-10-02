/**
 * Every blocker and every attention item the model can raise, with the words
 * an operator reads.
 *
 * Wording lives here rather than beside the rule that triggers it, for the
 * same reason the action catalogue does: there is one place to check that
 * nothing claims more than the facts support. Three claims in particular are
 * never made anywhere in this file or in `actions.ts`:
 *
 *   - that an email was delivered, when the provider has only accepted it;
 *   - that payment was received, without an authoritative payment record;
 *   - that a submission happened, without a submission record.
 *
 * Each entry answers the three questions a blocker has to answer: what is
 * missing (`title`), why progress cannot continue (`explanation`), and who
 * must resolve it (`owner`).
 */

import type { CaseDestination } from "./destinations"
import type { CasePhaseId } from "./phases"
import type {
  CaseActionOwner,
  CaseAttentionItem,
  CaseAttentionSeverity,
  CaseBlocker,
  CaseBlockerCategory,
} from "./model"

type BlockerDefinition = {
  category: CaseBlockerCategory
  title: string
  explanation: string
  owner: CaseActionOwner
}

export const blockerCatalogue = {
  SERVICE_TRACK_UNDECIDED: {
    category: "COMMERCIAL_CONFIGURATION",
    title: "No service track chosen",
    explanation:
      "Nothing commercial can be raised until the case is Guided or Managed, because the two tracks have different prerequisites, different pricing and different submitters.",
    owner: "ADMIN",
  },
  COMMERCIAL_STATE_UNKNOWN: {
    category: "DATA",
    title: "The commercial position could not be confirmed",
    explanation:
      "The quote list this view reads is capped, and this case was not in the page that came back. An empty result is therefore not proof that no quote exists, so no quote is being recommended. Open Commercial and check.",
    owner: "ADMIN",
  },
  PAYMENT_STATE_UNKNOWN: {
    category: "DATA",
    title: "The payment position could not be confirmed",
    explanation:
      "The order list this view reads did not come back complete, so the absence of an order here does not mean there is none. Open Money and check before issuing anything.",
    owner: "ADMIN",
  },
  QUOTE_TAX_UNCONFIRMED: {
    category: "COMMERCIAL_CONFIGURATION",
    title: "The quote's tax treatment is unconfirmed",
    explanation:
      "A quote cannot be offered while its tax behaviour is unconfirmed, because the total the customer would accept is not yet a total anyone can stand behind.",
    owner: "ADMIN",
  },
  NO_ACCEPTED_ORDER: {
    category: "COMMERCIAL_CONFIGURATION",
    title: "No accepted order for this case",
    explanation:
      "Payment is collected against an order, and an order only exists once the customer has accepted a quote. Until then there is nothing to collect against.",
    owner: "CUSTOMER",
  },
  ACCEPTANCE_TRUST_INCOMPLETE: {
    category: "AUTHORITY",
    title: "The customer cannot be sent an acceptance link yet",
    explanation:
      "A quote-acceptance link is only issued to a verified email address belonging to somebody with verified authority over the business. The database refuses to create the link until both are recorded, so issuing it now would simply be denied.",
    owner: "ADMIN",
  },
  UPFRONT_PAYMENT_OUTSTANDING: {
    category: "PAYMENT",
    title: "The upfront payment has not been collected",
    explanation:
      "A Guided case cannot move into preparation until the upfront payment is recorded as paid by the payment provider. A completed checkout page is not a payment record.",
    owner: "CUSTOMER",
  },
  MANAGED_PAYMENT_SETUP_INCOMPLETE: {
    category: "PAYMENT",
    title: "No usable saved payment method",
    explanation:
      "A Managed case is charged on success, so the customer has to consent to a later charge and leave a usable saved payment method before work begins. Neither is in place.",
    owner: "CUSTOMER",
  },
  AUTHORISATION_INCOMPLETE: {
    category: "AUTHORITY",
    title: "Permission to act is not complete",
    explanation:
      "A Managed case needs a verified contact, verified authority over the business, an accepted service agreement, an active case-management permission and verified Google Manager access. At least one is missing.",
    owner: "ADMIN",
  },
  AUTHORISATION_IN_REVIEW: {
    category: "AUTHORITY",
    title: "A permission has been invalidated",
    explanation:
      "A permission the customer previously gave was invalidated because the email address, the business authority or the service track changed. An invalidated permission is not authority to act and is never revived automatically.",
    owner: "ADMIN",
  },
  NO_LOCATION_RECORDED: {
    category: "AUTHORITY",
    title: "The case has no location",
    explanation:
      "Google Manager access is verified against a specific location. With no location on the case there is nothing to verify it against, so Managed permissions cannot complete.",
    owner: "ADMIN",
  },
  NO_ACCEPTED_EVIDENCE: {
    category: "EVIDENCE",
    title: "No accepted evidence",
    explanation:
      "A pack can only contain evidence that has been scanned clean, validated and accepted. Nothing on this case has reached that state.",
    owner: "ADMIN",
  },
  EVIDENCE_THREAT_BLOCKED: {
    category: "SAFETY",
    title: "An uploaded file is blocked by the malware scan",
    explanation:
      "A file with a detected threat is never opened, read or packed. It has to be rejected and replaced before the evidence on this case can be relied on.",
    owner: "ADMIN",
  },
  NO_PUBLISHED_PACK: {
    category: "EVIDENCE",
    title: "No published evidence pack",
    explanation:
      "The case cannot be marked ready to submit until an approved pack has been published. Approval and publication are separate steps and approval alone is not enough.",
    owner: "ADMIN",
  },
  PACK_STALE: {
    category: "EVIDENCE",
    title: "The evidence pack is stale",
    explanation:
      "Evidence inside the approved pack stopped being eligible, so the pack no longer matches the case. A stale pack must not be used for a submission.",
    owner: "ADMIN",
  },
  PAYMENTS_NOT_ENABLED: {
    category: "CAPABILITY",
    title: "Payment collection is switched off in this deployment",
    explanation:
      "No payment link can be issued and no payment can be collected while the payment provider is disabled. This is a deployment capability, not something wrong with the case.",
    owner: "SYSTEM",
  },
  LIVE_MAIL_NOT_ENABLED: {
    category: "CAPABILITY",
    title: "Outgoing customer email is switched off in this deployment",
    explanation:
      "Messages can be drafted and reviewed but cannot be queued for sending, so the customer will not receive anything until live mail is enabled. Reach them another way if the case cannot wait.",
    owner: "SYSTEM",
  },
  GOOGLE_SUBMISSION_NOT_LIVE: {
    category: "CAPABILITY",
    title: "There is no automated Google submission in this deployment",
    explanation:
      "Nothing in this application sends anything to Google. A submission is made through the agreed external channel and then recorded here, which is what moves the case on.",
    owner: "SYSTEM",
  },
  OPEN_SUBMISSION_UNRESOLVED: {
    category: "DATA",
    title: "A submission has no recorded decision",
    explanation:
      "The case cannot be closed and no further submission can be recorded while an earlier one is still open. Record what happened to it first.",
    owner: "ADMIN",
  },
  OPEN_TASKS_BLOCK_CLOSURE: {
    category: "DATA",
    title: "There are open tasks on the case",
    explanation: "A case cannot be closed with tasks still open. Resolve or cancel them first.",
    owner: "ADMIN",
  },
} as const satisfies Record<string, BlockerDefinition>

export type CaseBlockerCode = keyof typeof blockerCatalogue

type AttentionDefinition = {
  severity: CaseAttentionSeverity
  title: string
  explanation: string
  owner: CaseActionOwner
  /** The phase this reflects on, unless the caller knows better. */
  phase: CasePhaseId
}

export const attentionCatalogue = {
  EVIDENCE_THREAT_FOUND: {
    severity: "CRITICAL",
    title: "A threat was found in an uploaded file",
    explanation:
      "The malware scan blocked the file. It cannot be opened, reviewed or included in a pack, and the customer needs to send a clean replacement.",
    owner: "ADMIN",
    phase: "EVIDENCE",
  },
  EVIDENCE_CONTENT_INVALID: {
    severity: "WARNING",
    title: "An uploaded file could not be validated",
    explanation:
      "The file passed the malware scan but its contents did not match what it claimed to be, so it cannot be accepted. Refresh the check, and ask for a replacement if it fails again.",
    owner: "ADMIN",
    phase: "EVIDENCE",
  },
  EVIDENCE_SCAN_UNRESOLVED: {
    severity: "WARNING",
    title: "A security scan result is missing",
    explanation:
      "A scan result is unavailable for an uploaded file, and nothing checks again on its own. Until the check is refreshed from the evidence workspace the file stays unusable.",
    owner: "ADMIN",
    phase: "EVIDENCE",
  },
  EVIDENCE_REQUEST_OVERDUE: {
    severity: "WARNING",
    title: "An evidence request has passed its due date",
    explanation: "The date recorded on the request has passed and nothing has been accepted against it.",
    owner: "CUSTOMER",
    phase: "EVIDENCE",
  },
  EVIDENCE_REQUEST_UNDELIVERED: {
    severity: "CRITICAL",
    title: "The evidence request did not reach the customer",
    explanation:
      "The message bounced, was complained about or was suppressed, so the customer has not seen the request. Waiting for an upload achieves nothing until contact is re-established.",
    owner: "ADMIN",
    phase: "EVIDENCE",
  },
  EVIDENCE_REQUEST_NOT_SENT: {
    severity: "WARNING",
    title: "An evidence request exists that the customer has not been told about",
    explanation:
      "Raising a request records what is needed; it does not contact anybody. No message carrying this request has been sent.",
    owner: "ADMIN",
    phase: "EVIDENCE",
  },
  EVIDENCE_DELIVERY_UNCONFIRMED: {
    severity: "INFO",
    title: "The evidence request was accepted by the email provider but delivery is unconfirmed",
    explanation:
      "Accepted by the provider is not the same as delivered. Until a delivery outcome arrives the customer counts as not yet reached, not as unresponsive.",
    owner: "SYSTEM",
    phase: "EVIDENCE",
  },
  EVIDENCE_DELIVERY_UNKNOWN: {
    severity: "WARNING",
    title: "It is not known whether the email provider accepted the request",
    explanation:
      "The provider was called but the outcome was never established, so nothing can be concluded about this message. It may have gone, and it may never have been accepted. Reconcile it against the provider rather than sending again blind.",
    owner: "ADMIN",
    phase: "EVIDENCE",
  },
  EVIDENCE_REQUEST_SATISFIED_BUT_OPEN: {
    severity: "INFO",
    title: "An evidence request is satisfied but still open",
    explanation:
      "Evidence against this request has been accepted. Marking the request fulfilled is a separate step and nothing does it automatically, so the case still reads as waiting on the customer.",
    owner: "ADMIN",
    phase: "EVIDENCE",
  },
  AUTHORISATION_REVIEW_REQUIRED: {
    severity: "CRITICAL",
    title: "A permission has been moved to review",
    explanation:
      "The email address, business authority or service track changed after the customer accepted, so the permission no longer covers what it was given for. It has to be issued and accepted again; nothing revives it.",
    owner: "ADMIN",
    phase: "PREREQUISITES",
  },
  PAYMENT_FAILED: {
    severity: "CRITICAL",
    title: "A payment attempt failed",
    explanation:
      "The payment provider reported a failure. Nothing has been collected, and the case cannot treat the payment prerequisite as met.",
    owner: "ADMIN",
    phase: "PREREQUISITES",
  },
  PAYMENT_AUTHENTICATION_REQUIRED: {
    severity: "CRITICAL",
    title: "A payment needs the customer to authenticate",
    explanation:
      "The bank asked for additional authentication and it has not been completed, so nothing has been collected.",
    owner: "CUSTOMER",
    phase: "PREREQUISITES",
  },
  PACK_STALE: {
    severity: "CRITICAL",
    title: "The approved pack has gone stale",
    explanation:
      "Evidence inside the pack stopped being eligible after approval. The pack no longer represents the case and must not be submitted.",
    owner: "ADMIN",
    phase: "PREPARATION",
  },
  PACK_UNPUBLISHED: {
    severity: "WARNING",
    title: "A published pack has been withdrawn from the customer",
    explanation: "The pack was published and then unpublished, so the customer can no longer see it.",
    owner: "ADMIN",
    phase: "PREPARATION",
  },
  PACK_NOT_SUBMITTABLE: {
    severity: "CRITICAL",
    title: "The case is marked ready to submit with no usable pack behind it",
    explanation:
      "There is no approved, published pack on this case, so there is nothing fit to submit. The pack can be rebuilt from the evidence workspace without moving the case stage back; preparation needs finishing before a submission is recorded.",
    owner: "ADMIN",
    phase: "PREPARATION",
  },
  CUSTOMER_ACTION_EXPIRED: {
    severity: "WARNING",
    title: "A secure customer link has expired",
    explanation:
      "The link issued to the customer is past its expiry, so following it now fails. A new one has to be issued; the old secret cannot be recovered.",
    owner: "ADMIN",
    phase: "PREREQUISITES",
  },
  TASK_OVERDUE: {
    severity: "WARNING",
    title: "A task on this case is overdue",
    explanation: "An internal follow-up recorded on the case has passed the date somebody set for it.",
    owner: "ADMIN",
    phase: "RECEIVED",
  },
  COMPLAINT_OPEN: {
    severity: "WARNING",
    title: "There is an open complaint about this case",
    explanation:
      "A complaint is recorded against this case and has not been resolved. Complaints are handled in their own workspace and are not closed by progressing the case.",
    owner: "ADMIN",
    phase: "RECEIVED",
  },
  SUBMISSION_AWAITING_RESULT: {
    severity: "INFO",
    title: "A submission has no recorded decision",
    explanation:
      "A submission is recorded against this case with nothing recorded about how it ended. Nothing else can be submitted until it is resolved.",
    owner: "ADMIN",
    phase: "DECISION",
  },
  QUOTE_DECLINED: {
    severity: "WARNING",
    title: "The customer declined the quote",
    explanation: "The quote was declined, so there is no order and nothing to collect against.",
    owner: "ADMIN",
    phase: "SERVICE",
  },
  QUOTE_EXPIRED: {
    severity: "WARNING",
    title: "The quote has expired",
    explanation: "The quote passed the date it was valid until without being accepted, so it can no longer be accepted.",
    owner: "ADMIN",
    phase: "SERVICE",
  },
  COMMERCIAL_LIST_TRUNCATED: {
    severity: "INFO",
    title: "The commercial position shown here may be incomplete",
    explanation:
      "Quotes are read from a capped list with no case filter, so this case's quote may not have been in the page that came back. Treat Commercial as the authority.",
    owner: "ADMIN",
    phase: "SERVICE",
  },
  PAYMENT_LIST_TRUNCATED: {
    severity: "INFO",
    title: "The payment position shown here may be incomplete",
    explanation: "Orders are read from a list with no case filter, so Money remains the authority on what has been collected.",
    owner: "ADMIN",
    phase: "PREREQUISITES",
  },
  PLANNED_ACTION_OVERDUE: {
    severity: "WARNING",
    title: "The planned next action is past its date",
    explanation: "Somebody recorded a next action and a date on this case, and the date has passed.",
    owner: "ADMIN",
    phase: "RECEIVED",
  },
  LIVE_MAIL_DISABLED: {
    severity: "INFO",
    title: "Outgoing customer email is switched off",
    explanation:
      "Drafts can be written and reviewed but nothing will be sent, so a customer step that depends on a message will not start on its own.",
    owner: "SYSTEM",
    phase: "RECEIVED",
  },
  CASE_REOPENED: {
    severity: "INFO",
    title: "This case was reopened after being closed",
    explanation:
      "The recorded outcome was cleared and the case returned for further work. The earlier history stays exactly as it was.",
    owner: "ADMIN",
    phase: "DECISION",
  },
} as const satisfies Record<string, AttentionDefinition>

export type CaseAttentionCode = keyof typeof attentionCatalogue

export function blocker(code: CaseBlockerCode, destination: CaseDestination | null = null): CaseBlocker {
  const definition = blockerCatalogue[code]
  return {
    code,
    category: definition.category,
    title: definition.title,
    explanation: definition.explanation,
    owner: definition.owner,
    destination,
  }
}

export function attention(
  code: CaseAttentionCode,
  options: {
    destination?: CaseDestination | null
    dueAt?: string | null
    overdue?: boolean
    phase?: CasePhaseId
    /** Appended to the catalogue explanation when a count makes it clearer. */
    detail?: string
  } = {},
): CaseAttentionItem {
  const definition = attentionCatalogue[code]
  return {
    code,
    severity: definition.severity,
    title: definition.title,
    explanation: options.detail ? `${definition.explanation} ${options.detail}` : definition.explanation,
    owner: definition.owner,
    phase: options.phase ?? definition.phase,
    dueAt: options.dueAt ?? null,
    overdue: options.overdue ?? false,
    destination: options.destination ?? null,
  }
}
