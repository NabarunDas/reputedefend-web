/**
 * CUSTOMER-QUOTE-01 proposed service agreements.
 *
 * These bodies are immutable proposals. They are not PS-2026-10-14.2, they do
 * not replace its hash, and they are not written into agreement_versions.
 * Each one stays unapproved: not operative, not customer-visible, and not
 * acceptance-actionable. A later solicitor approval and a separate migration
 * are required before a new quotation may bind one. An issued quotation keeps
 * the agreement version already stored on it.
 */
import { createHash } from "node:crypto"

export const PROPOSED_SERVICE_AGREEMENT_STATUS = "SOLICITOR_REVIEW" as const

export const proposedServiceAgreementVersions = {
  GUIDED_RELAUNCH: "PS-2026-10-21.GR",
  GUIDED_REVIEW: "PS-2026-10-21.GV",
  MANAGED_RELAUNCH: "PS-2026-10-21.MR",
  MANAGED_REVIEW: "PS-2026-10-21.MV",
  RELAUNCH_GUARD: "PS-2026-10-21.GD",
} as const

const parties = `This agreement is between ProfileRelaunch Ltd (company number 17520826), a company registered in England and Wales and incorporated on 14 October 2026, whose registered office is 71–75 Shelton Street, Covent Garden, London, WC2H 9JQ, United Kingdom, trading as ProfileRelaunch ("we", "us"), and the business named in the quotation that accepts this version ("you"). Notices to us under this agreement go to contact@profilerelaunch.com.`

function section(title: string, paragraphs: string[]) {
  return [`## ${title}`, ...paragraphs].join("\n\n")
}

const formation = section("1. Formation", [
  "A contract for the service named in this agreement is formed only when we have given you a quotation that names that service, the Business Profile or review, the price and this version, and you have accepted that quotation and this version.",
  "Using the website, sending an enquiry, or reading a published price does not accept this agreement and does not create a contract. The website terms govern use of the website. They are not this agreement. For this service, this agreement and the accepted quotation prevail if they conflict with the website terms.",
  "This version applies only to a quotation you accept under it. It does not change an agreement you have already accepted under another version. We may withdraw a quotation that you have not yet accepted.",
])

const authority = section("2. Authority", [
  "The person who accepts the quotation does so for you. You confirm that you are obtaining the service for the purposes of your business, and that the person accepting is authorised to bind you and to instruct us about the Business Profile and reviews named in the quotation. You will tell us promptly if that authority ends.",
  "If, despite that confirmation, you are contracting as a consumer, nothing in this agreement removes a right that the law does not allow us to exclude or limit.",
])

const confidentiality = section("8. Confidentiality and personal information", [
  "Each of us will keep the other's confidential information confidential and use it only to perform or receive the service, to administer the contract, or where the law requires. Information is not confidential if it is public through no fault of the party receiving it, or if that party already knew it free of a duty of confidence.",
  "Our privacy notice explains how we handle personal information. The notice does not replace this clause.",
])

const intellectualProperty = section("9. Intellectual property", [
  "We keep the intellectual property in our methods, templates and know-how. You keep the intellectual property in the information and materials you supply.",
  "When you have paid the fees due for a deliverable, you may use that deliverable for your own business. You may not resell our methods or hold them out as a service of your own.",
  "We will not publish your name, your profile or the outcome of your case as an example unless you agree in writing.",
])

const liability = section("10. Liability", [
  "Nothing in this agreement limits or excludes liability for death or personal injury caused by negligence, liability for fraud or fraudulent misrepresentation, or any other liability that cannot legally be limited or excluded.",
  "Subject to that, our total liability to you arising out of a service order, whether in contract, tort (including negligence) or otherwise, will not exceed the greater of £1,000 or twice the fee for that service order.",
  "Subject to the liabilities that cannot legally be limited or excluded, we are not liable for loss of profit or loss of goodwill, except so far as that loss is a foreseeable result of our failure to perform the accepted service with reasonable care and skill. A decision by Google is not, by itself, that failure.",
])

const complaints = section("11. Complaints", [
  "Write to contact@profilerelaunch.com, describe the order and what you would like us to do, and we will review the complaint against the record of the service. This does not remove any right to bring a claim.",
])

const governingLaw = section("13. Governing law", [
  "This agreement, and any dispute or claim arising out of it or in connection with it, is governed by the law of England and Wales. The courts of England and Wales have jurisdiction over that dispute.",
  "Those choices do not remove a right, which the law does not allow us to take away, to bring proceedings in another court.",
])

const otherTerms = section("14. Other terms", [
  "We will change this agreement for an order you have already accepted only by agreeing a new version with you. A change of our published prices or website wording does not change a version you have already accepted.",
  "If a court holds that part of this agreement cannot be enforced, the rest of it still applies. If we delay in using a right, that delay is not a waiver of the right.",
  "This agreement and the accepted quotation are the whole agreement between us for the service they describe. They replace earlier discussions about that service. They do not limit liability for fraud or fraudulent misrepresentation.",
  "A person who is not a party has no right under the Contracts (Rights of Third Parties) Act 1999 to enforce this agreement.",
])

const taxSentences = [
  "We are not registered for VAT. We do not add VAT while that remains the case. This is not a statement that a supply is zero-rated or exempt.",
  "The price on the accepted quotation is the price for this order, including a discount we have already agreed in writing for this order. The price is in pounds sterling (GBP). The GBP amount on the quotation is the authoritative amount.",
  "If tax on a supply to you has to be confirmed before payment, we will tell you that treatment and the amount before you pay.",
]

const guidedCustomer = [
  "You will give us accurate information about the business, the profile and the reviews named in the quotation.",
  "You submit the prepared work to Google yourself. This service does not require you to add us as a Manager. We do not ask for your Google password or access to your email account.",
  "You will not ask us to do anything unlawful. You confirm that you are entitled to instruct us about the profile and reviews named in the quotation. You will read a deliverable within a reasonable time and tell us about an error you could reasonably be expected to notice.",
  "You remain responsible for your Business Profile, for what you publish, and for the decisions you take after we have explained a recommendation.",
]

const accessCustomer = [
  "You will give us accurate information about the business, the profile and the reviews named in the quotation, and the access this service needs.",
  "Where this service needs access to a Business Profile, you add us as a Manager. You remain the owner. We do not need your Google password or access to your email account.",
  "You will not ask us to do anything unlawful. You confirm that you are entitled to instruct us about the profile and reviews named in the quotation. You will read a deliverable within a reasonable time and tell us about an error you could reasonably be expected to notice.",
  "You remain responsible for your Business Profile, for what you publish, and for the decisions you take after we have explained a recommendation.",
]

function guidedService(name: string, work: string) {
  return section("3. The service", [
    `The service under this agreement is ${name}. We provide only that service for the Business Profile or review named in the accepted quotation.`,
    work,
    "We are independent of Google. We do not control Google's systems, decisions or timescales. Completing the agreed work is distinct from a decision by Google. Delivering the agreed work is not a promise that Google will reinstate a profile or remove a review.",
  ])
}

function guidedPrice(price: string) {
  return section("4. Price and payment", [
    `The price is ${price} unless the accepted quotation states a different price. It is due after you accept the quotation and before work begins.`,
    "Accepting the quotation does not take payment. Payment is a later step.",
    ...taxSentences,
  ])
}

const guidedCancellation = section("5. Cancellation and refunds", [
  "You may cancel before substantive case-specific work begins and receive a full refund of the fee you have paid.",
  "After substantive case-specific work begins, we may retain only a fair portion of the fee attributable to work already performed. That portion must be evidenced. We will not deduct an amount we cannot evidence. We will refund the remainder.",
  "Google's decision does not, by itself, prove the work was deficient. These terms do not exclude legal remedies for deficient work.",
])

function guidedDuties(work: string) {
  return [
    section("6. Your responsibilities", guidedCustomer),
    section("7. Our responsibilities", [
      "We will perform this service with reasonable care and skill and keep you informed of material progress.",
      work,
      "We may use trained staff and contractors. We remain responsible to you for this service.",
      "We may refuse or stop work that we reasonably believe would be unlawful or would mislead Google or the public. If we stop before the work is complete, the cancellation and refund terms in this agreement apply to the fee.",
    ]),
  ]
}

const guidedEnding = section("12. Ending the service", [
  "You may end this service before substantive case-specific work begins. A fee already paid is then refunded in full under the cancellation and refund terms in this agreement.",
  "Either of us may end the service by written notice if the other materially breaks this agreement and does not put the breach right within 14 days of a notice asking for it to be put right, or if the other cannot pay its debts as they fall due.",
  "Clauses that should continue after the service ends, including clauses on sums already earned, confidentiality, intellectual property, liability and governing law, continue to apply.",
])

const managedEnding = section("12. Ending the service", [
  "No success fee is payable for work that ends before the success fee is earned, unless it had already been earned under this agreement.",
  "Either of us may end the service by written notice if the other materially breaks this agreement and does not put the breach right within 14 days of a notice asking for it to be put right, or if the other cannot pay its debts as they fall due.",
  "Clauses that should continue after the service ends, including clauses on sums already earned, confidentiality, intellectual property, liability and governing law, continue to apply.",
])

const guardEnding = section("12. Ending the service", [
  "You may cancel monitoring under the cancellation terms in this agreement. There is no cancellation fee.",
  "Either of us may end the service by written notice if the other materially breaks this agreement and does not put the breach right within 14 days of a notice asking for it to be put right, or if the other cannot pay its debts as they fall due.",
  "Ending monitoring does not end a different service order. Clauses that should continue after the service ends, including clauses on sums already earned, confidentiality, intellectual property, liability and governing law, continue to apply.",
])

function compile(version: string, parts: string[], ending: string) {
  return [
    "ProfileRelaunch Ltd — Paid-service agreement",
    `Version ${version}`,
    parties,
    formation,
    authority,
    ...parts,
    confidentiality,
    intellectualProperty,
    liability,
    complaints,
    ending,
    governingLaw,
    otherTerms,
  ].join("\n\n")
}

const guidedRelaunchBody = compile(proposedServiceAgreementVersions.GUIDED_RELAUNCH, [
  guidedService(
    "Guided Relaunch",
    "We organise the evidence and prepare the profile relaunch work for the location named in the quotation. You remain the person who files it with Google. We do not submit that work for you.",
  ),
  guidedPrice("£99"),
  guidedCancellation,
  ...guidedDuties("We prepare the profile relaunch work. We do not submit it to Google for you."),
], guidedEnding)

const guidedReviewBody = compile(proposedServiceAgreementVersions.GUIDED_REVIEW, [
  guidedService(
    "Guided Review",
    "We organise the evidence and prepare the review work named in the quotation. You remain the person who files it with Google. We do not submit that work for you.",
  ),
  guidedPrice("£59"),
  guidedCancellation,
  ...guidedDuties("We prepare the review work. We do not submit it to Google for you."),
], guidedEnding)

const managedRelaunchBody = compile(proposedServiceAgreementVersions.MANAGED_RELAUNCH, [
  section("3. The service", [
    "The service under this agreement is Managed Profile Recovery for the Business Profile and incident named in the accepted quotation. We provide only that service.",
    "We carry out the authorised work. You are not left to assemble and submit it alone.",
    "We are independent of Google. We do not control Google's systems, decisions or timescales. Completing the agreed work is distinct from a decision by Google. Delivering the agreed work is not a promise that Google will reinstate a profile, or that a restored profile will remain in that state.",
  ]),
  section("4. Price and when the fee is earned", [
    "The price is a success fee of £299 unless the accepted quotation states a different price. The quotation identifies the exact Business Profile and the incident. We record the baseline restriction before relying on it for the fee.",
    "The success fee is earned only when the original restriction is absent at an initial check and again at a second check at least 48 hours later, and the original restriction is not known to have returned between those checks.",
    "An unrelated new issue after that verified outcome does not invalidate the completed service. We charge no success fee for an outcome known to be wholly unrelated to work you authorised.",
    "The two checks are two recorded observations. They are not uninterrupted surveillance. If an observation is missing, unknown or ambiguous, or the checks are less than 48 hours apart, the outcome stays pending. A pending outcome is not invoiced.",
    "There is no second success-fee obligation for the same service order and the same verified outcome.",
    ...taxSentences,
  ]),
  section("5. Invoice, dispute and payment", [
    "The success fee is invoiced only after the documented outcome in section 4. You will pay an undisputed invoice within 14 calendar days. There is no automatic card charge and no collection of that success fee in advance.",
    "Accepting the quotation does not create an invoice and does not take payment.",
    "You may dispute the claimed outcome in writing before the invoice falls due. Tell us what you dispute and why. Collection of a genuinely disputed amount pauses while we review that dispute against the recorded checks. Pausing collection is not an admission, and it does not remove a remedy for deficient work. We will tell you the result of the review. An amount that is not genuinely disputed remains payable.",
  ]),
  section("6. Your responsibilities", accessCustomer),
  section("7. Our responsibilities", [
    "We will perform this service with reasonable care and skill, keep you informed of material progress, and record the observations we rely on for the success fee.",
    "We may use trained staff and contractors. We remain responsible to you for this service.",
    "We may refuse or stop work that we reasonably believe would be unlawful or would mislead Google or the public. The success fee is not payable for work stopped on that ground unless it had already been earned under section 4.",
  ]),
], managedEnding)

const managedReviewBody = compile(proposedServiceAgreementVersions.MANAGED_REVIEW, [
  section("3. The service", [
    "The service under this agreement is Managed Review Protection for the original review named in the accepted quotation. We provide only that service.",
    "The quotation identifies that review through the stable identifiers and baseline evidence then available. We carry out the authorised work. You are not left to assemble and submit it alone.",
    "We are independent of Google. We do not control Google's systems, decisions or timescales. Reporting, hiding, a rating change, or an acknowledgement is not by itself removal of the specified review.",
  ]),
  section("4. Price and when the fee is earned", [
    "The price is a success fee of £149 unless the accepted quotation states a different price.",
    "The success fee is earned only when that specified review is absent at two checks at least 48 hours apart. Evidence that the same review returned during that period means that verification attempt has not succeeded.",
    "A different new negative review is a separate incident and does not invalidate the outcome for the specified review.",
    "We charge no success fee for a removal known to be wholly unrelated to the authorised work. The two checks are not uninterrupted surveillance. A missing, unknown or ambiguous observation stays pending and is not invoiced.",
    "There is no second success-fee obligation for the same service order and the same verified outcome.",
    ...taxSentences,
  ]),
  section("5. Invoice, dispute and payment", [
    "The success fee is invoiced only after the documented outcome in section 4. You will pay an undisputed invoice within 14 calendar days. There is no automatic card charge and no collection of that success fee in advance.",
    "Accepting the quotation does not create an invoice and does not take payment.",
    "You may dispute the claimed outcome in writing before the invoice falls due. Tell us what you dispute and why. Collection of a genuinely disputed amount pauses while we review that dispute against the recorded checks. Pausing collection is not an admission, and it does not remove a remedy for deficient work. We will tell you the result of the review. An amount that is not genuinely disputed remains payable.",
  ]),
  section("6. Your responsibilities", accessCustomer),
  section("7. Our responsibilities", [
    "We will perform this service with reasonable care and skill, keep you informed of material progress, and record the observations we rely on for the success fee.",
    "We may use trained staff and contractors. We remain responsible to you for this service.",
    "We may refuse or stop work that we reasonably believe would be unlawful or would mislead Google or the public. The success fee is not payable for work stopped on that ground unless it had already been earned under section 4.",
  ]),
], managedEnding)

const guardBody = compile(proposedServiceAgreementVersions.RELAUNCH_GUARD, [
  section("3. The service", [
    "The service under this agreement is Relaunch Guard for each location named in the accepted quotation. We provide only that monitoring service.",
    "Our team carries out the checks manually, twice each day, including weekends and bank holidays, using a Europe/London schedule, and we email you if a check needs your attention.",
    "The checks are planned observations. They are not a promise of continuous monitoring, of a response within a stated number of minutes, or that a suspension or a review will be prevented.",
    "We are independent of Google. We do not control Google's systems, decisions or timescales.",
  ]),
  section("4. Price and when monitoring starts", [
    "The price is £9.99 per month per location named in the accepted quotation, unless that quotation states a different price.",
    "Monitoring for a location starts only after you have accepted this quotation for that location, we have confirmed the access we asked for, and we have completed the initial check. Sending a setup form does not start monitoring and does not take payment.",
    "Accepting this quotation does not start monitoring and does not take payment.",
    ...taxSentences,
  ]),
  section("5. Included period, cancellation and a later case", [
    "After a Managed Profile Recovery that has already met its own agreed outcome, you can choose 30 days of Relaunch Guard for the restored location at no extra charge. The 30 days start when monitoring is activated. We will remind you before the period ends. Continuing at the monthly price in this agreement is your choice. We will not automatically start charging you.",
    "Contact us to cancel. There is no cancellation fee. Normally, monitoring continues until the end of your paid month and does not renew. If you ask us to stop immediately, we return the unused portion of that month.",
    "While paid monitoring is active for a location, you receive 20% off the standard fee for an eligible new Managed Profile Recovery or Managed Review Protection case at that location. The issue must arise while that paid monitoring is active. A problem that already existed when monitoring started is excluded. The reduction does not apply to the monitoring fee, or to a custom or bulk quotation, and it cannot be combined with another offer. Once we agree a reduced fee for a case, cancelling monitoring does not remove that reduction. That later case is a separate quotation, and its fee still depends on the outcome agreed in that quotation.",
  ]),
  section("6. Your responsibilities", accessCustomer),
  section("7. Our responsibilities", [
    "We will perform the checks described in this agreement with reasonable care and skill and email you if a check needs your attention.",
    "We may use trained staff and contractors. We remain responsible to you for this service.",
    "We may refuse or stop a check that we reasonably believe would be unlawful or would mislead Google or the public.",
  ]),
], guardEnding)

export type ProposedServiceCode = keyof typeof proposedServiceAgreementVersions

export type ProposedServiceAgreement = {
  serviceCode: ProposedServiceCode
  version: string
  status: typeof PROPOSED_SERVICE_AGREEMENT_STATUS
  operative: false
  customerVisible: false
  acceptanceActionable: false
  solicitorReviewComplete: false
  body: string
  contentHash: string
}

function propose(serviceCode: ProposedServiceCode, body: string): ProposedServiceAgreement {
  return {
    serviceCode,
    version: proposedServiceAgreementVersions[serviceCode],
    status: PROPOSED_SERVICE_AGREEMENT_STATUS,
    operative: false,
    customerVisible: false,
    acceptanceActionable: false,
    solicitorReviewComplete: false,
    body,
    contentHash: createHash("sha256").update(body, "utf8").digest("hex"),
  }
}

export const proposedServiceAgreements: readonly ProposedServiceAgreement[] = [
  propose("GUIDED_RELAUNCH", guidedRelaunchBody),
  propose("GUIDED_REVIEW", guidedReviewBody),
  propose("MANAGED_RELAUNCH", managedRelaunchBody),
  propose("MANAGED_REVIEW", managedReviewBody),
  propose("RELAUNCH_GUARD", guardBody),
]

export function proposedServiceAgreement(serviceCode: string): ProposedServiceAgreement | null {
  return proposedServiceAgreements.find(item => item.serviceCode === serviceCode) ?? null
}

/** A proposed version cannot be accepted. Approval requires a later catalogue migration. */
export function proposedAgreementAcceptanceClosed(version: string, hash: string): boolean {
  return proposedServiceAgreements.some(item => item.version === version || item.contentHash === hash)
}
