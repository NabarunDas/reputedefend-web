/**
 * COM-12A review-only draft of the B2B paid-service agreement.
 *
 * This module is not an operative contract. It is not shown to customers,
 * it is not written into agreement_versions, and it does not make acceptance
 * actionable. Solicitor approval is an open gate. A later COM-13A change may
 * publish an approved hash. It must not edit this text in place.
 */
import { createHash } from "node:crypto"
import { guardFaqs, guardIncluded } from "@/app/relaunch-guard/content"
import { guardPrice } from "@/lib/guard-offer"
import { legalIdentity, publicLegalDisclosure, registeredOfficeInline } from "@/lib/legal"
import { pricingGroups } from "@/lib/pricing"

export const PAID_SERVICE_AGREEMENT_VERSION = "PS-2026-10-14.1"
export const PAID_SERVICE_AGREEMENT_STATUS = "SOLICITOR_REVIEW" as const
export const VERIFICATION_WINDOW_MS = 48 * 60 * 60 * 1000
export const INVOICE_DAYS = 14

export const paidServiceAgreement = {
  version: PAID_SERVICE_AGREEMENT_VERSION,
  status: PAID_SERVICE_AGREEMENT_STATUS,
  operative: false,
  customerVisible: false,
  acceptanceActionable: false,
  solicitorReviewComplete: false,
  catalogueCurrency: "GBP" as const,
  /** Seeded database tax behaviour stays UNCONFIRMED. This draft does not select NOT_APPLICABLE. */
  retainedTaxBehaviour: "UNCONFIRMED" as const,
  vatRegistered: false as const,
  vatNumber: null,
} as const

export const com12aLiveEffects = {
  stripeLiveMode: false,
  checkout: false,
  subscriptions: false,
  refunds: false,
  invoiceIssuance: false,
  charges: false,
  automaticManagedCardCharge: false,
  customerPortal: false,
  guardActivation: false,
  mailAutomation: false,
  databaseMigration: false,
  awsChange: false,
  vercelChange: false,
} as const

const guidedRelaunch = pricingGroups[0].items[0]
const managedRecovery = pricingGroups[0].items[1]
const guidedReview = pricingGroups[1].items[0]
const managedReview = pricingGroups[1].items[1]
const guardItem = pricingGroups[2].items[0]

const cancelFaq = guardFaqs.find(item => item.q === "How do I cancel?")
if (!cancelFaq) throw new Error("published Guard cancellation promise is missing")

const disclosure = publicLegalDisclosure()

export const catalogueAmounts = {
  guidedRelaunch: { name: "Guided Relaunch", price: guidedRelaunch.price, minor: 9900, when: "upfront" },
  guidedReview: { name: "Guided Review", price: guidedReview.price, minor: 5900, when: "upfront" },
  managedProfileRecovery: { name: "Managed Profile Recovery", price: managedRecovery.price, minor: 29900, when: "success fee" },
  managedReviewProtection: { name: "Managed Review Protection", price: managedReview.price, minor: 14900, when: "success fee" },
  relaunchGuard: { name: "Relaunch Guard", price: guardItem.price, minor: 999, when: "per month per location" },
} as const

function section(title: string, paragraphs: string[]) {
  return [`## ${title}`, ...paragraphs].join("\n\n")
}

export const paidServiceAgreementBody = [
  `ProfileRelaunch Ltd — B2B paid-service agreement`,
  `Version ${PAID_SERVICE_AGREEMENT_VERSION}`,
  `Status: ${PAID_SERVICE_AGREEMENT_STATUS}. This draft is not operative. It is not published to customers and acceptance is not actionable. Solicitor review is not complete.`,
  `Supplier: ${disclosure.operator}. ${disclosure.companyNumber} ${disclosure.placeOfRegistration} ${disclosure.incorporated} Registered office: ${registeredOfficeInline()}. Contact: ${legalIdentity.contactEmail}.`,
  section("1. Website terms are separate", [
    "The website terms at /terms govern use of the website and enquiries. They are not this agreement. Using the website, sending an enquiry, or reading a published price does not accept this agreement and does not create a paid-service contract.",
    "This draft does not replace or rewrite any agreement a customer has already accepted. A later acceptance, if COM-13A makes one available, applies only to the quotation and version the customer accepts.",
  ]),
  section("2. Catalogue currency", [
    `The contractual catalogue currency is GBP. Guided Relaunch is ${catalogueAmounts.guidedRelaunch.price} upfront. Guided Review is ${catalogueAmounts.guidedReview.price} upfront. Managed Profile Recovery is a ${catalogueAmounts.managedProfileRecovery.price} success fee. Managed Review Protection is a ${catalogueAmounts.managedReviewProtection.price} success fee. Relaunch Guard is ${guardPrice} per month per location.`,
    "Where a later Stripe-supported flow permits local-currency presentment, the customer sees the final currency and amount before payment. The GBP quotation remains the authoritative catalogue amount. This draft does not enable that flow.",
  ]),
  section("3. Guided Relaunch and Guided Review", [
    "A Guided fee is payable upfront only after a valid quotation and the applicable version of these terms have been accepted. This draft does not open that acceptance.",
    "The customer may cancel before substantive case-specific work begins and receive a full refund of the upfront fee.",
    "After substantive case-specific work begins, the supplier may retain only a fair portion attributable to work already performed. That portion must be evidenced. An unevidenced deduction is not taken. The remainder is refunded.",
    "Completion of the agreed deliverable is distinct from Google's decision. Delivering the agreed Guided work is not a promise that Google will reinstate a profile or remove a review. Google's decision does not, by itself, prove the work was deficient.",
    "These terms do not exclude legal remedies for deficient work.",
  ]),
  section("4. Managed Profile Recovery", [
    `The success fee is ${catalogueAmounts.managedProfileRecovery.price}. The quotation identifies the exact Business Profile and the incident. The supplier records the baseline restriction before relying on it for the fee.`,
    "Qualifying restoration requires the original restriction to be absent at an initial check and again at a second check at least 48 hours later. The original restriction must not be known to have returned during that window.",
    "An unrelated new issue after the verified outcome does not invalidate the completed service. No success fee is charged for an outcome known to be wholly unrelated to ProfileRelaunch's authorised work.",
    "Two checks are not uninterrupted surveillance.",
  ]),
  section("5. Managed Review Protection", [
    `The success fee is ${catalogueAmounts.managedReviewProtection.price}. The quotation identifies the exact original review through the stable identifiers and baseline evidence then available.`,
    "Success requires that specified review to be absent at two checks at least 48 hours apart. Evidence that the same review returned during the period invalidates that verification attempt.",
    "A different new negative review is a separate incident and does not invalidate success for the specified review. Reporting, hiding, a rating change, or an acknowledgement is not by itself a successful removal.",
    "No success fee is charged for a removal known to be wholly unrelated to the authorised work. Two checks are not uninterrupted surveillance.",
  ]),
  section("6. Evidence, unknown results and disputes", [
    "Both verification timestamps and the supporting observations are recorded. An unknown or ambiguous observation stays pending. A pending outcome is not invoiced as success.",
    "There is no second success-fee obligation for the same service order and the same verified outcome.",
    `The customer may dispute the claimed outcome in writing before the invoice falls due. Collection of a genuinely disputed amount pauses while that dispute is reviewed against the recorded checks. Pausing collection is not an admission, and it does not remove a remedy for deficient work.`,
  ]),
  section("7. Payment", [
    "Guided fees are upfront, and only once a valid quotation and these terms are accepted.",
    "Managed fees are invoiced only after documented success. An invoice is payable within 14 calendar days. Genuinely disputed amounts are not collected while the dispute is under review.",
    "There is no automatic card charge for a Managed success fee and no collection of that fee in advance. This draft does not authorise Stripe Checkout, a subscription, a refund, an invoice, or a charge.",
  ]),
  section("8. Relaunch Guard", [
    `Relaunch Guard is ${guardPrice} per month per location. ${guardIncluded.body} ${guardIncluded.followUp} ${guardIncluded.supporting}`,
    `Published cancellation: ${cancelFaq.a.join(" ")}`,
    "This agreement adds no service-level commitment beyond those published promises. It does not activate Guard. Activation waits until operating windows and capacity are approved.",
  ]),
  section("9. Tax", [
    "The company is not VAT registered. No VAT is added while that remains the case. This is not a statement that a supply is zero-rated or exempt.",
    "The database tax behaviour of catalogue prices remains UNCONFIRMED. UNCONFIRMED continues to block quotation acceptance. This draft does not change that behaviour to NOT_APPLICABLE and does not set VAT to zero in the database.",
    "Tax treatment for customers outside the United Kingdom is a later jurisdiction-specific readiness gate. It is not decided here.",
  ]),
  section("10. Liability — SOLICITOR REVIEW REQUIRED", [
    "SOLICITOR REVIEW REQUIRED. The proposed cap is the greater of £1,000 or twice the fee for the service order in question. The cap is a proposal in this draft. It is not approved and it is not in force.",
    "SOLICITOR REVIEW REQUIRED. Nothing in the proposed cap excludes liability that cannot legally be excluded, including liability for death or personal injury caused by negligence, or liability for fraud or fraudulent misrepresentation.",
    "SOLICITOR REVIEW REQUIRED. Counsel must still consider whether the cap is reasonable, whether a customer could be a consumer despite the business-purpose confirmation, which courts and law apply to international customers, whether professional indemnity cover matches the cap, and which privacy and data-processing terms are required.",
  ]),
  section("11. Immutable version", [
    `The canonical text of version ${PAID_SERVICE_AGREEMENT_VERSION} is this body. Its SHA-256 is the content hash. Approving the text does not edit it. Publishing it to customers is a later reviewed step. Any change to the text creates a new version and a new hash. Historical acceptances keep the hash they accepted.`,
  ]),
].join("\n\n")

export const paidServiceAgreementContentHash = createHash("sha256").update(paidServiceAgreementBody, "utf8").digest("hex")

export function verificationWindowSatisfied(firstCheckedAt: string, secondCheckedAt: string) {
  const first = Date.parse(firstCheckedAt)
  const second = Date.parse(secondCheckedAt)
  if (!Number.isFinite(first) || !Number.isFinite(second)) return false
  return second - first >= VERIFICATION_WINDOW_MS
}

export type CheckState = "restored" | "restricted" | "unknown"
export type OutcomeVerdict = "qualified" | "pending" | "not_qualified"

export type ProfileRecoveryInput = {
  profileIdentified: boolean
  incidentIdentified: boolean
  baselineRestrictionRecorded: boolean
  initial: CheckState | null
  later: CheckState | null
  firstCheckedAt: string | null
  secondCheckedAt: string | null
  originalRestrictionReturned: boolean | null
  whollyUnrelated: boolean
}

export function profileRecoveryVerdict(input: ProfileRecoveryInput): OutcomeVerdict {
  if (!input.profileIdentified || !input.incidentIdentified || !input.baselineRestrictionRecorded) return "pending"
  if (input.whollyUnrelated) return "not_qualified"
  if (input.initial === null || input.later === null || input.originalRestrictionReturned === null) return "pending"
  if (input.initial === "unknown" || input.later === "unknown") return "pending"
  if (!input.firstCheckedAt || !input.secondCheckedAt) return "pending"
  if (!verificationWindowSatisfied(input.firstCheckedAt, input.secondCheckedAt)) return "pending"
  if (input.originalRestrictionReturned) return "not_qualified"
  if (input.initial === "restored" && input.later === "restored") return "qualified"
  return "not_qualified"
}

export type ReviewObservation = "absent" | "present" | "hidden" | "rating_changed" | "acknowledged" | "reported_only" | "unknown"

export type ReviewRemovalInput = {
  reviewIdentified: boolean
  baselineRecorded: boolean
  initial: ReviewObservation | null
  later: ReviewObservation | null
  firstCheckedAt: string | null
  secondCheckedAt: string | null
  sameReviewReturned: boolean | null
  differentNewReview: boolean
  whollyUnrelated: boolean
}

export function reviewRemovalVerdict(input: ReviewRemovalInput): OutcomeVerdict {
  if (!input.reviewIdentified || !input.baselineRecorded) return "pending"
  if (input.whollyUnrelated) return "not_qualified"
  if (input.initial === null || input.later === null || input.sameReviewReturned === null) return "pending"
  if (input.initial === "unknown" || input.later === "unknown") return "pending"
  if (input.sameReviewReturned) return "not_qualified"
  if (!input.firstCheckedAt || !input.secondCheckedAt) return "pending"
  if (!verificationWindowSatisfied(input.firstCheckedAt, input.secondCheckedAt)) return "pending"
  if (input.initial === "absent" && input.later === "absent") return "qualified"
  return "not_qualified"
}

export function successFeeObligation(input: {
  serviceOrderId: string
  outcomeKey: string
  existing: ReadonlyArray<{ serviceOrderId: string; outcomeKey: string }>
}) {
  const duplicate = input.existing.some(row => row.serviceOrderId === input.serviceOrderId && row.outcomeKey === input.outcomeKey)
  return duplicate ? "duplicate_refused" as const : "create" as const
}

export type GuidedRefund =
  | { status: "full_refund"; refundMinor: number }
  | { status: "partial_refund"; refundMinor: number; retainedMinor: number }
  | { status: "awaiting_evidence" }

export function guidedRefund(input: {
  feeMinor: number
  substantiveWorkBegun: boolean
  evidencedWorkMinor: number | null
}): GuidedRefund {
  if (!Number.isInteger(input.feeMinor) || input.feeMinor < 0) {
    throw new Error("fee must be a non-negative integer minor unit")
  }
  if (!input.substantiveWorkBegun) return { status: "full_refund", refundMinor: input.feeMinor }
  if (input.evidencedWorkMinor === null) return { status: "awaiting_evidence" }
  if (!Number.isInteger(input.evidencedWorkMinor) || input.evidencedWorkMinor < 0 || input.evidencedWorkMinor > input.feeMinor) {
    throw new Error("evidenced portion must be an integer minor unit within the fee")
  }
  return {
    status: "partial_refund",
    refundMinor: input.feeMinor - input.evidencedWorkMinor,
    retainedMinor: input.evidencedWorkMinor,
  }
}

export function collectionOfDisputedAmount(genuinelyDisputed: boolean) {
  return genuinelyDisputed ? "paused" as const : "collectable" as const
}

export function quoteAcceptanceBlockedByTax(behaviour: string) {
  return behaviour === "UNCONFIRMED"
}

export type Presentment = {
  catalogueCurrency: "GBP"
  catalogueAmountMinor: number
  presentedCurrency: string | null
  presentedAmountMinor: number | null
  disclosedBeforePayment: boolean
}

/** Local-currency presentment is allowed only when the customer has seen the final amount. GBP stays the catalogue amount. */
export function presentmentReady(input: Presentment) {
  if (input.catalogueCurrency !== "GBP" || !Number.isInteger(input.catalogueAmountMinor)) return false
  if (input.presentedCurrency === null || input.presentedAmountMinor === null) return false
  if (!/^[A-Z]{3}$/.test(input.presentedCurrency) || !Number.isInteger(input.presentedAmountMinor)) return false
  return input.disclosedBeforePayment
}
