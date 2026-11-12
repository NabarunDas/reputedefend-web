// @vitest-environment jsdom
import React from "react"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const refresh = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh }) }))

import { TelloyaOfferWorkspace } from "./telloya-offer-workspace"
import type { TelloyaSalesWorkspace } from "@/lib/commercial/telloya-sales-context"
import type { OnboardingView } from "@/lib/commercial/onboarding"
import { emptyTelloyaOfferDraft, type TelloyaOfferDraftPanel } from "@/lib/commercial/telloya-offer-draft"

const enquiryId = "21affacc-2e97-4b9a-992d-9f0644ab7115"
const voiceId = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
const guardOnlyId = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee"
const growthPlanId = "ffffffff-ffff-4fff-8fff-ffffffffffff"

const workspace = (overrides: Partial<TelloyaSalesWorkspace> = {}): TelloyaSalesWorkspace => ({
  available: true,
  primaryAction: "prepare_review",
  primaryLabel: "Review personalised offer draft",
  product: "TELLOYA",
  planInterest: "Growth",
  planTier: "growth",
  customerSummary: "Alex Owner · alex@example.com · +447700900123",
  businessSummary: "Owner Yard",
  voiceLocationSummary: "London workshop",
  guardInterestSummary: "Guard interest recorded for 2 locations. Unticked until Admin chooses Guard locations.",
  illustrativeMonthly: "£98.98 illustrative catalogue total",
  exceptions: [{ code: "confirm_operating_location", message: "Confirm the operating location. Enquiry location text is not a verified service address, and a sole existing location is not selected automatically." }],
  blockers: [
    { code: "approved_catalogue_missing", message: "Not sendable — approved Telloya plan catalogue is not configured." },
    { code: "service_agreement_missing", message: "Not sendable — approved service agreement and tax treatment are not configured." },
  ],
  sendable: false,
  needsReconciliation: true,
  onboardingStep: "locations",
  ...overrides,
})

const onboarding: OnboardingView = {
  supported: true,
  productHint: "TELLOYA",
  step: "locations",
  termsConfigured: false,
  invitationReady: false,
  invitationSent: false,
  emailVerified: false,
  contactVerified: false,
  membership: "pending",
  outstanding: [],
  nextAction: null,
  request: {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    product: "TELLOYA",
    state: "MAILBOX_REQUIRED",
    version: 3,
    customerId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    businessId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    declineReason: null,
    subscriptionId: null,
  },
  customer: { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", name: "Alex Owner", emailVerified: false, version: 1 },
  candidates: [],
  businesses: [{ id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", name: "Owner Yard", membership: "pending", membershipVersion: 1 }],
  locations: [{ id: voiceId, name: "Other site", country: "United Kingdom", selected: false }],
  history: [],
  approvedPlans: [],
}

const draftPanel = (overrides: Partial<TelloyaOfferDraftPanel> = {}): TelloyaOfferDraftPanel => ({
  availability: "ready",
  ...emptyTelloyaOfferDraft("growth"),
  ...overrides,
})

const growthPlan = {
  id: growthPlanId,
  versionNumber: 1,
  tierCode: "GROWTH" as const,
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
}

beforeEach(() => {
  refresh.mockReset()
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ message: "Telloya offer workspace is ready for review. No offer email was sent." }),
  }))
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("Telloya offer workspace", () => {
  it("shows an interactive calculator without a disabled Send offer control", async () => {
    render(<TelloyaOfferWorkspace
      enquiryId={enquiryId}
      workspace={workspace()}
      offer={{ availability: "no_offer" }}
      onboarding={onboarding}
      draft={draftPanel()}
      businessName="Owner Yard"
      country="United Kingdom"
    />)
    expect(screen.getByRole("heading", { name: "Personalised offer workspace" })).toBeTruthy()
    expect(screen.getByText("Alex Owner · alex@example.com · +447700900123")).toBeTruthy()
    expect(screen.getByRole("heading", { name: "Choose Telloya plan" })).toBeTruthy()
    expect(screen.getByRole("radio", { name: /Growth/ })).toHaveProperty("checked", true)
    expect(screen.getByText("£79.00 / month")).toBeTruthy()
    expect(screen.getByRole("heading", { name: "Before this can be sent" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Save draft" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Send offer" })).toBeNull()
    expect(screen.queryByText(/This workspace reuses/)).toBeNull()
    expect(screen.getByText("Confirm operating location")).toBeTruthy()
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/enquiries/telloya-sales-context", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ enquiryId, operation: "bootstrap" }),
    })))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
  })

  it("lets Guard locations be selected independently of the Telloya operating location", async () => {
    render(<TelloyaOfferWorkspace
      enquiryId={enquiryId}
      workspace={workspace({ needsReconciliation: false, exceptions: [], onboardingStep: "next" })}
      offer={{ availability: "no_offer" }}
      onboarding={{
        ...onboarding,
        step: "next",
        locations: [
          { id: voiceId, name: "London workshop", country: "United Kingdom", selected: true },
          { id: guardOnlyId, name: "Second depot", country: "United Kingdom", selected: false },
        ],
      }}
      draft={draftPanel()}
    />)
    expect(screen.getByText(/Telloya operating location/)).toBeTruthy()
    expect(screen.getByText(/Guard-only \(no extra receptionist\)/)).toBeTruthy()
    fireEvent.click(screen.getByRole("checkbox", { name: /Include London workshop in Relaunch Guard/ }))
    fireEvent.click(screen.getByRole("checkbox", { name: /Include Second depot in Relaunch Guard/ }))
    expect(screen.getByText("£98.98 / month")).toBeTruthy()
    fireEvent.click(screen.getByRole("radio", { name: /Custom/ }))
    expect(screen.getAllByText("Quotation required").length).toBeGreaterThan(0)
  })

  it("disables Save draft when draft storage is unavailable", () => {
    render(<TelloyaOfferWorkspace
      enquiryId={enquiryId}
      workspace={workspace({ needsReconciliation: false, exceptions: [] })}
      offer={{ availability: "no_offer" }}
      onboarding={{ ...onboarding, locations: [] }}
      draft={{ availability: "unavailable" }}
    />)
    expect(screen.getByRole("button", { name: "Save draft" })).toHaveProperty("disabled", true)
    expect(screen.getByText(/Draft saving will be available after DEV setup/)).toBeTruthy()
    expect(screen.getByText("£79.00 / month")).toBeTruthy()
  })

  it("does not POST again when the sales context is already reconciled", async () => {
    render(<TelloyaOfferWorkspace
      enquiryId={enquiryId}
      workspace={workspace({ needsReconciliation: false, exceptions: [], onboardingStep: "next" })}
      offer={{ availability: "no_offer" }}
      onboarding={{ ...onboarding, step: "next", locations: [{ id: voiceId, name: "London workshop", country: "United Kingdom", selected: true }] }}
      draft={draftPanel()}
    />)
    expect(screen.getByText("Review personalised offer draft")).toBeTruthy()
    await waitFor(() => expect(fetch).not.toHaveBeenCalled())
  })

  it("saves the draft estimate through the draft API and shows overage as a proposal in GBP", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ message: "Draft offer estimate saved. This is not an official commercial offer and does not record customer consent.", version: 1 }),
    })
    vi.stubGlobal("fetch", fetchMock)
    render(<TelloyaOfferWorkspace
      enquiryId={enquiryId}
      workspace={workspace({ needsReconciliation: false, exceptions: [] })}
      offer={{ availability: "no_offer" }}
      onboarding={{ ...onboarding, locations: [] }}
      draft={draftPanel()}
    />)
    fireEvent.change(screen.getByLabelText(/Proposed Guard quantity/), { target: { value: "2" } })
    expect(screen.getByText("£98.98 / month")).toBeTruthy()
    fireEvent.click(screen.getByRole("checkbox", { name: /Propose overage in the offer/ }))
    fireEvent.change(screen.getByLabelText(/Proposed spending cap/), { target: { value: "40" } })
    expect(screen.getByText(/subject to customer opt-in/)).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/enquiries/telloya-offer-draft", expect.objectContaining({
      method: "POST",
    })))
    const body = JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))
    expect(body).toMatchObject({
      enquiryId,
      expectedVersion: 0,
      planTier: "growth",
      proposedGuardQuantity: 2,
      overageOptIn: true,
      overageCapPence: 4000,
    })
    await waitFor(() => expect(screen.getByText(/Draft offer estimate saved/)).toBeTruthy())
    expect(screen.getByRole("button", { name: "Update draft" })).toBeTruthy()
  })

  it("exposes Prepare offer only for the saved draft tier and independent Guard locations", async () => {
    render(<TelloyaOfferWorkspace
      enquiryId={enquiryId}
      workspace={workspace({
        needsReconciliation: false,
        exceptions: [],
        blockers: [],
        sendable: true,
        primaryLabel: "Prepare personalised offer",
        onboardingStep: "next",
      })}
      offer={{ availability: "no_offer" }}
      draft={draftPanel({ version: 1, guardLocationIds: [guardOnlyId], proposedGuardQuantity: 1 })}
      onboarding={{
        ...onboarding,
        step: "next",
        termsConfigured: true,
        membership: "verified",
        locations: [
          { id: voiceId, name: "London workshop", country: "United Kingdom", selected: true },
          { id: guardOnlyId, name: "Second depot", country: "United Kingdom", selected: false },
        ],
        approvedPlans: [
          growthPlan,
          { ...growthPlan, id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1", tierCode: "BASIC", tierLabel: "Basic", amountMinor: 4900, includedMinutes: 120, baseAmountMinor: 4900 },
        ],
      }}
    />)
    expect(screen.getByRole("heading", { name: "Prepare official offer" })).toBeTruthy()
    expect(screen.getByText(/Growth, version 1/)).toBeTruthy()
    expect(screen.queryByText(/Basic, version 1/)).toBeNull()
    expect(screen.getAllByText(/Include Second depot in Relaunch Guard/).length).toBeGreaterThan(0)
    expect(screen.getByRole("button", { name: "Prepare offer" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Send offer" })).toBeNull()
    await waitFor(() => expect(fetch).not.toHaveBeenCalled())
  })

  it("does not expose Prepare offer until the draft has been saved", () => {
    render(<TelloyaOfferWorkspace
      enquiryId={enquiryId}
      workspace={workspace({
        needsReconciliation: false,
        exceptions: [],
        blockers: [],
        sendable: true,
        primaryLabel: "Prepare personalised offer",
        onboardingStep: "next",
      })}
      offer={{ availability: "no_offer" }}
      draft={draftPanel({ version: 0 })}
      onboarding={{
        ...onboarding,
        step: "next",
        termsConfigured: true,
        membership: "verified",
        locations: [{ id: voiceId, name: "London workshop", country: "United Kingdom", selected: true }],
        approvedPlans: [growthPlan],
      }}
    />)
    expect(screen.queryByRole("heading", { name: "Prepare official offer" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Prepare offer" })).toBeNull()
  })
})
