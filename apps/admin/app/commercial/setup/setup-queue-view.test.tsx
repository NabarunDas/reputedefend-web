// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import "@testing-library/jest-dom/vitest"
import type { SetupQueueItem } from "@/lib/commercial/setup-queue"
import { SetupQueueView } from "./setup-queue-view"

afterEach(cleanup)

const item: SetupQueueItem = {
  reference: "VC-26-HND2AB",
  customerName: "Alex Baker",
  businessId: "a033a000-0000-4000-8000-000000000011",
  businessName: "Harbour Bakery",
  product: "Telloya",
  plan: "Growth",
  monthlyPriceMinor: 7900,
  currency: "GBP",
  locations: [
    { locationId: "a033a000-0000-4000-8000-000000000021", locationName: "High Street" },
    { locationId: "a033a000-0000-4000-8000-000000000022", locationName: "Dock" },
  ],
  guardLocationCount: 0,
  guard: { included: false, status: "not_subscribed", quantity: 0, monitoringActive: false, locations: [] },
  financialStatus: "verified",
  operationalStatus: "not_started",
  customerDisplay: "Payment received — setup pending",
  message: "Your subscription payment has been confirmed. We're preparing your service and will guide you through the remaining setup steps.",
  paymentConfirmedAt: "2026-11-04T12:00:00.000Z",
  nextAction: "Begin setup",
  checklist: [
    { key: "payment", label: "Payment confirmed", state: "complete" },
    { key: "preferences", label: "Business and service preferences", state: "complete" },
    { key: "agent", label: "AI receptionist configuration", state: "planned" },
    { key: "number", label: "Telephone number and forwarding", state: "planned" },
    { key: "test", label: "Test call and verification", state: "planned" },
    { key: "activation", label: "Service activation", state: "planned" },
  ],
}

describe("paid setup queue", () => {
  it("shows the paid subscription and does not offer an activation control", () => {
    render(<SetupQueueView items={[item, { ...item, reference: "VC-26-HND2AC", businessId: "a033a000-0000-4000-8000-000000000015", businessName: "Harbour Bakery" }]} />)
    expect(screen.getAllByText("Harbour Bakery")).toHaveLength(2)
    expect(screen.getByText("VC-26-HND2AB")).toBeTruthy()
    expect(screen.getByText("VC-26-HND2AC")).toBeTruthy()
    expect(screen.getAllByText("Growth · £79.00 a month")).toHaveLength(2)
    expect(screen.getAllByText("Payment verified").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Next action: Begin setup").length).toBeGreaterThan(0)
    expect(screen.getByText("Approve activation")).toBeTruthy()
    expect(document.body.innerHTML).not.toMatch(/<button|Mark active|Provision now|cus_|evt_/)
  })

  it("says when nothing is waiting", () => {
    render(<SetupQueueView items={[]} />)
    expect(screen.getByText("No paid Telloya or Complete subscription is waiting for setup.")).toBeTruthy()
  })
})
