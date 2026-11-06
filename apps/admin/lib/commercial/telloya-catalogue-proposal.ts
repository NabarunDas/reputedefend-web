/**
 * Proposed Telloya commercial catalogue.
 *
 * These values are a proposal for owner review. They are not approved prices,
 * not an approved location cap, not an approved agreement, and not a tax
 * decision. The installer may copy them into an isolated database as DRAFT
 * rows. It must not be run against hosted DEV or Production.
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

/** One location on a standard plan is a proposal. It is not an approved cap. */
export const telloyaLocationPolicy = {
  status: "PROPOSED" as const,
  proposedStandardLocations: 1,
  customHandling: "A Custom quotation may name more than one location. That cap is part of the quotation and is not created by this proposal.",
  alternatives: [
    {
      id: "one-location-standard",
      summary: "Basic, Growth and Pro each cover one location. A second location needs a Custom quotation.",
      impact: "Matches the current rule of one occupying Telloya subscription per business. The location cap on that subscription is the business location count. A second subscription for the same business is already rejected.",
    },
    {
      id: "several-locations-same-price",
      summary: "A standard tier has several approved versions, one per location cap, at the same monthly price.",
      impact: "The schema allows one current approved version per tier and cap. The price does not rise with locations. The owner would be choosing how many locations the published price includes.",
    },
    {
      id: "price-per-location",
      summary: "The monthly Telloya amount is a unit price multiplied by location count.",
      impact: "Today the plan stores one monthly amount. Only Guard is multiplied. This alternative needs a later command change and is not part of this proposal.",
    },
    {
      id: "unlimited-locations",
      summary: "A standard plan covers every location the business adds.",
      impact: "An approved Telloya plan must include one Telloya location component. Omitting it does not mean unlimited, and this proposal does not do that.",
    },
  ],
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
