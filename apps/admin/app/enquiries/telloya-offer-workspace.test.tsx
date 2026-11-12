// @vitest-environment jsdom
import React from "react"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const refresh = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh }) }))

import { TelloyaOfferWorkspace } from "./telloya-offer-workspace"
import type { TelloyaSalesWorkspace } from "@/lib/commercial/telloya-sales-context"

const enquiryId = "21affacc-2e97-4b9a-992d-9f0644ab7115"

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
  exceptions: [{ code: "confirm_operating_location", message: "Confirm the operating location. Enquiry location text is not a verified service address." }],
  blockers: [
    { code: "approved_catalogue_missing", message: "Not sendable — approved Telloya plan catalogue is not configured." },
    { code: "service_agreement_missing", message: "Not sendable — approved service agreement and tax treatment are not configured." },
  ],
  sendable: false,
  needsReconciliation: true,
  onboardingStep: "classify",
  ...overrides,
})

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
  it("shows a prefilled offer screen and reconciles once without the five-step wizard", async () => {
    render(<TelloyaOfferWorkspace enquiryId={enquiryId} workspace={workspace()} offer={{ availability: "no_offer" }} />)
    expect(screen.getByRole("heading", { name: "Personalised offer workspace" })).toBeTruthy()
    expect(screen.getByText("Alex Owner · alex@example.com · +447700900123")).toBeTruthy()
    expect(screen.getByText("Owner Yard")).toBeTruthy()
    expect(screen.getByText(/Not sendable — approved Telloya plan catalogue/)).toBeTruthy()
    expect(screen.getByRole("button", { name: "Send offer" })).toHaveProperty("disabled", true)
    expect(screen.queryByText("Product")).toBeNull()
    expect(screen.queryByText("Open onboarding")).toBeNull()
    await waitFor(() => expect(fetch).toHaveBeenCalledWith("/api/enquiries/telloya-sales-context", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ enquiryId }),
    })))
    await waitFor(() => expect(refresh).toHaveBeenCalled())
    expect(screen.getByText(/Telloya offer workspace is ready for review/)).toBeTruthy()
  })

  it("does not POST again when the sales context is already reconciled", async () => {
    render(<TelloyaOfferWorkspace
      enquiryId={enquiryId}
      workspace={workspace({ needsReconciliation: false, exceptions: [], onboardingStep: "next" })}
      offer={{ availability: "no_offer" }}
    />)
    expect(screen.getByText("Review personalised offer draft")).toBeTruthy()
    await waitFor(() => expect(fetch).not.toHaveBeenCalled())
  })
})
