// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import type { SetupQueueItem } from "@/lib/commercial/setup-queue"
import { SetupQueueView } from "./setup-queue-view"

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }))

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
  guard: { included: false, status: "not_subscribed", quantity: 0, monitoringActive: false, assignment: "not_applicable", locations: [] },
  financialStatus: "verified",
  paymentScope: "initial_settlement",
  periodStart: "2026-11-01T00:00:00.000Z",
  periodEnd: "2026-12-01T00:00:00.000Z",
  operationalStatus: "not_started",
  customerDisplay: "Payment received — setup pending",
  message: "Your subscription payment has been confirmed. We're preparing your service and will guide you through the remaining setup steps.",
  paymentConfirmedAt: "2026-11-04T12:00:00.000Z",
  nextAction: "Begin setup",
  subscriptionId: "a033a000-0000-4000-8000-000000000031",
  subscriptionVersion: 4,
  customerId: "a033a000-0000-4000-8000-0000000000a1",
  onboardingRequestId: "a033a000-0000-4000-8000-000000000041",
  onboardingVersion: 2,
  setupStartedAt: null,
  checklist: [
    { key: "payment", label: "Payment confirmed", state: "complete" },
    { key: "preferences", label: "Business and service preferences", state: "planned" },
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
    expect(screen.getAllByText("Verified initial settlement").length).toBeGreaterThan(0)
    expect(screen.getAllByText(/A later period is not shown as paid/).length).toBeGreaterThan(0)
    expect(screen.getAllByText("Next action: Begin setup").length).toBeGreaterThan(0)
    expect(screen.getByText("Approve activation")).toBeTruthy()
    expect(document.body.innerHTML).not.toMatch(/<button|Mark active|Provision now|cus_|evt_/)
  })

  it("says when nothing is waiting", () => {
    render(<SetupQueueView items={[]} />)
    expect(screen.getByText("No paid Telloya or Complete subscription is waiting for setup.")).toBeTruthy()
  })

  it("asks for confirmation before beginning setup and then shows the recorded start", () => {
    render(<SetupQueueView beginSetupEnabled items={[item]} />)
    fireEvent.click(screen.getByRole("button", { name: "Begin setup" }))
    const panel = screen.getByRole("region", { name: "Confirm setup for VC-26-HND2AB" })
    expect(panel).toHaveTextContent("Alex Baker")
    expect(panel).toHaveTextContent("Harbour Bakery")
    expect(panel).toHaveTextContent("VC-26-HND2AB")
    expect(panel).toHaveTextContent("Growth · £79.00 a month")
    expect(panel).toHaveTextContent("High Street, Dock")
    expect(panel).toHaveTextContent("£79.00")
    expect(panel).toHaveTextContent("Setup not started")
    const confirm = screen.getByRole("button", { name: "Confirm and begin setup" })
    expect(confirm).toBeDisabled()
    fireEvent.click(screen.getByRole("checkbox"))
    expect(confirm).toBeEnabled()
    cleanup()
    render(<SetupQueueView beginSetupEnabled items={[{
      ...item,
      operationalStatus: "setup_started",
      customerDisplay: "Setup in progress",
      nextAction: "Confirm business preferences",
      setupStartedAt: "2026-11-05T09:15:00.000Z",
    }]} />)
    expect(screen.queryByRole("button", { name: "Begin setup" })).toBeNull()
    expect(document.body).toHaveTextContent("Setup in progress")
    expect(document.body).toHaveTextContent("Next action: Confirm business preferences")
    expect(document.body).toHaveTextContent(/Started /)
  })
})
