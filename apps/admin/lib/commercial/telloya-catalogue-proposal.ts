/**
 * Telloya commercial catalogue proposal.
 *
 * Basic, Growth and Pro prices stay at the owner-approved amounts. The
 * operating-location and receptionist-number policy is owner-approved.
 * The customer agreement, tax treatment, unused-minute rollover, cancellation
 * and refund terms, Custom prices, and hosted catalogue seeding remain open.
 * The installer may copy the draft rows into an isolated database. It must
 * not be run against hosted DEV or Production.
 */

export const telloyaDraftMarker = "DRAFT — NOT A LEGAL AGREEMENT."

export const telloyaCatalogueProposal = {
  currency: "GBP" as const,
  billingCadence: "MONTH" as const,
  standardSetup: "included" as const,
  complexSetup: "quoted separately" as const,
  internationalCustomers: "supported" as const,
  prices: {
    basicMinor: 4900,
    basicMinutes: 120,
    growthMinor: 7900,
    growthMinutes: 300,
    proMinor: 12000,
    proMinutes: 500,
    guardLocationMinor: 999,
    overagePerMinuteMinor: 25,
  },
} as const

/**
 * Owner-approved on 2026-11-06. Basic, Growth and Pro each include one
 * Telloya operating location and one receptionist telephone number.
 */
export const telloyaLocationPolicy = {
  status: "APPROVED" as const,
  approvedOn: "2026-11-06",
  standardLocations: 1,
  standardNumbers: 1,
  selectedAlternative: "one-location-standard",
  customHandling:
    "Multiple Telloya operating locations and receptionist numbers require a separately approved Custom quotation. The quotation names the location quantity, the receptionist-number quantity, and the price. The current commands give one receptionist number to each entitled operating location, so the number quantity is the location quantity. A quotation that asks for more numbers than locations has no representation in the current commands.",
  guard:
    "Optional Relaunch Guard costs 999 minor units per confirmed paid Guard location per month. A Guard-only location does not receive a receptionist entitlement, a telephone number, or voice routing.",
  duplicateSubscriptions:
    "One business cannot hold a second occupying Telloya subscription. A second open voice onboarding request cannot attach to that business, and a second ACTIVE, PAUSED, PAST_DUE, or CANCEL_AT_PERIOD_END subscription is rejected.",
  alternatives: [
    {
      id: "one-location-standard",
      summary: "Basic, Growth and Pro each cover one location and one receptionist number. More locations and numbers need a Custom quotation.",
      impact: "Matches one occupying Telloya subscription per business. The location cap on that subscription is one, and the number allowance is one.",
    },
    {
      id: "several-locations-same-price",
      summary: "A standard tier has several approved versions, one per location cap, at the same monthly price.",
      impact: "The schema allows one current approved version per tier and cap. This alternative was not selected.",
    },
    {
      id: "price-per-location",
      summary: "The monthly Telloya amount is a unit price multiplied by location count.",
      impact: "The plan stores one monthly amount. Only Guard is multiplied. This alternative was not selected.",
    },
    {
      id: "unlimited-locations",
      summary: "A standard plan covers every location the business adds.",
      impact: "An approved Telloya plan must include one Telloya location component. This alternative was not selected.",
    },
  ],
  missingConstraints: [
    {
      id: "number-correction-keeps-previous-reservation",
      summary:
        "A number correction moves the authoritative provider_binding_ref to the new allocation and leaves the previous E.164 reserved. That reservation is deliberate. Another business cannot take it. Releasing it needs a later audited retirement with provider evidence. This phase does not delete the owner row.",
    },
  ],
} as const

/**
 * A local figure for rehearsing a Custom quotation that names two locations
 * and two numbers. It is not a customer price and it is not seeded.
 */
export const telloyaUnapprovedCustomRehearsal = {
  status: "NOT AN APPROVED PRICE" as const,
  locations: 2,
  numbers: 2,
  amountMinor: 25000,
  statement:
    "£250 is a local rehearsal of a Custom quotation for two operating locations and two receptionist numbers. It is not a customer price.",
} as const

/**
 * Tax is undecided. EXCLUSIVE below is only a local placeholder so a draft
 * priced row satisfies the plan shape. The current offer command rejects
 * every tax behaviour other than NOT_APPLICABLE, so this placeholder cannot
 * be offered. NOT_APPLICABLE is not the production tax policy.
 */
export const telloyaTaxDecision = {
  status: "OWNER DECISION REQUIRED" as const,
  productionTaxBehaviour: null,
  localDraftPlaceholder: "EXCLUSIVE" as const,
  statement:
    "An accountant has not chosen inclusive VAT, exclusive VAT, or no VAT. International customers may sit outside UK VAT. The local draft rows use EXCLUSIVE only so they stay unofferable under the current command.",
}

export const telloyaDraftAgreement = {
  versionRef: "TELLOYA-DRAFT-2026-11-1",
  title: "Telloya customer agreement (draft for review)",
  cancellation:
    "DRAFT. Either party may end the subscription at the end of the paid month. This draft does not promise a refund of the current month.",
  confirmations: [
    { key: "business_authority", label: "I can accept this subscription for the business." },
    { key: "recurring_payment", label: "I agree to the monthly GBP price shown on this offer." },
    { key: "forwarding_duty", label: "I will forward calls only when Telloya asks me to." },
  ],
  body: `${telloyaDraftMarker} This text is for the owner and for legal review. It is not approved for a customer. It is not legal advice.

1. Service. Telloya provides an AI receptionist for the locations named on the accepted offer. It answers and handles calls only within the configuration an administrator has recorded. It does not provide legal, medical, or emergency services. ProfileRelaunch case work is a separate service and is not included.

2. Subscription and payment. The subscription is monthly, in GBP, at the amount on the accepted offer. That amount is the tier price plus any Relaunch Guard locations the administrator confirmed. Standard setup is included. Complex setup is quoted separately and is not part of this subscription. Accepting an offer does not start the service and does not create a Stripe subscription by itself. OWNER_APPROVED on 7 November 2026: the subscription renews automatically each month at the accepted amount until the customer cancels.

3. Included minutes. OWNER_APPROVED on 7 November 2026: Basic includes 120 minutes, Growth includes 300 minutes, and Pro includes 500 minutes in each monthly period. Custom minutes come from a separate quotation. A rehearsal Custom figure in this repository is not an approved price. The allowance used for a customer is the accepted subscription snapshot, not a marketing form.

4. Unused minutes. OWNER_APPROVED on 7 November 2026: unused minutes expire at the end of each monthly billing period and do not roll over.

5. Relaunch Guard. Guard is optional. The draft price is £9.99 per location per month, and only for locations an administrator has explicitly confirmed. Interest on an enquiry is not a purchase. Guard monitoring does not start when the subscription is paid.

6. Additional minutes. OWNER_APPROVED on 7 November 2026: additional minutes are £0.25 per minute, and only when the customer has explicitly opted in and accepted a hard spending cap. The cap is not a charge by itself. An enquiry cap does not authorise overage. A customer charge for a partial minute is REVIEW_BEFORE_CHARGE. The proposed calculation rounds provider seconds up to the next whole minute, in integer minor units, and must not exceed the accepted cap. This draft does not create that charge.

7. Numbers and forwarding. Telloya may record a telephone number and forwarding instructions. The customer remains responsible for turning forwarding on at their own telephone provider. Recording those instructions does not enable forwarding and does not make the service live.

8. Data, recordings and privacy. OWNER_APPROVED on 7 November 2026: only a structured lead summary and the caller details needed to act on it are retained. A full transcript and call audio are not retained in ProfileRelaunch. Caller data is not authorised for AI-model training. Lead details and summaries are retained for 90 days, with a deletion or erasure request and a documented legal hold as exceptions. LEGAL_REVIEW_REQUIRED: the published privacy supplement, subprocessors, and international transfers. PROVIDER_VERIFICATION_REQUIRED: the provider data-storage setting and the provider training terms. This draft does not replace a privacy notice.

9. Cancellation and refunds. OWNER_APPROVED on 7 November 2026: the customer may cancel at any time, and cancellation takes effect at the end of the period already paid. There is no automatic pro-rata refund. That rule is subject to applicable law and to a remedy where the service has failed. LEGAL_REVIEW_REQUIRED: any different refund wording.

10. Availability and liability. The service can be unavailable. LEGAL_REVIEW_REQUIRED: a service credit and a liability cap. Those terms are not owner-approved and must be reviewed before any customer sees them.

11. International customers. Customers outside the United Kingdom may subscribe. Prices are stored and billed in GBP. A checkout page may later show a local currency, but that display is not a second price and it is not approved here. Tax for those customers is not decided.

12. Status of this document. ${telloyaDraftMarker} The OWNER_APPROVED sentences above are commercial rules recorded on 7 November 2026. They do not make this Telloya Service Agreement legally approved. Do not present it to a customer. Do not publish it. Do not insert a hosted agreement row. Do not copy it into hosted DEV until legal review approves a later version.`,
} as const

/** Commercial rules the owner approved on 7 November 2026. This is not legal approval of the service agreement. */
export const telloyaOwnerApprovedPolicy = {
  status: "OWNER_APPROVED" as const,
  approvedOn: "2026-11-07",
  seller: "ProfileRelaunch Ltd",
  source: "apps/telloya/lib/pricing.ts",
  plans: {
    basic: { amountMinor: 4900, includedMinutes: 120 },
    growth: { amountMinor: 7900, includedMinutes: 300 },
    pro: { amountMinor: 12000, includedMinutes: 500 },
    custom: { amountMinor: null, includedMinutes: null, basis: "separate_quotation" },
  },
  guardPerLocationMinor: 999,
  overageRateMinor: 25,
  overageRequiresOptIn: true,
  overageRequiresHardCap: true,
  standardLocations: 1,
  standardReceptionistNumbers: 1,
  minutesRollover: false,
  unusedMinutes: "expire_at_period_end" as const,
  cancellation: "end_of_paid_period" as const,
  automaticProrataRefund: false,
  refundSubjectTo: "applicable_law_and_service_failure_remedies" as const,
  renewal: "monthly_at_accepted_amount" as const,
  standardSetup: "included" as const,
  complexSetup: "quoted_separately" as const,
  callerData: {
    structuredSummaryOnly: true,
    persistentTranscript: false,
    persistentAudio: false,
    authorisedForModelTraining: false,
    leadRetentionDays: 90,
    exceptions: ["deletion_or_erasure", "documented_legal_hold"] as const,
  },
  partialMinuteBilling: {
    status: "REVIEW_BEFORE_CHARGE" as const,
    proposedRule: "ceil_provider_seconds_div_60" as const,
    unit: "integer_minor_units" as const,
  },
  agreementStatus: "LEGAL_REVIEW_REQUIRED" as const,
  providerVerification: "PROVIDER_VERIFICATION_REQUIRED" as const,
} as const

export const telloyaProposalPlans = {
  basic: "c03c0000-0000-4000-8000-000000000001",
  growth: "c03c0000-0000-4000-8000-000000000002",
  pro: "c03c0000-0000-4000-8000-000000000003",
  custom: "c03c0000-0000-4000-8000-000000000004",
} as const

export type TelloyaStandardTier = "BASIC" | "GROWTH" | "PRO"

export function telloyaProposedMonthlyMinor(tier: TelloyaStandardTier, guardLocations: number): number {
  if (!Number.isInteger(guardLocations) || guardLocations < 0) {
    throw new Error("Guard locations must be a whole number of confirmed locations.")
  }
  const base = tier === "BASIC"
    ? telloyaCatalogueProposal.prices.basicMinor
    : tier === "GROWTH"
      ? telloyaCatalogueProposal.prices.growthMinor
      : telloyaCatalogueProposal.prices.proMinor
  return base + telloyaCatalogueProposal.prices.guardLocationMinor * guardLocations
}
