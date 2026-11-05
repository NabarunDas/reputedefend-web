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
  guardLocations: [],
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
    expect(screen.getByText(/Payment has not been completed/)).toBeTruthy()
    expect(screen.getByText("Payment setup is being prepared.")).toBeTruthy()
    expect(screen.getAllByText("£99.00").length).toBeGreaterThan(0)
    expect(screen.queryByRole("button", { name: "Accept offer" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Continue to secure payment" })).toBeNull()

    cleanup()
    render(<OfferView offer={{
      ...priced,
      status: "accepted",
      acceptedAt: "2026-11-03T12:00:00.000Z",
      conditions: { ...ready.conditions, overageOptIn: true, overageCapMinor: 2500 },
      payment: { state: "preparing", cadence: "MONTH", totalMinor: 9900, guardChargeMinor: 999 },
    }} paymentAction />)
    expect(screen.getByRole("button", { name: "Continue to secure payment" })).toBeTruthy()
    expect(screen.getByText("£9.99 for 1 location")).toBeTruthy()
    expect(screen.queryByText("Payment setup is being prepared.")).toBeNull()
    expect(document.body.innerHTML).not.toMatch(/cus_|sub_|price_|cs_/)

    cleanup()
    render(<OfferView offer={{
      ...priced,
      status: "accepted",
      cadence: "YEAR",
      acceptedAt: "2026-11-03T12:00:00.000Z",
      conditions: { ...ready.conditions, overageOptIn: false, overageCapMinor: null },
      payment: { state: "unsupported", cadence: "YEAR", totalMinor: 9900, guardChargeMinor: 999 },
    }} paymentAction />)
    expect(screen.getByText("This billing arrangement is not ready for secure payment.")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Continue to secure payment" })).toBeNull()
  })

  it("shows Telloya locations separately from paid Guard locations and the combined monthly amount", () => {
    const telloya = {
      ...ready,
      product: "Telloya" as const,
      services: ["Telloya"],
      locations: ["Depot", "Yard"],
      conditions: { ...ready.conditions, baseAmountMinor: 7900, guardIncluded: true, guardUnitMinor: 999, guardQuantity: 1 },
      priceMinor: 8899,
      totalMinor: 8899,
      guardLocations: [{ locationId: "33333333-3333-4333-8333-333333333333", locationName: "Depot" }],
    }
    render(<OfferView offer={telloya} acceptEnabled={false} />)
    expect(screen.getByRole("heading", { name: "Telloya locations" })).toBeTruthy()
    expect(screen.getByRole("heading", { name: "Paid Relaunch Guard locations" })).toBeTruthy()
    expect(screen.getAllByText("Depot")).toHaveLength(2)
    expect(screen.getAllByText("Yard")).toHaveLength(1)
    expect(screen.getByText("£88.99 per month")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Accept offer" })).toBeNull()

    cleanup()
    render(<OfferView offer={{
      ...telloya,
      conditions: { ...telloya.conditions, guardQuantity: 2 },
      priceMinor: 9898,
      totalMinor: 9898,
      guardLocations: [
        { locationId: "33333333-3333-4333-8333-333333333333", locationName: "Depot" },
        { locationId: "44444444-4444-4444-8444-444444444444", locationName: "Yard" },
      ],
    }} acceptEnabled={false} />)
    expect(screen.getByText("£98.98 per month")).toBeTruthy()
    expect(screen.getAllByText("Yard")).toHaveLength(2)

    cleanup()
    render(<OfferView offer={{
      ...telloya,
      conditions: { ...ready.conditions, baseAmountMinor: 7900, guardIncluded: false, guardUnitMinor: 999, guardQuantity: 0 },
      priceMinor: 7900,
      totalMinor: 7900,
      guardLocations: [],
    }} acceptEnabled={false} />)
    expect(screen.getByText("No location is included in paid Relaunch Guard.")).toBeTruthy()
    expect(screen.getByText("£79.00 per month")).toBeTruthy()
    expect(screen.queryByRole("heading", { name: "Paid Relaunch Guard locations" })).toBeNull()

    cleanup()
    const { offerVersion: _offerVersion, ...priced } = telloya
    render(<OfferView offer={{
      ...priced,
      status: "accepted",
      acceptedAt: "2026-11-03T12:00:00.000Z",
      conditions: { ...telloya.conditions, overageOptIn: false, overageCapMinor: null },
    }} acceptEnabled />)
    expect(screen.getByRole("heading", { name: "Paid Relaunch Guard locations" })).toBeTruthy()
    expect(screen.getByText("£9.99 for 1 location: Depot")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Accept offer" })).toBeNull()
  })
})
