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
      id: "standard-tier-cap-not-checked-at-approval",
      summary:
        "The one-location check for BASIC, GROWTH and PRO is in the unapplied migration 20261106140000. Hosted DEV does not have it yet. Until that file is applied, an approved standard plan can still store another cap.",
    },
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

2. Subscription and payment. The subscription is monthly, in GBP, at the amount on the accepted offer. That amount is the tier price plus any Relaunch Guard locations the administrator confirmed. Standard setup is included. Complex setup is quoted separately and is not part of this subscription. Accepting an offer does not start the service and does not create a Stripe subscription by itself.

3. Included minutes. Basic includes 120 minutes, Growth includes 300 minutes, and Pro includes 500 minutes in each monthly period. Custom minutes are whatever the approved quotation states. A draft Custom plan in this proposal has no minutes and no price.

4. Unused minutes. This draft proposes that unused minutes expire at the end of the monthly period and do not roll over. That treatment is not approved.

5. Relaunch Guard. Guard is optional. The draft price is £9.99 per location per month, and only for locations an administrator has explicitly confirmed. Interest on an enquiry is not a purchase. Guard monitoring does not start when the subscription is paid.

6. Additional minutes. This draft proposes £0.25 per minute after the included minutes. Overage is charged only when the customer accepts it on that offer and sets a spending cap. The cap is not a charge by itself. An enquiry cap does not authorise overage.

7. Numbers and forwarding. Telloya may record a telephone number and forwarding instructions. The customer remains responsible for turning forwarding on at their own telephone provider. Recording those instructions does not enable forwarding and does not make the service live.

8. Data, recordings and privacy. Call content, recordings, and business details are processed to provide the service and to support the account. This draft does not replace a privacy notice. Retention, subprocessors, and international transfers still need legal review.

9. Cancellation and refunds. This draft proposes cancellation at the end of the paid month, with no automatic refund of that month. A different refund rule is an open legal decision.

10. Availability and liability. The service can be unavailable. This draft does not set a service credit or a liability cap. Those terms need legal review before any customer sees them.

11. International customers. Customers outside the United Kingdom may subscribe. Prices are stored and billed in GBP. A checkout page may later show a local currency, but that display is not a second price and it is not approved here. Tax for those customers is not decided.

12. Status of this document. ${telloyaDraftMarker} Do not present it to a customer. Do not copy it into hosted DEV until the owner and legal review approve a later version.`,
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
