// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
import "@testing-library/jest-dom/vitest"
import type { ReadyOffer } from "@/lib/portal/onboarding/offer-types"
import { OfferUnavailable, OfferView } from "./offer-view"

afterEach(cleanup)

const ready: ReadyOffer = {
  status: "ready",
  offerRef: "VC-26-AB2347",
  offerVersion: 2,
  product: "Complete",
  businessName: "Harbour Bakery",
  locations: ["High Street", "Dock"],
  services: ["Telloya", "Relaunch Guard"],
  priceMinor: 9900,
  currency: "GBP",
  taxBehaviour: "NOT_APPLICABLE",
  taxMinor: null,
  totalMinor: 9900,
  cadence: "MONTH",
  recurring: true,
  agreement: {
    title: "Complete service agreement",
    body: "This agreement covers Telloya and optional Relaunch Guard for the named locations.",
    cancellation: "Cancel in writing before the next billing date.",
    versionRef: "COMPLETE-TERMS-1",
    confirmations: [{ key: "business_authority", label: "I can accept this offer for the business." }],
  },
  conditions: {
    tier: "Growth",
    includedMinutes: 300,
    minutesRollover: false,
    baseAmountMinor: 8901,
    guardIncluded: true,
    guardUnitMinor: 999,
    guardQuantity: 1,
    overagePermitted: true,
    overageRateMinor: 25,
  },
  nextStep: "Accept the agreement to record this offer. Payment and service setup follow separately.",
}

describe("commercial offer presentation", () => {
  it("shows the approved facts and unchecked consent, and keeps acceptance separate from the read", () => {
    render(<OfferView offer={ready} acceptEnabled={false} />)
    expect(screen.getByRole("heading", { level: 1, name: "Commercial offer" })).toBeTruthy()
    expect(screen.getByText("Harbour Bakery")).toBeTruthy()
    expect(screen.getByText("High Street")).toBeTruthy()
    expect(screen.getAllByText("Telloya").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Relaunch Guard").length).toBeGreaterThan(0)
    expect(screen.getAllByText("£99.00")).toHaveLength(2)
    expect(screen.getByText("Monthly")).toBeTruthy()
    expect(screen.getByText("Recurring")).toBeTruthy()
    expect(screen.getByText("Applicable tax is not charged on this offer.")).toBeTruthy()
    expect(screen.getByText("Growth")).toBeTruthy()
    expect(screen.getByText(/300 minutes each month/)).toBeTruthy()
    expect(screen.getByText(/Unused minutes do not roll over/)).toBeTruthy()
    expect(screen.getByText(/optional Relaunch Guard for 1 location/)).toBeTruthy()
    expect(screen.getByText(/does not authorise extra usage charges/)).toBeTruthy()
    expect(screen.getByText(/Accepting it is not available from this page yet/)).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Accept offer" })).toBeNull()
    expect(document.body.innerHTML).not.toMatch(/amount_minor|subscriptionId|contentHash|stripe|trial|discount/i)

    cleanup()
    render(<OfferView offer={ready} acceptEnabled />)
    const boxes = screen.getAllByRole("checkbox")
    expect(boxes).toHaveLength(4)
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("")
    for (const box of boxes) expect((box as HTMLInputElement).checked).toBe(false)
    expect(screen.getByRole("button", { name: "Accept offer" })).toBeTruthy()
  })

  it("uses applicable tax when the offer does not name a tax", () => {
    render(<OfferView offer={{ ...ready, taxBehaviour: "INCLUSIVE", taxMinor: 1650 }} acceptEnabled={false} />)
    expect(screen.getByText("The price includes applicable tax of £16.50.")).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/\bVAT\b/)
    cleanup()
    render(<OfferView offer={{ ...ready, taxBehaviour: "INCLUSIVE", taxMinor: null }} acceptEnabled={false} />)
    expect(screen.getByText("The price includes applicable tax.")).toBeTruthy()
    cleanup()
    render(<OfferView offer={{ ...ready, taxBehaviour: "EXCLUSIVE", taxMinor: 1650, totalMinor: 11550 }} acceptEnabled={false} />)
    expect(screen.getByText("Applicable tax of £16.50 is added to the price.")).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/\bVAT\b/)
  })

  it("keeps a failed read distinct from having no offer", () => {
    render(<OfferUnavailable />)
    expect(screen.getByText(/does not say that there is no offer/)).toBeTruthy()
    expect(screen.queryByText(/No offer/)).toBeNull()
  })

  it("shows the accepted record without another acceptance action", () => {
    const { offerVersion: _offerVersion, ...priced } = ready
    render(<OfferView offer={{
      ...priced,
      status: "accepted",
      acceptedAt: "2026-11-03T12:00:00.000Z",
      conditions: { ...ready.conditions, overageOptIn: false, overageCapMinor: null },
    }} acceptEnabled />)
    expect(screen.getByRole("heading", { level: 1, name: "Offer accepted" })).toBeTruthy()
    expect(screen.getByText(/Nothing has been paid and the service has not started/)).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Accept offer" })).toBeNull()
  })
})
