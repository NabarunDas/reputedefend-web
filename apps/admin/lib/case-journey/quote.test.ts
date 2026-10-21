import { describe, expect, it } from "vitest"
import type { AssessmentJudgement } from "./assessment"
import type { CaseFlowAuthorizationFact, CaseFlowFacts, CaseFlowQuoteFact } from "../case-flow/model"
import type { PriceVersion, QuoteListItem } from "../commerce/model"
import { SCOPE_EXCLUSIONS_TEMPLATE_VERSION, standardScopeExclusions } from "../../../../lib/commercial/scope-templates"
import { buildJourneyQuotePanel, quoteServiceForRecommendation } from "./quote"

const NOW = "2026-06-01T12:00:00.000Z"
const PAST = "2026-05-01T12:00:00.000Z"
const FUTURE = "2026-07-01T12:00:00.000Z"
const QUOTE_ID = "55555555-5555-4555-8555-555555555555"
const VERSION_ID = "66666666-6666-4666-8666-666666666666"
const PRICE_ID = "77777777-7777-4777-8777-777777777777"
const ACTION_ID = "88888888-8888-4888-8888-888888888888"
const CUSTOMER_ID = "11111111-1111-4111-8111-111111111111"
const BUSINESS_ID = "22222222-2222-4222-8222-222222222222"
const LOCATION_ID = "33333333-3333-4333-8333-333333333333"
const CASE_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"

const guided: AssessmentJudgement = { phase: "approved", pathway: "GUIDED", versionNumber: 1 }

function authorization(overrides: Partial<CaseFlowAuthorizationFact> = {}): CaseFlowAuthorizationFact {
  return {
    membershipStatus: "pending",
    customerEmailVerified: false,
    businessAuthorityVerified: false,
    serviceAgreementAccepted: false,
    caseManagementPermissionActive: false,
    managerAccessVerified: false,
    authorizationReady: false,
    reviewRequired: [],
    agreementKinds: [],
    hasLocation: true,
    ...overrides,
  }
}

function quoteFact(overrides: Partial<CaseFlowQuoteFact> = {}): CaseFlowQuoteFact {
  return {
    id: QUOTE_ID,
    status: "DRAFT",
    taxBehaviour: "INCLUSIVE",
    validUntil: FUTURE,
    actionStatus: null,
    actionExpiresAt: null,
    orderId: null,
    ...overrides,
  }
}

function facts(overrides: Partial<CaseFlowFacts> = {}): CaseFlowFacts {
  return {
    caseId: CASE_ID,
    reference: "CASE-0001",
    caseType: "PROFILE_RECOVERY",
    technicalStage: "SERVICE_SELECTION",
    caseStatus: "UNDER_REVIEW",
    serviceTrack: "UNDECIDED",
    outcome: null,
    outcomeSummary: "",
    customerId: CUSTOMER_ID,
    businessId: BUSINESS_ID,
    locationId: LOCATION_ID,
    plannedNextAction: "",
    plannedNextActionDueAt: null,
    allowedTransitions: ["AUTHORIZATION_REQUIRED", "PAYMENT_REQUIRED"],
    reopened: false,
    tasks: [],
    submissions: [],
    authorization: authorization(),
    customerActions: [],
    evidence: { requests: [], versions: [] },
    packs: { packs: [], eligibleCount: 0 },
    commercial: { complete: true, quotes: [] },
    payment: { complete: true, orders: [] },
    communications: [],
    complaints: { complete: true, open: [] },
    capabilities: { liveMailEnabled: false, paymentsEnabled: false, googleSubmissionLive: false },
    ...overrides,
  }
}

function price(overrides: Partial<PriceVersion> = {}): PriceVersion {
  return {
    id: PRICE_ID,
    serviceCode: "GUIDED_RELAUNCH",
    displayName: "Guided Relaunch",
    amountMinor: 9900,
    currency: "GBP",
    paymentModel: "UPFRONT",
    billingCadence: "ONCE",
    billingUnit: "CASE",
    effectiveFrom: PAST,
    effectiveTo: null,
    status: "APPROVED",
    taxBehaviour: "INCLUSIVE",
    taxJurisdiction: null,
    taxRateBps: null,
    taxCode: null,
    createdAt: PAST,
    approvedAt: PAST,
    retiredAt: null,
    version: 1,
    seedKey: null,
    ...overrides,
  }
}

function quoteDetail(overrides: Partial<QuoteListItem> = {}, versionOverrides: Partial<QuoteListItem["currentVersion"]> = {}): QuoteListItem {
  return {
    id: QUOTE_ID,
    publicRef: "Q-100",
    status: "DRAFT",
    version: 2,
    customerId: CUSTOMER_ID,
    customerName: "Alex",
    businessName: "Bakery",
    locationName: "High Street",
    caseId: CASE_ID,
    caseReference: "CASE-0001",
    monitoringRequestId: null,
    acceptedAt: null,
    orderId: null,
    orderRef: null,
    action: null,
    currentVersion: {
      id: VERSION_ID,
      versionNumber: 1,
      status: "DRAFT",
      serviceCode: "GUIDED_RELAUNCH",
      serviceName: "Guided Relaunch",
      paymentModel: "UPFRONT",
      scope: "Recover the suspended profile.",
      exclusions: "No Google submission from this quote.",
      successDefinition: "The listing is restored.",
      standardAmountMinor: 9900,
      discountPolicyId: "",
      discountBps: 0,
      discountAmountMinor: 0,
      quotedSubtotalMinor: 9900,
      taxBehaviour: "INCLUSIVE",
      taxAmountMinor: 0,
      totalAmountMinor: 9900,
      currency: "GBP",
      validUntil: FUTURE,
      paymentTiming: "UPFRONT",
      offeredAt: null,
      discountSnapshot: null,
      ...versionOverrides,
    },
    ...overrides,
  }
}

function panel(input: {
  facts?: Partial<CaseFlowFacts>
  assessment?: AssessmentJudgement | null
  prices?: PriceVersion[]
  quote?: QuoteListItem | null
  quoteDetailMissing?: boolean
} = {}) {
  const source = facts(input.facts)
  return {
    source,
    view: buildJourneyQuotePanel({
      facts: source,
      now: NOW,
      assessment: input.assessment === undefined ? guided : input.assessment,
      prices: input.prices ?? [price()],
      quote: input.quote === undefined ? null : input.quote,
      quoteDetailMissing: input.quoteDetailMissing ?? false,
    }),
  }
}

describe("guided quote preparation", () => {
  it("drafts the recommended service without selecting the track", () => {
    expect(quoteServiceForRecommendation("UNDECIDED", "PROFILE_RECOVERY", "GUIDED")).toBe("GUIDED_RELAUNCH")
    const { source, view } = panel()
    expect(source.serviceTrack).toBe("UNDECIDED")
    expect(view.pathway).toBe("GUIDED")
    expect(view.commands.draft).toBe(true)
    expect(view.priceChoice?.serviceCode).toBe("GUIDED_RELAUNCH")
    expect(view.trackNote).toMatch(/does not select the track/)
    expect(view.trackNote).toMatch(/not the customer's agreement/)
    expect(view.commands.offer).toBe(false)
    expect(view.commands.issueAcceptance).toBe(false)
  })

  it("does not invent a draft when no approved pathway is current", () => {
    const { view } = panel({ assessment: null })
    expect(view.pathway).toBeNull()
    expect(view.commands).toEqual({ draft: false, setTax: false, offer: false, issueAcceptance: false, revokeAcceptance: false })
    expect(view.trackNote).toMatch(/No current approved pathway/)
    const stale = panel({ assessment: { phase: "stale", pathway: "GUIDED", versionNumber: 1 } })
    expect(stale.view.commands.draft).toBe(false)
    expect(stale.view.pathway).toBeNull()
  })

  it("follows the selected track when the recommendation disagrees", () => {
    expect(quoteServiceForRecommendation("GUIDED", "PROFILE_RECOVERY", "MANAGED")).toBe("GUIDED_RELAUNCH")
    const { source, view } = panel({
      facts: { serviceTrack: "GUIDED" },
      assessment: { phase: "approved", pathway: "MANAGED", versionNumber: 2 },
    })
    expect(source.serviceTrack).toBe("GUIDED")
    expect(view.priceChoice?.serviceCode).toBe("GUIDED_RELAUNCH")
    expect(view.trackNote).toMatch(/does not change the selected track/)
    expect(view.trackNote).toMatch(/follows the selected track/)
    expect(view.trackNote).not.toMatch(/Managed Relaunch/)
  })

  it("offers no command from an incomplete list, even when a returned row is accepted", () => {
    const { view } = panel({
      facts: { commercial: { complete: false, quotes: [quoteFact({ status: "ACCEPTED" })] } },
      quote: quoteDetail({ status: "ACCEPTED" }),
    })
    expect(view.headline).toBe("Quote list incomplete")
    expect(view.detail).toMatch(/does not finish this step/)
    expect(view.commands).toEqual({ draft: false, setTax: false, offer: false, issueAcceptance: false, revokeAcceptance: false })
  })

  it("reviews tax on an unconfirmed draft and offers only a configured draft", () => {
    const unconfirmed = panel({
      facts: { commercial: { complete: true, quotes: [quoteFact({ taxBehaviour: "UNCONFIRMED" })] } },
      quote: quoteDetail({}, { taxBehaviour: "UNCONFIRMED" }),
    })
    expect(unconfirmed.view.headline).toBe("Draft quote")
    expect(unconfirmed.view.commands.setTax).toBe(true)
    expect(unconfirmed.view.commands.offer).toBe(false)
    expect(unconfirmed.view.commands.draft).toBe(false)

    const ready = panel({
      facts: { commercial: { complete: true, quotes: [quoteFact()] } },
      quote: quoteDetail(),
    })
    expect(ready.view.commands.offer).toBe(true)
    expect(ready.view.commands.setTax).toBe(false)
    expect(ready.view.detail).toMatch(/purchasing-establishment and tax eligibility/)
  })

  it("keeps an open link waiting and issues a replacement only after the existing trust checks", () => {
    const open = panel({
      facts: {
        commercial: { complete: true, quotes: [quoteFact({ status: "OFFERED", actionStatus: "OPEN", actionExpiresAt: FUTURE })] },
        authorization: authorization({ customerEmailVerified: true, businessAuthorityVerified: true }),
      },
      quote: quoteDetail({ status: "OFFERED", action: { id: ACTION_ID, status: "OPEN", expiresAt: FUTURE, kind: "QUOTE_ACCEPTANCE" } }),
    })
    expect(open.view.headline).toBe("Quote offered")
    expect(open.view.commands.revokeAcceptance).toBe(true)
    expect(open.view.commands.issueAcceptance).toBe(false)
    expect(open.view.detail).toMatch(/not acceptance/)

    const expiredLink = panel({
      facts: {
        commercial: { complete: true, quotes: [quoteFact({ status: "OFFERED", actionStatus: "OPEN", actionExpiresAt: PAST })] },
        authorization: authorization({ customerEmailVerified: true, businessAuthorityVerified: true }),
      },
      quote: quoteDetail({ status: "OFFERED", action: { id: ACTION_ID, status: "OPEN", expiresAt: PAST, kind: "QUOTE_ACCEPTANCE" } }),
    })
    expect(expiredLink.view.headline).toBe("Acceptance link expired")
    expect(expiredLink.view.commands.issueAcceptance).toBe(true)
    expect(expiredLink.view.detail).toMatch(/expired link is not acceptance/)

    const unverified = panel({
      facts: { commercial: { complete: true, quotes: [quoteFact({ status: "OFFERED" })] } },
      quote: quoteDetail({ status: "OFFERED" }),
    })
    expect(unverified.view.commands.issueAcceptance).toBe(false)
    expect(unverified.view.notices.join(" ")).toMatch(/email and business authority/)
  })

  it("allows a replacement draft after decline or expiry and does not call that acceptance", () => {
    for (const status of ["DECLINED", "EXPIRED", "CANCELLED", "SUPERSEDED"]) {
      const { view } = panel({
        facts: { commercial: { complete: true, quotes: [quoteFact({ status })] } },
        quote: quoteDetail({ status }),
      })
      expect(view.commands.draft).toBe(true)
      expect(view.commands.offer).toBe(false)
      expect(view.commands.issueAcceptance).toBe(false)
      expect(view.headline).not.toBe("Quote accepted")
      expect(view.detail.toLowerCase()).toMatch(/not acceptance/)
    }
  })

  it("withholds commands when the quote list is tied, the detail is missing, or the price is ambiguous", () => {
    const tied = panel({
      facts: {
        commercial: {
          complete: true,
          quotes: [quoteFact({ status: "ACCEPTED" }), quoteFact({ id: "99999999-9999-4999-8999-999999999999", status: "ACCEPTED" })],
        },
      },
      quote: quoteDetail({ status: "ACCEPTED" }),
    })
    expect(tied.view.headline).toBe("Quote not confirmed")
    expect(tied.view.detail).toMatch(/none is treated as accepted/)
    expect(tied.view.commands.draft).toBe(false)
    expect(tied.view.commands.offer).toBe(false)
    expect(tied.view.notices.join(" ")).toMatch(/same relevance/)

    const missing = panel({
      facts: { commercial: { complete: true, quotes: [quoteFact()] } },
      quote: null,
      quoteDetailMissing: true,
    })
    expect(missing.view.commands).toEqual({ draft: false, setTax: false, offer: false, issueAcceptance: false, revokeAcceptance: false })
    expect(missing.view.notices.join(" ")).toMatch(/could not be loaded/)

    const ambiguous = panel({ prices: [price(), price({ id: "99999999-9999-4999-8999-999999999999" })] })
    expect(ambiguous.view.commands.draft).toBe(false)
    expect(ambiguous.view.priceChoice).toBeNull()
    expect(ambiguous.view.notices.join(" ")).toMatch(/No price has been chosen|no price has been chosen/)
  })

  it("keeps the stored wording and template version when the current template differs", () => {
    const scope = "Earlier final scope for this quote. Standard wording version SCOPE-2026-01-01.1."
    const exclusions = "Earlier final exclusions for this accepted quote."
    const accepted = panel({
      facts: { commercial: { complete: true, quotes: [quoteFact({ status: "ACCEPTED" })] } },
      quote: quoteDetail({ status: "ACCEPTED" }, { scope, exclusions }),
    })
    expect(accepted.view.quote?.scope).toBe(scope)
    expect(accepted.view.quote?.exclusions).toBe(exclusions)
    expect(accepted.view.quote?.templateVersion).toBe("SCOPE-2026-01-01.1")
    expect(accepted.view.quote?.scope).not.toContain(SCOPE_EXCLUSIONS_TEMPLATE_VERSION)
    expect(accepted.view.quote?.scope).not.toBe(standardScopeExclusions("GUIDED_RELAUNCH")?.scope)
    expect(accepted.view.commands.draft).toBe(false)
    expect(accepted.view.commands.offer).toBe(false)

    const ready = panel({
      facts: { commercial: { complete: true, quotes: [quoteFact()] } },
      quote: quoteDetail({}, { scope, exclusions }),
    })
    expect(ready.view.commands.offer).toBe(true)
    expect(ready.view.quote?.scope).toBe(scope)
    expect(ready.view.quote?.exclusions).toBe(exclusions)
    expect(ready.view.quote?.templateVersion).toBe("SCOPE-2026-01-01.1")
  })
})
