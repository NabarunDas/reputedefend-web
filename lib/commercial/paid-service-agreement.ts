/**
 * COM-12A review-only draft of the B2B paid-service agreement.
 *
 * The canonical body below is customer-facing contract wording. Status,
 * solicitor-approval flags, the database tax gate and the content hash are
 * metadata in this module. They are not part of the body. The body is frozen
 * for this version: it does not read marketing prices or FAQ copy. A wording
 * change needs a new version and a new SHA-256. This module is not shown to
 * customers, it is not written into agreement_versions, and it does not make
 * acceptance actionable.
 */
import { createHash } from "node:crypto"

export const PAID_SERVICE_AGREEMENT_VERSION = "PS-2026-10-14.2"
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
  /** Proposed clause 16 language. Approval is not given by including the clause in the draft. */
  liabilityCap: {
    wording: "the greater of £1,000 or twice the fee for that service order",
    solicitorApproval: false,
  },
  /** Proposed clause 19. Not a decision for customers outside England and Wales. */
  governingLaw: {
    proposed: "England and Wales",
    courts: "England and Wales",
    solicitorApproval: false,
  },
} as const

export const solicitorReviewOpen = [
  "the whole of this version",
  "whether the liability cap is reasonable",
  "consumer misclassification",
  "international customers and jurisdiction",
  "professional indemnity",
  "privacy and data-processing terms",
] as const

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

/** Frozen catalogue for this version. Tests compare these figures with the published prices. */
export const catalogueAmounts = {
  guidedRelaunch: { name: "Guided Relaunch", price: "£99", minor: 9900, when: "upfront" },
  guidedReview: { name: "Guided Review", price: "£59", minor: 5900, when: "upfront" },
  managedProfileRecovery: { name: "Managed Profile Recovery", price: "£299", minor: 29900, when: "success fee" },
  managedReviewProtection: { name: "Managed Review Protection", price: "£149", minor: 14900, when: "success fee" },
  relaunchGuard: { name: "Relaunch Guard", price: "£9.99", minor: 999, when: "per month per location" },
} as const

function section(title: string, paragraphs: string[]) {
  return [`## ${title}`, ...paragraphs].join("\n\n")
}

export const paidServiceAgreementBody = [
  "ProfileRelaunch Ltd — Paid-service agreement",
  `Version ${PAID_SERVICE_AGREEMENT_VERSION}`,
  `This agreement is between ProfileRelaunch Ltd (company number 17520826), a company registered in England and Wales and incorporated on 14 October 2026, whose registered office is 71–75 Shelton Street, Covent Garden, London, WC2H 9JQ, United Kingdom, trading as ProfileRelaunch ("we", "us"), and the business named in the quotation that accepts this version ("you"). Notices to us under this agreement go to contact@profilerelaunch.com.`,
  section("1. Formation", [
    "A paid-service contract is formed only when we have given you a quotation that names the service, the Business Profile or review, the price and this version, and you have accepted that quotation and this version.",
    "Using the website, sending an enquiry, or reading a published price does not accept this agreement and does not create a paid-service contract. The website terms govern use of the website. They are not this agreement. For the paid service, this agreement and the accepted quotation prevail if they conflict with the website terms.",
    "This version applies only to a quotation you accept under it. It does not change an agreement you have already accepted under another version. We may withdraw a quotation that you have not yet accepted.",
  ]),
  section("2. Authority", [
    "The person who accepts the quotation does so for you. You confirm that you are obtaining the service for the purposes of your business, and that the person accepting is authorised to bind you and to instruct us about the Business Profile and reviews named in the quotation. You will tell us promptly if that authority ends.",
    "If, despite that confirmation, you are contracting as a consumer, nothing in this agreement removes a right that the law does not allow us to exclude or limit.",
  ]),
  section("3. Services", [
    "The accepted quotation states which services you have ordered. We provide only those services.",
    "Guided Relaunch and Guided Review are support we carry out for you for a fee payable upfront. Managed Profile Recovery and Managed Review Protection are success-fee services. The success fee becomes payable only when the success criteria in this agreement are met for the incident named in the quotation. Relaunch Guard is monthly monitoring for each location named in the quotation.",
    "We are independent of Google. We do not control Google's systems, decisions or timescales. Completing the agreed work is distinct from a decision by Google. Delivering the agreed work is not a promise that Google will reinstate a profile or remove a review, or that a restored profile or removed review will remain in that state after the checks this agreement describes.",
  ]),
  section("4. Prices and currency", [
    "The prices are in pounds sterling (GBP). Unless the accepted quotation states a different price:",
    "Guided Relaunch is £99 upfront. Guided Review is £59 upfront. Managed Profile Recovery is a success fee of £299. Managed Review Protection is a success fee of £149. Relaunch Guard is £9.99 per month per location.",
    "The price on the accepted quotation is the price for that order, including a discount we have already agreed in writing for that order.",
    "Where Stripe supports presenting the charge in another currency, we show you the final currency and the amount before you pay. The GBP amount on the quotation remains the authoritative amount. We do not guarantee a particular conversion rate.",
  ]),
  section("5. Guided Relaunch and Guided Review", [
    "A Guided fee is payable upfront only after you have accepted a valid quotation and this agreement.",
    "You may cancel before substantive case-specific work begins and receive a full refund of the upfront fee.",
    "After substantive case-specific work begins, we may retain only a fair portion of the fee attributable to work already performed. That portion must be evidenced. We will not deduct an amount we cannot evidence. We will refund the remainder.",
    "Google's decision does not, by itself, prove the work was deficient. These terms do not exclude legal remedies for deficient work.",
  ]),
  section("6. Managed Profile Recovery", [
    "The success fee is £299 unless the accepted quotation states another price. The quotation identifies the exact Business Profile and the incident. We record the baseline restriction before relying on it for the fee.",
    "The fee is earned only when the original restriction is absent at an initial check and again at a second check at least 48 hours later, and the original restriction is not known to have returned between those checks.",
    "An unrelated new issue after that verified outcome does not invalidate the completed service. We charge no success fee for an outcome known to be wholly unrelated to work you authorised.",
    "The two checks are two recorded observations. They are not uninterrupted surveillance. If an observation is missing, unknown or ambiguous, or the checks are less than 48 hours apart, the outcome stays pending. A pending outcome is not invoiced as success.",
  ]),
  section("7. Managed Review Protection", [
    "The success fee is £149 unless the accepted quotation states another price. The quotation identifies the exact original review through the stable identifiers and baseline evidence then available.",
    "The fee is earned only when that specified review is absent at two checks at least 48 hours apart. Evidence that the same review returned during that period means that verification attempt has not succeeded.",
    "A different new negative review is a separate incident and does not invalidate success for the specified review. Reporting, hiding, a rating change, or an acknowledgement is not by itself a successful removal.",
    "We charge no success fee for a removal known to be wholly unrelated to the authorised work. The two checks are not uninterrupted surveillance. A missing, unknown or ambiguous observation stays pending and is not invoiced as success.",
  ]),
  section("8. Your obligations", [
    "You will give us accurate information about the business, the profile and the reviews, and the access the accepted service needs. Where the service needs access to a Business Profile, you add us as a Manager. You remain the owner. We do not need your Google password or access to your email account.",
    "You will not ask us to do anything unlawful. You confirm that you are entitled to instruct us about the profile and reviews named in the quotation. You will read a deliverable within a reasonable time and tell us about an error you could reasonably be expected to notice.",
    "You remain responsible for your Business Profile, for what you publish, and for the decisions you take after we have explained a recommendation.",
  ]),
  section("9. Our obligations", [
    "We will perform the accepted service with reasonable care and skill, keep you informed of material progress, and record the observations we rely on for a fee.",
    "We may use trained staff and contractors. We remain responsible to you for the accepted service.",
    "We may refuse or stop work that we reasonably believe would be unlawful or would mislead Google or the public. If we stop Guided work for that reason before it is complete, section 5 applies to the fee. A Managed success fee is not payable for work stopped on that ground unless the success criteria were already met.",
  ]),
  section("10. Evidence, duplicate fees and disputes", [
    "We record both verification timestamps and the observations that support them.",
    "There is no second success-fee obligation for the same service order and the same verified outcome.",
    "You may dispute the claimed outcome in writing before the invoice falls due. Tell us what you dispute and why. Collection of a genuinely disputed amount pauses while we review that dispute against the recorded checks. Pausing collection is not an admission, and it does not remove a remedy for deficient work. We will tell you the result of the review. An amount that is not genuinely disputed remains payable.",
  ]),
  section("11. Payment", [
    "Guided fees are paid upfront, and only once you have accepted a valid quotation and this agreement.",
    "Managed fees are invoiced only after documented success. You will pay an undisputed invoice within 14 calendar days. There is no automatic card charge for a Managed success fee and no collection of that fee in advance.",
    "Any charge in a currency other than GBP is made only after the currency and amount have been shown to you, as section 4 describes.",
  ]),
  section("12. Tax", [
    "We are not registered for VAT. We do not add VAT while that remains the case. This is not a statement that a supply is zero-rated or exempt.",
    "If tax on a supply to you has to be confirmed before payment, we will tell you that treatment and the amount before you pay.",
  ]),
  section("13. Relaunch Guard", [
    "Relaunch Guard is £9.99 per month per location named in the accepted quotation.",
    "Monitoring for a location starts only after you have accepted the Guard order for that location, we have confirmed the access we asked for, and we have completed the initial check. Sending a setup form does not start monitoring and does not take payment.",
    "Our team carries out the checks manually, twice each day, including weekends and bank holidays, using a Europe/London schedule, and we email you if a check needs your attention. The checks are planned observations. They are not a promise of continuous monitoring, of a response within a stated number of minutes, or that a suspension or a review will be prevented.",
    "After successful Managed Profile Recovery, you can choose 30 days of Guard for the restored location at no extra charge. The 30 days start when monitoring is activated. We’ll remind you before the period ends. Continuing at £9.99 per month is your choice; we won’t automatically start charging you. The paid-member discount does not apply during this included period.",
    "Contact us to cancel. There is no cancellation fee. Normally, monitoring continues until the end of your paid month and does not renew. If you ask us to stop immediately, we return the unused portion of that month. A separately agreed recovery or review case continues under its own terms.",
    "While paid Guard monitoring is active for a location, you receive 20% off our standard Managed Profile Recovery and Managed Review Protection fees for an eligible new issue at that location. The issue must arise while that paid monitoring is active. A problem that already existed when monitoring started is excluded. The discount does not apply to Guided support, to Guard fees, or to a custom or bulk quotation, and it cannot be combined with another offer. Once we agree a discounted fee for a case, cancelling Guard does not remove that discount. Managed fees still depend on the successful outcome agreed for that case.",
  ]),
  section("14. Confidentiality and personal information", [
    "Each of us will keep the other's confidential information confidential and use it only to perform or receive the service, to administer the contract, or where the law requires. Information is not confidential if it is public through no fault of the party receiving it, or if that party already knew it free of a duty of confidence.",
    "Our privacy notice explains how we handle personal information. The notice does not replace this clause.",
  ]),
  section("15. Intellectual property", [
    "We keep the intellectual property in our methods, templates and know-how. You keep the intellectual property in the information and materials you supply.",
    "When you have paid the fees due for a deliverable, you may use that deliverable for your own business. You may not resell our methods or hold them out as a service of your own.",
    "We will not publish your name, your profile or the outcome of your case as an example unless you agree in writing.",
  ]),
  section("16. Liability", [
    "Nothing in this agreement limits or excludes liability for death or personal injury caused by negligence, liability for fraud or fraudulent misrepresentation, or any other liability that cannot legally be limited or excluded.",
    "Subject to that, our total liability to you arising out of a service order, whether in contract, tort (including negligence) or otherwise, will not exceed the greater of £1,000 or twice the fee for that service order.",
    "Subject to the liabilities that cannot legally be limited or excluded, we are not liable for loss of profit or loss of goodwill, except so far as that loss is a foreseeable result of our failure to perform the accepted service with reasonable care and skill. A decision by Google is not, by itself, that failure.",
  ]),
  section("17. Complaints", [
    "Write to contact@profilerelaunch.com, describe the order and what you would like us to do, and we will review the complaint against the record of the service. This does not remove any right to bring a claim.",
  ]),
  section("18. Termination", [
    "You may end a service before substantive case-specific work begins. A Guided fee already paid is then refunded in full under section 5. You may cancel Relaunch Guard under section 13.",
    "Either of us may end a service order by written notice if the other materially breaks this agreement and does not put the breach right within 14 days of a notice asking for it to be put right, or if the other cannot pay its debts as they fall due.",
    "Ending one service order does not end a different service order. Clauses that should continue after the service ends, including clauses on sums already earned, confidentiality, intellectual property, liability and governing law, continue to apply.",
  ]),
  section("19. Governing law and disputes", [
    "This agreement, and any dispute or claim arising out of it or in connection with it, is governed by the law of England and Wales. The courts of England and Wales have jurisdiction over that dispute.",
    "Those choices do not remove a right, which the law does not allow us to take away, to bring proceedings in another court.",
    "A dispute about whether a Managed outcome met the success criteria is first handled under section 10. Either of us may still bring a claim.",
  ]),
  section("20. Other terms", [
    "We will change this agreement for an order you have already accepted only by agreeing a new version with you. A change of our published prices or website wording does not change a version you have already accepted.",
    "If a court holds that part of this agreement cannot be enforced, the rest of it still applies. If we delay in using a right, that delay is not a waiver of the right.",
    "This agreement and the accepted quotation are the whole agreement between us for the paid service they describe. They replace earlier discussions about that service. They do not limit liability for fraud or fraudulent misrepresentation.",
    "A person who is not a party has no right under the Contracts (Rights of Third Parties) Act 1999 to enforce this agreement.",
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
