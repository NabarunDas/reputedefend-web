// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import "@testing-library/jest-dom/vitest"
import type { HandoverSubscription } from "@/lib/portal/onboarding/handover"
import { HandoverView } from "./handover-view"

afterEach(cleanup)

const paid: HandoverSubscription = {
  reference: "VC-26-HND2AB",
  businessName: "Harbour Bakery",
  product: "Complete",
  locations: [
    { locationId: "a033a000-0000-4000-8000-000000000024", locationName: "Oven" },
    { locationId: "a033a000-0000-4000-8000-000000000025", locationName: "Counter" },
  ],
  guard: {
    included: true,
    status: "pending_setup",
    quantity: 1,
    monitoringActive: false,
    assignment: "pending_confirmation",
    locations: [],
  },
  financialStatus: "verified",
  paymentScope: "initial_settlement",
  periodStart: "2026-11-01T00:00:00.000Z",
  periodEnd: "2026-12-01T00:00:00.000Z",
  operationalStatus: "not_started",
  customerDisplay: "Payment received — setup pending",
  message: "Your subscription payment has been confirmed. We're preparing your service and will guide you through the remaining setup steps.",
  paymentConfirmedAt: "2026-11-04T12:00:00.000Z",
  servicePreferences: null,
  serviceConfiguration: null,
  checklist: [
    { key: "payment", label: "Payment confirmed", state: "complete" },
    { key: "preferences", label: "Business and service preferences", state: "planned" },
    { key: "agent", label: "AI receptionist configuration", state: "planned" },
    { key: "number", label: "Telephone number and forwarding", state: "planned" },
    { key: "test", label: "Test call and verification", state: "planned" },
    { key: "activation", label: "Service activation", state: "planned" },
  ],
}

describe("post-payment setup page", () => {
  it("shows payment received, planned steps, and Guard that is not monitoring", () => {
    render(<HandoverView subscriptions={[paid]} />)
    expect(screen.getByRole("heading", { level: 2, name: "Payment received" })).toBeTruthy()
    expect(screen.getByText("Your subscription payment has been confirmed. We're preparing your service and will guide you through the remaining setup steps.")).toBeTruthy()
    expect(screen.getByText("This confirms the initial settlement for the recorded period. A later period is not shown as paid.")).toBeTruthy()
    expect(screen.getByText("Setup pending")).toBeTruthy()
    expect(screen.getByText("Payment confirmed").parentElement?.textContent).toContain("Complete")
    expect(screen.getByText("Business and service preferences").parentElement?.textContent).toContain("Planned")
    expect(screen.getByText("AI receptionist configuration").parentElement?.textContent).toContain("Planned")
    expect(screen.getByText("Telephone number and forwarding").parentElement?.textContent).toContain("Planned")
    expect(screen.getByText("Service activation").parentElement?.textContent).toContain("Planned")
    expect(screen.getByText("Included in your package. Monitoring setup is pending.")).toBeTruthy()
    expect(screen.getByText("1 location included. Monitoring has not started.")).toBeTruthy()
    expect(screen.getByText("Guard location assignment is pending confirmation.")).toBeTruthy()
    expect(screen.getAllByText("Oven")).toHaveLength(1)
    expect(document.body.textContent).not.toMatch(/Setup in progress|Mark active|Provision now|cus_|evt_/)
  })

  it("shows setup in progress without completing the remaining steps", () => {
    render(<HandoverView subscriptions={[{
      ...paid,
      operationalStatus: "setup_started",
      customerDisplay: "Setup in progress",
      message: null,
      servicePreferences: {
        state: "partial",
        confirmedCount: 1,
        locationCount: 2,
        locations: [
          {
            locationId: paid.locations[0].locationId,
            locationName: "Oven",
            status: "recorded",
            timezone: "Europe/London",
            hoursSummary: "Monday 09:00–17:30",
            greeting: "Thank you for calling.",
            callbackInstructions: "Offer a callback on Monday morning.",
            spokenLanguage: "en-GB",
            additionalLanguages: [],
            voicePresentation: "No preference",
            accent: "British",
            customerConfirmedAt: "2026-11-04T15:00:00.000Z",
            recordedBy: "Your setup team",
            note: "Recorded by your setup team from your confirmation. You will still confirm the service before it is activated. The receptionist is not configured or active.",
          },
          {
            locationId: paid.locations[1].locationId,
            locationName: "Counter",
            status: "needed",
            timezone: null,
            hoursSummary: null,
            greeting: null,
            callbackInstructions: null,
            spokenLanguage: null,
            additionalLanguages: [],
            voicePresentation: null,
            accent: null,
            customerConfirmedAt: null,
            recordedBy: null,
            note: null,
          },
        ],
      },
    }]} />)
    expect(screen.getByRole("heading", { level: 2, name: "Setup in progress" })).toBeTruthy()
    expect(screen.getByText("This confirms the initial settlement for the recorded period. A later period is not shown as paid.")).toBeTruthy()
    expect(screen.getByText(/Payment confirmed 4 Nov 2026/)).toBeTruthy()
    expect(screen.getByText("Payment confirmed").parentElement?.textContent).toContain("Complete")
    expect(screen.getByText("Business and service preferences").parentElement?.textContent).toContain("Planned")
    expect(screen.getByText("AI receptionist configuration").parentElement?.textContent).toContain("Planned")
    expect(screen.getByText("Telephone number and forwarding").parentElement?.textContent).toContain("Planned")
    expect(screen.getByText("Test call and verification").parentElement?.textContent).toContain("Planned")
    expect(screen.getByText("Service activation").parentElement?.textContent).toContain("Planned")
    expect(screen.getByText("1 location included. Monitoring has not started.")).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/Service active|Open dashboard|Mark active/)
    expect(screen.getByText("Preferences are recorded for 1 of 2 locations. The others are still needed.")).toBeTruthy()
    expect(screen.getByText("Preferences for this location are still needed.")).toBeTruthy()
    expect(screen.getByText(/The receptionist is not configured or active/)).toBeTruthy()
  })

  it("shows only a recorded Guard assignment", () => {
    render(<HandoverView subscriptions={[{
      ...paid,
      guard: {
        included: true,
        status: "pending_setup",
        quantity: 1,
        monitoringActive: false,
        assignment: "recorded",
        locations: [{ locationId: "a033a000-0000-4000-8000-000000000025", locationName: "Counter" }],
      },
    }]} />)
    expect(screen.getAllByText("Counter")).toHaveLength(2)
    expect(screen.queryByText("Guard location assignment is pending confirmation.")).toBeNull()
    expect(screen.getAllByText("Oven")).toHaveLength(1)
  })

  it("keeps Guard optional on a Telloya subscription", () => {
    render(<HandoverView subscriptions={[{
      ...paid,
      product: "Telloya",
      reference: "VC-26-HND2AC",
      guard: { included: false, status: "not_subscribed", quantity: 0, monitoringActive: false, assignment: "not_applicable", locations: [] },
    }]} />)
    expect(screen.getByText("Relaunch Guard is not included in this subscription.")).toBeTruthy()
    expect(screen.queryByText("Included in your package. Monitoring setup is pending.")).toBeNull()
  })

  it("does not describe an unpaid subscription as payment received", () => {
    render(<HandoverView subscriptions={[{
      ...paid,
      financialStatus: "awaiting_payment",
      paymentScope: null,
      periodStart: null,
      periodEnd: null,
      customerDisplay: "Payment pending",
      message: null,
      paymentConfirmedAt: null,
      checklist: paid.checklist.map(step => step.key === "payment" ? { ...step, state: "planned" } : step),
    }]} />)
    expect(screen.getByRole("heading", { level: 2, name: "Payment pending" })).toBeTruthy()
    expect(screen.queryByRole("heading", { name: "Payment received" })).toBeNull()
    expect(screen.getByText("Payment confirmed").parentElement?.textContent).toContain("Planned")
  })

  it("says a recorded configuration is still waiting for telephone setup", () => {
    render(<HandoverView subscriptions={[{
      ...paid,
      operationalStatus: "setup_started",
      customerDisplay: "Setup in progress",
      message: "Your AI receptionist configuration has been recorded. We're completing the telephone setup and service checks.",
      checklist: paid.checklist.map(step => step.key === "agent" ? { ...step, state: "complete" as const } : step),
      servicePreferences: {
        state: "complete",
        confirmedCount: 2,
        locationCount: 2,
        locations: [
          {
            locationId: paid.locations[0].locationId,
            locationName: "Oven",
            status: "recorded",
            timezone: "Europe/London",
            hoursSummary: "Monday 09:00–17:30",
            greeting: "Thank you for calling.",
            callbackInstructions: "Offer a callback on Monday morning.",
            spokenLanguage: "en-GB",
            additionalLanguages: [],
            voicePresentation: "No preference",
            accent: "British",
            customerConfirmedAt: "2026-11-04T15:00:00.000Z",
            recordedBy: "Your setup team",
            note: "Recorded by your setup team from your confirmation. You will still confirm the service before it is activated. The receptionist is not configured or active.",
          },
          {
            locationId: paid.locations[1].locationId,
            locationName: "Counter",
            status: "recorded",
            timezone: "Europe/London",
            hoursSummary: "Monday 09:00–17:30",
            greeting: "Thank you for calling.",
            callbackInstructions: "Offer a callback on Monday morning.",
            spokenLanguage: "en-GB",
            additionalLanguages: [],
            voicePresentation: "No preference",
            accent: null,
            customerConfirmedAt: "2026-11-04T15:00:00.000Z",
            recordedBy: "Your setup team",
            note: "Recorded by your setup team from your confirmation. You will still confirm the service before it is activated. The receptionist is not configured or active.",
          },
        ],
      },
      serviceConfiguration: {
        state: "recorded",
        recordedCount: 2,
        locationCount: 2,
        locations: [
          {
            locationId: paid.locations[0].locationId,
            locationName: "Oven",
            status: "recorded",
            note: "Your AI receptionist configuration has been recorded. We're completing the telephone setup and service checks.",
          },
          {
            locationId: paid.locations[1].locationId,
            locationName: "Counter",
            status: "recorded",
            note: "Your AI receptionist configuration has been recorded. We're completing the telephone setup and service checks.",
          },
        ],
      },
    }]} />)
    expect(screen.getAllByText("Your AI receptionist configuration has been recorded. We're completing the telephone setup and service checks.").length).toBeGreaterThan(0)
    const checklist = screen.getByRole("list", { name: "Complete setup" }).textContent ?? ""
    expect(checklist).toContain("AI receptionist configuration")
    expect(checklist).toContain("Complete")
    expect(checklist).toContain("Telephone number and forwarding")
    expect(checklist).toContain("Test call and verification")
    expect(checklist).not.toContain("Telephone number and forwardingComplete")
    expect(document.body.textContent).not.toContain("The receptionist is not configured or active")
    expect(document.body.textContent).not.toMatch(/can answer calls|is live|forwarding is complete|test call passed/)
  })
})
