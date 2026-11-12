import { describe, expect, it } from "vitest"
import { buildTelloyaSalesWorkspace, telloyaSalesBootstrapAllowed } from "./telloya-sales-context"
import type { EnquiryPayload } from "../enquiries/model"
import type { OnboardingView } from "./onboarding"

const payload = (overrides: Partial<EnquiryPayload> = {}): EnquiryPayload => ({
  fullName: "Alex Owner",
  email: "alex@example.com",
  phone: "+447700900123",
  businessName: "Owner Yard",
  country: "United Kingdom",
  subject: "Telloya enquiry",
  service: "telloya",
  details: "Need a receptionist",
  websiteUrl: "https://example.com",
  businessProfileUrl: "",
  reviewUrl: "",
  source: "telloya",
  planTier: "growth",
  locations: "London workshop",
  guardInterested: true,
  guardLocationCount: 2,
  ...overrides,
})

const unsupported: OnboardingView = { supported: false }
const classifyView: OnboardingView = {
  supported: true,
  productHint: "TELLOYA",
  step: "classify",
  termsConfigured: false,
  invitationReady: false,
  invitationSent: false,
  emailVerified: false,
  contactVerified: false,
  membership: null,
  outstanding: [],
  nextAction: null,
  request: null,
  customer: null,
  candidates: [],
  businesses: [],
  locations: [],
  history: [],
  approvedPlans: [],
}

describe("telloyaSalesBootstrapAllowed", () => {
  it("stays closed in production even when the journey flag is on", () => {
    expect(telloyaSalesBootstrapAllowed("true", "production")).toBe(false)
    expect(telloyaSalesBootstrapAllowed("true", "preview")).toBe(true)
    expect(telloyaSalesBootstrapAllowed("false", "preview")).toBe(false)
  })
})

describe("buildTelloyaSalesWorkspace", () => {
  it("returns null for non-Telloya enquiries", () => {
    expect(buildTelloyaSalesWorkspace({
      payload: payload({ source: "homepage" }),
      demoStatus: "COMPLETED",
      onboarding: classifyView,
      offer: { availability: "no_offer" },
    })).toBeNull()
  })

  it("prefills the offer workspace after a completed demo without an onboarding request", () => {
    const workspace = buildTelloyaSalesWorkspace({
      payload: payload(),
      demoStatus: "COMPLETED",
      onboarding: classifyView,
      offer: { availability: "no_offer" },
    })
    expect(workspace?.available).toBe(true)
    expect(workspace?.product).toBe("TELLOYA")
    expect(workspace?.planInterest).toBe("Growth")
    expect(workspace?.customerSummary).toContain("Alex Owner")
    expect(workspace?.businessSummary).toContain("Owner Yard")
    expect(workspace?.voiceLocationSummary).toContain("London workshop")
    expect(workspace?.guardInterestSummary).toMatch(/Unticked until Admin chooses/)
    expect(workspace?.illustrativeMonthly).toMatch(/illustrative catalogue total/)
    expect(workspace?.needsReconciliation).toBe(true)
    expect(workspace?.sendable).toBe(false)
    expect(workspace?.primaryLabel).toBe("Review & approve offer")
    expect(workspace?.exceptions.some(item => item.code === "confirm_operating_location")).toBe(true)
    expect(workspace?.blockers.some(item => item.code === "approved_catalogue_missing")).toBe(true)
    expect(workspace?.blockers.some(item => item.code === "service_agreement_missing")).toBe(true)
  })

  it("marks custom quotes and missing plan interest as compact exceptions", () => {
    const custom = buildTelloyaSalesWorkspace({
      payload: payload({ planTier: "custom" }),
      demoStatus: "COMPLETED",
      onboarding: unsupported,
      offer: { availability: "closed" },
    })
    expect(custom?.exceptions.some(item => item.code === "custom_quote_required")).toBe(true)
    const missing = buildTelloyaSalesWorkspace({
      payload: payload({ planTier: undefined }),
      demoStatus: "COMPLETED",
      onboarding: unsupported,
      offer: { availability: "closed" },
    })
    expect(missing?.exceptions.some(item => item.code === "plan_interest_missing")).toBe(true)
  })

  it("keeps Guard interest unselected and requires confirmation for a sole unrelated business", () => {
    const workspace = buildTelloyaSalesWorkspace({
      payload: payload({ guardInterested: true, guardLocationCount: 1 }),
      demoStatus: "COMPLETED",
      onboarding: {
        ...classifyView,
        step: "business",
        request: {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          product: "TELLOYA",
          state: "IN_REVIEW",
          version: 3,
          customerId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          businessId: null,
          declineReason: null,
          subscriptionId: null,
        },
        businesses: [{ id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", name: "Different Yard", membership: "pending", membershipVersion: 1 }],
        locations: [],
      },
      offer: { availability: "no_offer" },
    })
    expect(workspace?.guardInterestSummary).toMatch(/Unticked/)
    expect(workspace?.exceptions.some(item => item.code === "confirm_business_authority")).toBe(true)
    expect(workspace?.sendable).toBe(false)
  })

  it("does not mark the offer sendable before authority, location and catalogue gates pass", () => {
    const workspace = buildTelloyaSalesWorkspace({
      payload: payload(),
      demoStatus: "COMPLETED",
      onboarding: {
        ...classifyView,
        step: "next",
        termsConfigured: true,
        membership: "verified",
        request: {
          id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          product: "TELLOYA",
          state: "IN_REVIEW",
          version: 4,
          customerId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
          businessId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
          declineReason: null,
          subscriptionId: null,
        },
        customer: { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", name: "Alex Owner", emailVerified: true, version: 1 },
        locations: [{ id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", name: "Yard", country: "United Kingdom", selected: true }],
        approvedPlans: [{
          id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
          versionNumber: 1,
          tierCode: "GROWTH",
          tierLabel: "Growth",
          amountMinor: 7900,
          currency: "GBP",
          cadence: "month",
          termsRef: "terms",
          includedMinutes: 300,
          baseAmountMinor: 7900,
          guardUnitMinor: 999,
          overageRateMinor: null,
          conditionsStatus: "APPROVED",
          telloyaQuantity: 1,
          guardQuantity: null,
          selectedLocations: 1,
          guardAddonUnitMinor: 999,
          offerable: true,
          unavailableReason: null,
          matchesApprovedSchedule: true,
        }],
      },
      offer: { availability: "no_offer" },
    })
    expect(workspace?.needsReconciliation).toBe(false)
    expect(workspace?.sendable).toBe(true)
    expect(workspace?.primaryAction).toBe("prepare_review")
    expect(workspace?.primaryLabel).toBe("Approve & Send Offer")
  })

  it("uses Approve & Send when an offered subscription has not been queued", () => {
    const workspace = buildTelloyaSalesWorkspace({
      payload: payload(),
      demoStatus: "COMPLETED",
      onboarding: unsupported,
      offer: {
        availability: "ready",
        subscriptionId: "33333333-3333-4333-8333-333333333333",
        offerRef: "VC-26-ABCDEF",
        state: "OFFERED",
        version: 1,
        amendments: [],
        emailQueued: false,
      },
    })
    expect(workspace?.primaryAction).toBe("approve_send")
    expect(workspace?.primaryLabel).toBe("Approve & Send Offer")
  })
})
