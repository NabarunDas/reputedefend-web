// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import type { SetupQueueItem } from "@/lib/commercial/setup-queue"
import { SetupQueueView } from "./setup-queue-view"

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }))

afterEach(() => {
  cleanup()
  refresh.mockClear()
})

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
  preferenceProgress: null,
  configurationProgress: null,
  allocationProgress: null,
  forwardingProgress: null,
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
    expect(screen.getByText("Verify AI receptionist test call")).toBeTruthy()
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

  it("reviews every material preference and drops a stale confirmation", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ message: "Business preferences are recorded for this location. The queue shows what is still needed." }) })
    vi.stubGlobal("fetch", fetchMock)
    render(<SetupQueueView confirmPreferencesEnabled items={[{
      ...item,
      operationalStatus: "setup_started",
      customerDisplay: "Setup in progress",
      nextAction: "Confirm business preferences",
      setupStartedAt: "2026-11-05T09:15:00.000Z",
      preferenceProgress: {
        confirmedCount: 1,
        locationCount: 3,
        locations: [
          { locationId: item.locations[0].locationId, locationName: "High Street", confirmed: true, version: 1 },
          { locationId: item.locations[1].locationId, locationName: "Dock", confirmed: false, version: 0 },
          { locationId: "a033a000-0000-4000-8000-000000000026", locationName: "Yard", confirmed: false, version: 0 },
        ],
      },
    }]} />)
    expect(screen.getByText("Business preferences: 1 of 3 locations confirmed. Still needed: Dock, Yard.")).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Confirm business preferences" }))
    const panel = screen.getByRole("region", { name: "Confirm business preferences for VC-26-HND2AB" })
    fireEvent.click(within(panel).getByRole("checkbox", { name: "monday closed" }))
    fireEvent.change(within(panel).getByLabelText("Opens"), { target: { value: "09:00" } })
    fireEvent.change(within(panel).getByLabelText("Closes"), { target: { value: "17:30" } })
    fireEvent.change(within(panel).getByLabelText("Breaks"), { target: { value: "12:00-12:30" } })
    fireEvent.change(within(panel).getByLabelText("Exceptional hours"), { target: { value: "Christmas Day is closed." } })
    fireEvent.change(within(panel).getByLabelText("Out of hours"), { target: { value: "Take a message and say the business is closed." } })
    fireEvent.change(within(panel).getByLabelText("Greeting"), { target: { value: "Thank you for calling Harbour Bakery." } })
    fireEvent.change(within(panel).getByLabelText("Enquiry details"), { target: { value: "Caller name, Callback number" } })
    fireEvent.change(within(panel).getByLabelText("Urgent calls"), { target: { value: "There is no emergency cover." } })
    fireEvent.change(within(panel).getByLabelText("When to contact the business"), { target: { value: "Pass the caller through only when they ask." } })
    fireEvent.change(within(panel).getByLabelText("Special instructions"), { target: { value: "Use the bakery name in the greeting." } })
    fireEvent.change(within(panel).getByLabelText("Instructions"), { target: { value: "Offer a Monday morning callback." } })
    fireEvent.change(within(panel).getByLabelText("Windows"), { target: { value: "monday 10:00 12:00" } })
    fireEvent.change(within(panel).getByLabelText("Additional languages"), { target: { value: "cy" } })
    fireEvent.change(within(panel).getByLabelText("Accent"), { target: { value: "British" } })
    fireEvent.change(within(panel).getByLabelText("Pronunciation notes"), { target: { value: "Harbour sounds like harbour." } })
    fireEvent.change(within(panel).getByLabelText("Staff attestation"), { target: { value: "The customer confirmed these preferences by telephone." } })
    fireEvent.change(within(panel).getByLabelText("Customer confirmed at"), { target: { value: "2026-11-04T15:00" } })
    fireEvent.click(within(panel).getByRole("button", { name: "Review confirmation" }))
    for (const text of [
      "Alex Baker",
      "Harbour Bakery",
      "VC-26-HND2AB",
      "Dock",
      "Europe/London",
      "Monday 09:00–17:30 (break 12:00-12:30)",
      "Tuesday closed",
      "Wednesday closed",
      "Thursday closed",
      "Friday closed",
      "Saturday closed",
      "Sunday closed",
      "Christmas Day is closed.",
      "Take a message and say the business is closed.",
      "Thank you for calling Harbour Bakery.",
      "Caller name, Callback number",
      "Offer a Monday morning callback.",
      "monday 10:00 12:00",
      "There is no emergency cover.",
      "Pass the caller through only when they ask.",
      "Use the bakery name in the greeting.",
      "en-GB",
      "cy",
      "No preference",
      "British",
      "Harbour sounds like harbour.",
      "Telephone",
      "No email or message reference",
      "The customer confirmed these preferences by telephone.",
      "2026-11-04T15:00",
    ]) expect(panel).toHaveTextContent(text)
    const record = within(panel).getByRole("button", { name: "Confirm business preferences" })
    expect(record).toBeDisabled()
    fireEvent.click(within(panel).getByRole("checkbox", { name: /I confirm the customer agreed these displayed preferences/ }))
    expect(record).toBeEnabled()
    fireEvent.change(within(panel).getByLabelText("Opens"), { target: { value: "10:00" } })
    expect(within(panel).queryByRole("checkbox", { name: /I confirm the customer agreed/ })).toBeNull()
    expect(within(panel).queryByRole("button", { name: "Confirm business preferences" })).toBeNull()
    fireEvent.click(within(panel).getByRole("button", { name: "Review confirmation" }))
    fireEvent.click(within(panel).getByRole("checkbox", { name: /I confirm the customer agreed these displayed preferences/ }))
    fireEvent.change(within(panel).getByLabelText("Location"), { target: { value: "a033a000-0000-4000-8000-000000000026" } })
    expect(within(panel).queryByRole("checkbox", { name: /I confirm the customer agreed/ })).toBeNull()
    fireEvent.change(within(panel).getByLabelText("Location"), { target: { value: item.locations[1].locationId } })
    fireEvent.change(within(panel).getByLabelText("Source"), { target: { value: "recorded_email" } })
    fireEvent.change(within(panel).getByLabelText("Evidence reference"), { target: { value: "a033a000-0000-4000-8000-000000000091" } })
    fireEvent.click(within(panel).getByRole("button", { name: "Review confirmation" }))
    expect(panel).toHaveTextContent("Recorded customer email")
    expect(panel).toHaveTextContent("a033a000-0000-4000-8000-000000000091")
    fireEvent.click(within(panel).getByRole("checkbox", { name: /I confirm the customer agreed these displayed preferences/ }))
    fireEvent.change(within(panel).getByLabelText("Evidence reference"), { target: { value: "a033a000-0000-4000-8000-000000000092" } })
    expect(within(panel).queryByRole("checkbox", { name: /I confirm the customer agreed/ })).toBeNull()
    fireEvent.change(within(panel).getByLabelText("Customer confirmed at"), { target: { value: "" } })
    fireEvent.click(within(panel).getByRole("button", { name: "Review confirmation" }))
    expect(screen.getByRole("alert")).toHaveTextContent("Enter the date and time the customer confirmed these preferences.")
    fireEvent.change(within(panel).getByLabelText("Customer confirmed at"), { target: { value: "2026-12-01T12:00" } })
    fireEvent.click(within(panel).getByRole("button", { name: "Review confirmation" }))
    expect(screen.getByRole("alert")).toHaveTextContent("The confirmation time cannot be in the future.")
    fireEvent.change(within(panel).getByLabelText("Customer confirmed at"), { target: { value: "2026-11-04T15:00" } })
    fireEvent.click(within(panel).getByRole("button", { name: "Review confirmation" }))
    fireEvent.click(within(panel).getByRole("checkbox", { name: /I confirm the customer agreed these displayed preferences/ }))
    fireEvent.click(within(panel).getByRole("button", { name: "Confirm business preferences" }))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const firstKey = fetchMock.mock.calls[0][1].headers["idempotency-key"]
    expect(firstKey).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i)
    const submitted = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(submitted.locationId).toBe(item.locations[1].locationId)
    expect(submitted.preferences.greeting).toBe("Thank you for calling Harbour Bakery.")
    expect(submitted.preferences.openingHours[0]).toMatchObject({ day: "monday", opens: "10:00", closes: "17:30" })
    expect(submitted.confirmation).toMatchObject({
      source: "recorded_email",
      communicationId: "a033a000-0000-4000-8000-000000000092",
      messageId: null,
      attestation: "The customer confirmed these preferences by telephone.",
      customerConfirmedAt: new Date("2026-11-04T15:00").toISOString(),
    })
    vi.unstubAllGlobals()
  })

  it("reviews the confirmed preferences and drops a stale provider record", () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ message: "The AI configuration is recorded for this location. Testing is still required. The receptionist is not live." }) })
    vi.stubGlobal("fetch", fetchMock)
    const high = item.locations[0].locationId
    const dock = item.locations[1].locationId
    const yard = "a033a000-0000-4000-8000-000000000026"
    const location = (id: string, name: string, status: "needed" | "review" | "recorded") => ({
      locationId: id,
      locationName: name,
      status,
      configurationVersion: status === "needed" ? 0 : 1,
      preferenceVersion: 2,
      provisionVersion: status === "recorded" ? 2 : 1,
      timezone: "Europe/London",
      hoursSummary: "Monday 09:00–17:30",
      greeting: `Thank you for calling ${name}.`,
      exceptionalHours: "Christmas Day is closed.",
      outOfHours: "Take a message.",
      callbackInstructions: "Offer a Monday morning callback.",
      urgentRules: "There is no emergency cover.",
      directContactRules: "Pass the caller through only when they ask.",
      specialInstructions: null,
      spokenLanguage: "en-GB",
      additionalLanguages: ["cy"],
      voicePresentation: "no_preference" as const,
      accent: "British",
      pronunciationNotes: null,
      environment: status === "needed" ? null : "dev" as const,
      agentRef: status === "needed" ? null : "agent-high-01",
      providerRevision: status === "needed" ? null : "rev-0004",
      chosenVoice: status === "needed" ? null : "Harbour",
      chosenLanguage: status === "needed" ? null : "en-GB",
      verificationBasis: status === "needed" ? null : "OPERATOR_ATTESTED" as const,
      attestation: status === "needed" ? null : "The operator checked the provider console for this location.",
    })
    render(<SetupQueueView confirmAiConfigurationEnabled providerLane="dev" items={[{
      ...item,
      operationalStatus: "setup_started",
      customerDisplay: "Setup in progress",
      nextAction: "Confirm AI configuration",
      setupStartedAt: "2026-11-05T09:15:00.000Z",
      preferenceProgress: {
        confirmedCount: 3,
        locationCount: 3,
        locations: [
          { locationId: high, locationName: "High Street", confirmed: true, version: 2 },
          { locationId: dock, locationName: "Dock", confirmed: true, version: 1 },
          { locationId: yard, locationName: "Yard", confirmed: true, version: 1 },
        ],
      },
      configurationProgress: {
        recordedCount: 1,
        reviewCount: 1,
        locationCount: 3,
        locations: [
          location(high, "High Street", "recorded"),
          location(dock, "Dock", "review"),
          location(yard, "Yard", "needed"),
        ],
      },
    }]} />)
    expect(screen.getByText("AI configuration: 1 of 3 locations recorded. Review needed: Dock.")).toBeTruthy()
    expect(screen.getByText("Dock: Configuration requiring review because preferences changed. Preferences confirmed.")).toBeTruthy()
    expect(screen.queryByRole("listitem", { name: "Confirm AI configuration" })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Review AI configuration" }))
    const panel = screen.getByRole("region", { name: "Confirm AI configuration for VC-26-HND2AB" })
    expect(panel).toHaveTextContent("Thank you for calling Dock.")
    expect(panel).toHaveTextContent("Monday 09:00–17:30")
    expect(panel).toHaveTextContent("Configuration requiring review because preferences changed")
    expect(panel).not.toHaveTextContent("The receptionist can answer")
    expect(panel).toHaveTextContent("Accepted revision form: rev- and exactly four digits, for example rev-0004.")
    fireEvent.change(within(panel).getByLabelText("Provider agent reference"), { target: { value: "agent-dock-01" } })
    fireEvent.change(within(panel).getByLabelText("Configuration revision"), { target: { value: "fingerprint" } })
    fireEvent.change(within(panel).getByLabelText("Chosen provider voice"), { target: { value: "Harbour" } })
    fireEvent.change(within(panel).getByLabelText("Chosen provider language"), { target: { value: "en-GB" } })
    fireEvent.change(within(panel).getByLabelText("Staff attestation"), { target: { value: "The operator recorded this configuration in the provider console." } })
    fireEvent.click(within(panel).getByRole("button", { name: "Review configuration" }))
    expect(panel).toHaveTextContent("Enter the provider revision as rev- followed by exactly four digits, for example rev-0004.")
    fireEvent.change(within(panel).getByLabelText("Configuration revision"), { target: { value: "rev-0007" } })
    fireEvent.change(within(panel).getByLabelText("Chosen provider voice"), { target: { value: "Harbour" } })
    fireEvent.change(within(panel).getByLabelText("Chosen provider language"), { target: { value: "en-GB" } })
    fireEvent.change(within(panel).getByLabelText("Staff attestation"), { target: { value: "The operator recorded this configuration in the provider console." } })
    fireEvent.click(within(panel).getByRole("button", { name: "Review configuration" }))
    expect(panel).toHaveTextContent("Provider lane: DEV")
    expect(within(panel).queryByLabelText("Environment")).toBeNull()
    expect(panel).toHaveTextContent("Operator attested. Not independently checked.")
    expect(panel).toHaveTextContent("Configuration recorded — test pending")
    fireEvent.change(within(panel).getByLabelText("Provider agent reference"), { target: { value: "agent-dock-02" } })
    expect(within(panel).queryByRole("checkbox", { name: /authorised operator recorded/ })).toBeNull()
    fireEvent.click(within(panel).getByRole("button", { name: "Review configuration" }))
    fireEvent.click(within(panel).getByRole("checkbox", { name: /authorised operator recorded this provider evidence/ }))
    fireEvent.click(within(panel).getByRole("button", { name: "Confirm AI configuration" }))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const submitted = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(submitted.locationId).toBe(dock)
    expect(submitted.preferenceVersion).toBe(2)
    expect(submitted.provider).toMatchObject({
      provider: "telloya_voice",
      environment: "dev",
      agentRef: "agent-dock-02",
      revision: "rev-0007",
      chosenVoice: "Harbour",
      chosenLanguage: "en-GB",
      staffConfirmed: true,
    })
    expect(submitted.provider.attestation).toContain("provider console")
    vi.unstubAllGlobals()
  })

  it("reviews an assigned number and clears the review when the number changes", () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ message: "The telephone number is recorded for this location. It is not active. Forwarding and testing are still required." }) })
    vi.stubGlobal("fetch", fetchMock)
    const high = item.locations[0].locationId
    const dock = item.locations[1].locationId
    render(<SetupQueueView recordNumberAllocationEnabled providerLane="dev" items={[{
      ...item,
      operationalStatus: "setup_started",
      customerDisplay: "Setup in progress",
      nextAction: "Record provider and number allocation",
      setupStartedAt: "2026-11-05T09:15:00.000Z",
      preferenceProgress: {
        confirmedCount: 2,
        locationCount: 2,
        locations: [
          { locationId: high, locationName: "High Street", confirmed: true, version: 1 },
          { locationId: dock, locationName: "Dock", confirmed: true, version: 1 },
        ],
      },
      configurationProgress: {
        recordedCount: 2,
        reviewCount: 0,
        locationCount: 2,
        locations: [high, dock].map(id => ({
          locationId: id,
          locationName: id === high ? "High Street" : "Dock",
          status: "recorded" as const,
          configurationVersion: 1,
          preferenceVersion: 1,
          provisionVersion: 2,
          timezone: "Europe/London",
          hoursSummary: "Monday 09:00–17:30",
          greeting: "Thank you for calling.",
          exceptionalHours: "Christmas Day is closed.",
          outOfHours: "Take a message.",
          callbackInstructions: "Offer a Monday morning callback.",
          urgentRules: "There is no emergency cover.",
          directContactRules: "Pass the caller through only when they ask.",
          specialInstructions: null,
          spokenLanguage: "en-GB",
          additionalLanguages: [],
          voicePresentation: "no_preference" as const,
          accent: "British",
          pronunciationNotes: null,
          environment: "dev" as const,
          agentRef: id === high ? "agent-high-01" : "agent-dock-01",
          providerRevision: "rev-0004",
          chosenVoice: "Harbour",
          chosenLanguage: "en-GB",
          verificationBasis: "OPERATOR_ATTESTED" as const,
          attestation: "The operator checked the provider console for this location.",
        })),
      },
      allocationProgress: {
        recordedCount: 1,
        reviewCount: 0,
        locationCount: 2,
        locations: [
          {
            locationId: high,
            locationName: "High Street",
            status: "recorded" as const,
            allocationVersion: 1,
            configurationVersion: 1,
            preferenceVersion: 1,
            provisionVersion: 3,
            environment: "dev" as const,
            agentRef: "agent-high-01",
            e164: "+441632960441",
            allocationRef: "evidence-high-01",
            verificationBasis: "OPERATOR_ATTESTED" as const,
            attestation: "The operator recorded the assigned number.",
            recordedAt: "2026-11-05T10:00:00.000Z",
          },
          {
            locationId: dock,
            locationName: "Dock",
            status: "needed" as const,
            allocationVersion: 0,
            configurationVersion: 1,
            preferenceVersion: 1,
            provisionVersion: 2,
            environment: null,
            agentRef: null,
            e164: null,
            allocationRef: null,
            verificationBasis: null,
            attestation: null,
            recordedAt: null,
          },
        ],
      },
    }]} />)
    expect(screen.getByText("Telephone numbers: 1 of 2 locations recorded.")).toBeTruthy()
    expect(screen.queryByRole("listitem", { name: "Record provider and number allocation" })).toBeNull()
    expect(document.body.textContent).toContain("The number is not active.")
    fireEvent.click(screen.getByRole("button", { name: "Record telephone number" }))
    const panel = screen.getByRole("region", { name: "Record telephone number for VC-26-HND2AB" })
    expect(panel).toHaveTextContent("does not buy a number")
    expect(panel).toHaveTextContent("Provider environment")
    expect(panel).toHaveTextContent("DEV")
    expect(within(panel).queryByLabelText("Environment")).toBeNull()
    fireEvent.change(within(panel).getByLabelText("Assigned telephone number"), { target: { value: "+441632960442" } })
    fireEvent.change(within(panel).getByLabelText("Provider allocation reference"), { target: { value: "evidence-dock-01" } })
    fireEvent.change(within(panel).getByLabelText("Staff attestation"), { target: { value: "The operator recorded this assigned number from the provider allocation." } })
    fireEvent.click(within(panel).getByRole("button", { name: "Review allocation" }))
    expect(panel).toHaveTextContent("Operator attested. This is not an independent check")
    expect(panel).toHaveTextContent("Number recorded — not active")
    fireEvent.change(within(panel).getByLabelText("Assigned telephone number"), { target: { value: "+441632960443" } })
    expect(within(panel).queryByRole("checkbox", { name: /authorised operator recorded this assigned number/ })).toBeNull()
    fireEvent.click(within(panel).getByRole("button", { name: "Review allocation" }))
    fireEvent.click(within(panel).getByRole("checkbox", { name: /authorised operator recorded this assigned number/ }))
    fireEvent.click(within(panel).getByRole("button", { name: "Record telephone number" }))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const submitted = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(submitted.locationId).toBe(dock)
    expect(submitted.allocationVersion).toBe(0)
    expect(submitted.configurationVersion).toBe(1)
    expect(submitted.provider).toMatchObject({
      environment: "dev",
      agentRef: "agent-dock-01",
      e164: "+441632960443",
      allocationRef: "evidence-dock-01",
      staffConfirmed: true,
    })
    vi.unstubAllGlobals()
  })

  it("saves a draft and then shares it with a new key and the recorded version", async () => {
    const draftMessage = "The forwarding instructions are saved as a draft. They are not visible to the customer, and forwarding is not enabled."
    const shareMessage = "The forwarding instructions are shared in the customer portal. Forwarding is not enabled, and the receptionist is not live."
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ message: draftMessage, instructionVersion: 5, sharingStatus: "DRAFT" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ message: shareMessage, instructionVersion: 6, sharingStatus: "SHARED" }) })
    vi.stubGlobal("fetch", fetchMock)
    render(forwardingView())
    expect(screen.queryByRole("button", { name: "Enable forwarding" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Confirm and share instructions" })).toBeNull()
    prepareForwarding()
    fireEvent.click(screen.getByRole("button", { name: "Review instructions" }))
    fireEvent.click(screen.getByRole("checkbox", { name: acknowledgement }))
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }))
    expect(await screen.findByText(draftMessage)).toBeTruthy()
    expect(screen.queryByRole("checkbox", { name: acknowledgement })).toBeNull()
    const draft = sent(fetchMock, 0)
    expect(draft.body.instructionVersion).toBe(0)
    expect(draft.body.provisionVersion).toBe(3)
    expect(draft.body.allocationId).toBe(allocationId)
    expect(draft.body.allocationVersion).toBe(1)
    expect(draft.body.instruction.status).toBe("DRAFT")
    fireEvent.click(screen.getByRole("button", { name: "Review instructions" }))
    fireEvent.click(screen.getByRole("checkbox", { name: acknowledgement }))
    fireEvent.click(screen.getByRole("button", { name: "Confirm and share instructions" }))
    expect(await screen.findByText(shareMessage)).toBeTruthy()
    const share = sent(fetchMock, 1)
    expect(share.body.instructionVersion).toBe(5)
    expect(share.body.provisionVersion).toBe(3)
    expect(share.body.allocationVersion).toBe(1)
    expect(share.body.instruction.status).toBe("SHARED")
    expect(share.body.instruction.staffConfirmed).toBe(true)
    expect(share.key).toMatch(uuidKey)
    expect(share.key).not.toBe(draft.key)
    vi.unstubAllGlobals()
  })

  it("reuses the idempotency key only while the same request is still uncertain", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ ok: true, json: async () => ({ message: "The forwarding instructions are saved as a draft. They are not visible to the customer, and forwarding is not enabled.", instructionVersion: 1, sharingStatus: "DRAFT" }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ message: "The forwarding instructions are saved as a draft. They are not visible to the customer, and forwarding is not enabled.", instructionVersion: 2, sharingStatus: "DRAFT" }) })
    vi.stubGlobal("fetch", fetchMock)
    render(forwardingView())
    prepareForwarding()
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }))
    expect(await screen.findByText("We couldn’t record the forwarding instructions. Check the connection and try again.")).toBeTruthy()
    expect(screen.queryByText("The forwarding instructions are saved as a draft. They are not visible to the customer, and forwarding is not enabled.")).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }))
    expect(await screen.findByText("The forwarding instructions are saved as a draft. They are not visible to the customer, and forwarding is not enabled.")).toBeTruthy()
    expect(sent(fetchMock, 1).key).toBe(sent(fetchMock, 0).key)
    expect(sent(fetchMock, 1).body).toEqual(sent(fetchMock, 0).body)
    fireEvent.change(screen.getByLabelText("Instruction revision"), { target: { value: "guide-0002" } })
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }))
    expect(await screen.findByText("The forwarding instructions are saved as a draft. They are not visible to the customer, and forwarding is not enabled.")).toBeTruthy()
    expect(sent(fetchMock, 2).key).not.toBe(sent(fetchMock, 0).key)
    expect(sent(fetchMock, 2).body.instruction.instructionRevision).toBe("guide-0002")
    expect(sent(fetchMock, 2).body.instructionVersion).toBe(1)
    vi.unstubAllGlobals()
  })

  it("shares only after review and an explicit acknowledgement", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ message: "The forwarding instructions are shared in the customer portal. Forwarding is not enabled, and the receptionist is not live.", instructionVersion: 1, sharingStatus: "SHARED" }) })
    vi.stubGlobal("fetch", fetchMock)
    render(forwardingView())
    prepareForwarding()
    expect(screen.queryByRole("button", { name: "Confirm and share instructions" })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Review instructions" }))
    expect(fetchMock).not.toHaveBeenCalled()
    const confirm = screen.getByRole("button", { name: "Confirm and share instructions" })
    expect(confirm).toBeDisabled()
    expect(screen.getByRole("checkbox", { name: acknowledgement })).not.toBeChecked()
    fireEvent.click(confirm)
    expect(fetchMock).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("checkbox", { name: acknowledgement }))
    expect(confirm).toBeEnabled()
    fireEvent.click(confirm)
    expect(await screen.findByText("The forwarding instructions are shared in the customer portal. Forwarding is not enabled, and the receptionist is not live.")).toBeTruthy()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(sent(fetchMock, 0).body.instruction.staffConfirmed).toBe(true)
    expect(sent(fetchMock, 0).body.instruction.status).toBe("SHARED")
    vi.unstubAllGlobals()
  })

  it("drops the acknowledgement when any material field changes", () => {
    render(forwardingView({
      locations: [
        forwardingLocation(),
        forwardingLocation({
          locationId: item.locations[1].locationId,
          locationName: "Dock",
          allocationId: "a033a000-0000-4000-8000-000000000073",
          e164: "+441632960450",
        }),
      ],
      locationCount: 2,
    }))
    prepareForwarding()
    const lose = (change: () => void) => {
      fireEvent.click(screen.getByRole("button", { name: "Review instructions" }))
      fireEvent.click(screen.getByRole("checkbox", { name: acknowledgement }))
      expect(screen.getByRole("checkbox", { name: acknowledgement })).toBeChecked()
      change()
      expect(screen.queryByRole("checkbox", { name: acknowledgement })).toBeNull()
      expect(screen.queryByRole("button", { name: "Confirm and share instructions" })).toBeNull()
    }
    lose(() => fireEvent.change(screen.getByLabelText("Forwarding method"), { target: { value: "BUSY" } }))
    lose(() => fireEvent.click(screen.getByRole("checkbox", { name: "The telephone provider is known" })))
    fireEvent.change(screen.getByLabelText("Telephone provider"), { target: { value: "Example Telecom" } })
    lose(() => fireEvent.change(screen.getByLabelText("Customer telephone, if known"), { target: { value: "+441632960100" } }))
    lose(() => fireEvent.change(screen.getByLabelText("Instruction revision"), { target: { value: "guide-0008" } }))
    lose(() => fireEvent.change(screen.getByLabelText("Instructions"), { target: { value: `${(screen.getByLabelText("Instructions") as HTMLTextAreaElement).value} Revised.` } }))
    lose(() => fireEvent.change(screen.getByLabelText("Staff attestation"), { target: { value: "The operator checked the revised notes against the current allocation." } }))
    lose(() => fireEvent.change(screen.getByLabelText("Location"), { target: { value: item.locations[1].locationId } }))
    fireEvent.change(screen.getByLabelText("Location"), { target: { value: item.locations[0].locationId } })
    prepareForwarding()
    fireEvent.click(screen.getByRole("button", { name: "Review instructions" }))
    fireEvent.click(screen.getByRole("checkbox", { name: acknowledgement }))
    cleanup()
    const { rerender } = render(forwardingView())
    prepareForwarding()
    fireEvent.click(screen.getByRole("button", { name: "Review instructions" }))
    fireEvent.click(screen.getByRole("checkbox", { name: acknowledgement }))
    rerender(forwardingView({
      locations: [forwardingLocation({ allocationId: "a033a000-0000-4000-8000-000000000074", allocationVersion: 2, e164: "+441632960460" })],
    }))
    expect(screen.queryByRole("checkbox", { name: acknowledgement })).toBeNull()
    expect((screen.getByLabelText("Instructions") as HTMLTextAreaElement).value).toContain("+441632960460")
  })

  it("submits the immutable snapshot taken at review", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ message: "The forwarding instructions are shared in the customer portal. Forwarding is not enabled, and the receptionist is not live.", instructionVersion: 1, sharingStatus: "SHARED" }) })
    vi.stubGlobal("fetch", fetchMock)
    const instruction = `${forwardingCopy(number)} Snapshot check.`
    render(forwardingView())
    prepareForwarding(instruction)
    fireEvent.change(screen.getByLabelText("Forwarding method"), { target: { value: "UNANSWERED" } })
    fireEvent.click(screen.getByRole("checkbox", { name: "The telephone provider is known" }))
    fireEvent.change(screen.getByLabelText("Telephone provider"), { target: { value: "Example Telecom" } })
    fireEvent.change(screen.getByLabelText("Customer telephone, if known"), { target: { value: "+441632960100" } })
    fireEvent.change(screen.getByLabelText("Instruction revision"), { target: { value: "guide-0004" } })
    fireEvent.click(screen.getByRole("button", { name: "Review instructions" }))
    const summary = screen.getByRole("region", { name: "Review forwarding instructions for VC-26-HND2AB" })
    expect(summary).toHaveTextContent("Alex Baker")
    expect(summary).toHaveTextContent("Harbour Bakery")
    expect(summary).toHaveTextContent("VC-26-HND2AB")
    expect(summary).toHaveTextContent("High Street")
    expect(summary).toHaveTextContent("Version 1. +441632960441")
    expect(summary).toHaveTextContent("agent-high-01, configuration version 1")
    expect(summary).toHaveTextContent("Unanswered calls")
    expect(summary).toHaveTextContent("Example Telecom")
    expect(summary).toHaveTextContent("+441632960100")
    expect(summary).toHaveTextContent("guide-0004")
    expect(summary).toHaveTextContent(instruction)
    expect(summary).toHaveTextContent(notice)
    expect(summary).toHaveTextContent(attestation)
    expect(summary).toHaveTextContent("does not enable call forwarding or activate the receptionist")
    const expected = {
      subscriptionId: item.subscriptionId,
      version: item.subscriptionVersion,
      customerId: item.customerId,
      businessId: item.businessId,
      onboardingRequestId: item.onboardingRequestId,
      onboardingVersion: item.onboardingVersion,
      locationId: item.locations[0].locationId,
      preferenceVersion: 1,
      provisionVersion: 3,
      configurationVersion: 1,
      allocationId,
      allocationVersion: 1,
      instructionVersion: 0,
      instruction: {
        environment: "dev",
        forwardingMode: "UNANSWERED",
        carrierKnown: true,
        carrierName: "Example Telecom",
        customerTelephone: "+441632960100",
        instructionRevision: "guide-0004",
        instructionText: instruction,
        attestation,
        staffConfirmed: true,
        status: "SHARED",
      },
    }
    fireEvent.change(screen.getByLabelText("Instructions"), { target: { value: `${instruction} This edit must not be submitted.` } })
    expect(screen.queryByRole("button", { name: "Confirm and share instructions" })).toBeNull()
    fireEvent.change(screen.getByLabelText("Instructions"), { target: { value: instruction } })
    fireEvent.click(screen.getByRole("button", { name: "Review instructions" }))
    fireEvent.click(screen.getByRole("checkbox", { name: acknowledgement }))
    fireEvent.click(screen.getByRole("button", { name: "Confirm and share instructions" }))
    expect(await screen.findByText("The forwarding instructions are shared in the customer portal. Forwarding is not enabled, and the receptionist is not live.")).toBeTruthy()
    expect(sent(fetchMock, 0).body).toEqual(expected)
    vi.unstubAllGlobals()
  })

  it("requires a fresh review after a corrected allocation", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ message: "The forwarding instructions are shared in the customer portal. Forwarding is not enabled, and the receptionist is not live.", instructionVersion: 2, sharingStatus: "SHARED" }) })
    vi.stubGlobal("fetch", fetchMock)
    const corrected = "+441632960442"
    render(forwardingView({
      reviewCount: 1,
      locations: [forwardingLocation({
        status: "review",
        instructionVersion: 1,
        allocationId: "a033a000-0000-4000-8000-000000000072",
        allocationVersion: 2,
        provisionVersion: 4,
        e164: corrected,
        forwardingMode: "UNANSWERED",
        carrierKnown: false,
        instructionText: `1. Keep +441632960441 for the old number. 2. Menu names vary. 3. ${notice}`,
        instructionRevision: "guide-0001",
        attestation,
      })],
    }))
    expect(screen.getByText("These instructions need to be prepared again for the current allocation. Use the assigned number above, save a corrected draft or review the corrected notes, then share that version.")).toBeTruthy()
    expect((screen.getByLabelText("Instructions") as HTMLTextAreaElement).value).toContain(corrected)
    expect((screen.getByLabelText("Instructions") as HTMLTextAreaElement).value).not.toContain("+441632960441")
    expect(screen.queryByRole("button", { name: "Confirm and share instructions" })).toBeNull()
    fireEvent.change(screen.getByLabelText("Staff attestation"), { target: { value: attestation } })
    expect(screen.getByRole("button", { name: "Save draft" })).toBeEnabled()
    expect(screen.getByRole("button", { name: "Review instructions" })).toBeEnabled()
    fireEvent.click(screen.getByRole("button", { name: "Review instructions" }))
    expect(screen.getByRole("button", { name: "Confirm and share instructions" })).toBeDisabled()
    fireEvent.click(screen.getByRole("checkbox", { name: acknowledgement }))
    fireEvent.click(screen.getByRole("button", { name: "Confirm and share instructions" }))
    expect(await screen.findByText("The forwarding instructions are shared in the customer portal. Forwarding is not enabled, and the receptionist is not live.")).toBeTruthy()
    const share = sent(fetchMock, 0)
    expect(share.body.allocationId).toBe("a033a000-0000-4000-8000-000000000072")
    expect(share.body.allocationVersion).toBe(2)
    expect(share.body.instructionVersion).toBe(1)
    expect(share.body.instruction.instructionText).toContain(corrected)
    expect(share.body.instruction.status).toBe("SHARED")
    vi.unstubAllGlobals()
  })

  it("restores the form when the network fails", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("offline"))
    vi.stubGlobal("fetch", fetchMock)
    render(forwardingView())
    prepareForwarding()
    fireEvent.change(screen.getByLabelText("Instruction revision"), { target: { value: "guide-0006" } })
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }))
    expect(await screen.findByText("We couldn’t record the forwarding instructions. Check the connection and try again.")).toBeTruthy()
    expect(screen.queryByText(/saved as a draft/)).toBeNull()
    expect(screen.getByLabelText("Staff attestation")).toHaveValue(attestation)
    expect(screen.getByLabelText("Instruction revision")).toHaveValue("guide-0006")
    expect((screen.getByLabelText("Instructions") as HTMLTextAreaElement).value).toContain(number)
    expect(screen.getByRole("button", { name: "Save draft" })).toBeEnabled()
    expect(screen.getByRole("button", { name: "Review instructions" })).toBeEnabled()
    vi.unstubAllGlobals()
  })

  it("revises a shared instruction through a new review and refuses a draft", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ message: "The forwarding instructions are shared in the customer portal. Forwarding is not enabled, and the receptionist is not live.", instructionVersion: 3, sharingStatus: "SHARED" }) })
    vi.stubGlobal("fetch", fetchMock)
    render(forwardingView({
      sharedCount: 1,
      locations: [forwardingLocation({
        status: "shared",
        instructionVersion: 2,
        instructionText: forwardingCopy(number),
        instructionRevision: "guide-0001",
        sharedAt: "2026-11-06T00:10:00.000Z",
      })],
    }))
    const save = screen.getByRole("button", { name: "Save draft" })
    expect(save).toBeDisabled()
    expect(screen.getByText("A shared instruction stays shared. Review a new version to correct it. A draft cannot replace it.")).toBeTruthy()
    fireEvent.click(save)
    expect(fetchMock).not.toHaveBeenCalled()
    prepareForwarding(`${forwardingCopy(number)} Revised after sharing.`)
    fireEvent.click(screen.getByRole("button", { name: "Review instructions" }))
    fireEvent.click(screen.getByRole("checkbox", { name: acknowledgement }))
    fireEvent.click(screen.getByRole("button", { name: "Confirm and share instructions" }))
    expect(await screen.findByText("The forwarding instructions are shared in the customer portal. Forwarding is not enabled, and the receptionist is not live.")).toBeTruthy()
    const share = sent(fetchMock, 0)
    expect(share.body.instruction.status).toBe("SHARED")
    expect(share.body.instructionVersion).toBe(2)
    expect(share.body.provisionVersion).toBe(3)
    expect(share.body.instruction.instructionText).toContain("Revised after sharing.")
    expect(screen.getByRole("button", { name: "Save draft" })).toBeDisabled()
    vi.unstubAllGlobals()
  })

  it("retries an HTTP 503 with the same key and does not report a share", async () => {
    const shareMessage = "The forwarding instructions are shared in the customer portal. Forwarding is not enabled, and the receptionist is not live."
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({ message: shareMessage }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ message: shareMessage, instructionVersion: 1, sharingStatus: "SHARED" }) })
    vi.stubGlobal("fetch", fetchMock)
    render(forwardingView())
    prepareForwarding()
    fireEvent.click(screen.getByRole("button", { name: "Review instructions" }))
    fireEvent.click(screen.getByRole("checkbox", { name: acknowledgement }))
    fireEvent.click(screen.getByRole("button", { name: "Confirm and share instructions" }))
    expect(await screen.findByText(uncertainForwardingMessage)).toBeTruthy()
    expect(screen.queryByText(shareMessage)).toBeNull()
    expect(screen.getByRole("checkbox", { name: acknowledgement })).toBeChecked()
    fireEvent.click(screen.getByRole("button", { name: "Confirm and share instructions" }))
    expect(await screen.findByText(shareMessage)).toBeTruthy()
    expect(sent(fetchMock, 1).key).toBe(sent(fetchMock, 0).key)
    expect(sent(fetchMock, 1).body).toEqual(sent(fetchMock, 0).body)
    expect(sent(fetchMock, 0).body.instructionVersion).toBe(0)
    expect(sent(fetchMock, 0).body.instruction.status).toBe("SHARED")
    expect(fetchMock).toHaveBeenCalledTimes(2)
    vi.unstubAllGlobals()
  })

  it("keeps the same key after HTTP 408 and 429, then rotates it after confirmation", async () => {
    const draftMessage = "The forwarding instructions are saved as a draft. They are not visible to the customer, and forwarding is not enabled."
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 408, json: async () => ({ message: "The upstream timed out." }) })
      .mockResolvedValueOnce({ ok: false, status: 429, json: async () => ({ message: "Too many requests." }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ message: draftMessage, instructionVersion: 4, sharingStatus: "DRAFT" }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ message: draftMessage, instructionVersion: 5, sharingStatus: "DRAFT" }) })
    vi.stubGlobal("fetch", fetchMock)
    render(forwardingView())
    prepareForwarding()
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }))
    expect(await screen.findByText(uncertainForwardingMessage)).toBeTruthy()
    expect(screen.queryByText(draftMessage)).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }))
    expect(await screen.findByText(uncertainForwardingMessage)).toBeTruthy()
    expect(sent(fetchMock, 1).key).toBe(sent(fetchMock, 0).key)
    expect(sent(fetchMock, 1).body).toEqual(sent(fetchMock, 0).body)
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }))
    expect(await screen.findByText(draftMessage)).toBeTruthy()
    expect(sent(fetchMock, 2).key).toBe(sent(fetchMock, 0).key)
    expect(sent(fetchMock, 2).body).toEqual(sent(fetchMock, 0).body)
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }))
    expect(await screen.findByText(draftMessage)).toBeTruthy()
    expect(sent(fetchMock, 3).key).not.toBe(sent(fetchMock, 0).key)
    expect(sent(fetchMock, 3).body.instructionVersion).toBe(4)
    expect(sent(fetchMock, 3).body.instruction.status).toBe("DRAFT")
    vi.unstubAllGlobals()
  })

  it("replays a share after a network failure without advancing the instruction version", async () => {
    const shareMessage = "The forwarding instructions are shared in the customer portal. Forwarding is not enabled, and the receptionist is not live."
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ message: shareMessage, instructionVersion: 1, sharingStatus: "SHARED" }) })
    vi.stubGlobal("fetch", fetchMock)
    render(forwardingView())
    prepareForwarding()
    fireEvent.click(screen.getByRole("button", { name: "Review instructions" }))
    fireEvent.click(screen.getByRole("checkbox", { name: acknowledgement }))
    fireEvent.click(screen.getByRole("button", { name: "Confirm and share instructions" }))
    expect(await screen.findByText("We couldn’t record the forwarding instructions. Check the connection and try again.")).toBeTruthy()
    expect(screen.queryByText(shareMessage)).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Confirm and share instructions" }))
    expect(await screen.findByText(shareMessage)).toBeTruthy()
    expect(sent(fetchMock, 1).key).toBe(sent(fetchMock, 0).key)
    expect(sent(fetchMock, 1).body).toEqual(sent(fetchMock, 0).body)
    expect(sent(fetchMock, 1).body.instructionVersion).toBe(0)
    vi.unstubAllGlobals()
  })

  it("rotates the key after a validation rejection and does not report success", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({ message: "Check the forwarding instructions and staff attestation before recording them." }) })
    vi.stubGlobal("fetch", fetchMock)
    render(forwardingView())
    prepareForwarding()
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }))
    expect(await screen.findByText("Check the forwarding instructions and staff attestation before recording them.")).toBeTruthy()
    expect(screen.queryByText(/saved as a draft/)).toBeNull()
    expect(screen.queryByText(/shared in the customer portal/)).toBeNull()
    expect(screen.getByLabelText("Staff attestation")).toHaveValue(attestation)
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }))
    expect(await screen.findByText("Check the forwarding instructions and staff attestation before recording them.")).toBeTruthy()
    expect(sent(fetchMock, 1).key).not.toBe(sent(fetchMock, 0).key)
    expect(sent(fetchMock, 1).body).toEqual(sent(fetchMock, 0).body)
    expect(screen.getByRole("button", { name: "Save draft" })).toBeEnabled()
    vi.unstubAllGlobals()
  })

  it("requires a fresh review and a new key when the notes change after an uncertain share", async () => {
    const shareMessage = "The forwarding instructions are shared in the customer portal. Forwarding is not enabled, and the receptionist is not live."
    const revised = `${forwardingCopy(number)} Revised after the uncertain response.`
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({ message: shareMessage }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ message: shareMessage, instructionVersion: 1, sharingStatus: "SHARED" }) })
    vi.stubGlobal("fetch", fetchMock)
    render(forwardingView())
    prepareForwarding()
    fireEvent.click(screen.getByRole("button", { name: "Review instructions" }))
    fireEvent.click(screen.getByRole("checkbox", { name: acknowledgement }))
    fireEvent.click(screen.getByRole("button", { name: "Confirm and share instructions" }))
    expect(await screen.findByText(uncertainForwardingMessage)).toBeTruthy()
    fireEvent.change(screen.getByLabelText("Instructions"), { target: { value: revised } })
    expect(screen.queryByRole("checkbox", { name: acknowledgement })).toBeNull()
    expect(screen.queryByRole("button", { name: "Confirm and share instructions" })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Review instructions" }))
    fireEvent.click(screen.getByRole("checkbox", { name: acknowledgement }))
    fireEvent.click(screen.getByRole("button", { name: "Confirm and share instructions" }))
    expect(await screen.findByText(shareMessage)).toBeTruthy()
    expect(sent(fetchMock, 1).key).not.toBe(sent(fetchMock, 0).key)
    expect(sent(fetchMock, 1).body.instruction.instructionText).toBe(revised)
    expect(sent(fetchMock, 0).body.instruction.instructionText).not.toBe(revised)
    expect(sent(fetchMock, 1).body.instruction.status).toBe("SHARED")
    vi.unstubAllGlobals()
  })

  it("refreshes the queue after a version conflict and waits for the reconciled version", async () => {
    const shareMessage = "The forwarding instructions are shared in the customer portal. Forwarding is not enabled, and the receptionist is not live."
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: false, status: 409, json: async () => ({ message: "These forwarding instructions have changed. Reload the queue before trying again." }) })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ message: shareMessage, instructionVersion: 3, sharingStatus: "SHARED" }) })
    vi.stubGlobal("fetch", fetchMock)
    const { rerender } = render(forwardingView())
    prepareForwarding()
    fireEvent.click(screen.getByRole("button", { name: "Review instructions" }))
    fireEvent.click(screen.getByRole("checkbox", { name: acknowledgement }))
    fireEvent.click(screen.getByRole("button", { name: "Confirm and share instructions" }))
    expect(await screen.findByText("These forwarding instructions have changed. Reload the queue before trying again.")).toBeTruthy()
    expect(screen.queryByText(shareMessage)).toBeNull()
    expect(refresh).toHaveBeenCalled()
    expect(screen.queryByRole("button", { name: "Confirm and share instructions" })).toBeNull()
    expect(screen.getByRole("button", { name: "Review instructions" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Save draft" })).toBeDisabled()
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    rerender(forwardingView({ locations: [forwardingLocation({ instructionVersion: 2 })] }))
    expect(screen.getByRole("button", { name: "Review instructions" })).toBeEnabled()
    fireEvent.click(screen.getByRole("button", { name: "Review instructions" }))
    fireEvent.click(screen.getByRole("checkbox", { name: acknowledgement }))
    fireEvent.click(screen.getByRole("button", { name: "Confirm and share instructions" }))
    expect(await screen.findByText(shareMessage)).toBeTruthy()
    expect(sent(fetchMock, 1).key).not.toBe(sent(fetchMock, 0).key)
    expect(sent(fetchMock, 1).body.instructionVersion).toBe(2)
    expect(sent(fetchMock, 0).body.instructionVersion).toBe(0)
    vi.unstubAllGlobals()
  })
})

const uncertainForwardingMessage = "We couldn’t confirm whether the forwarding instructions were recorded. Try the same action again without changing the notes."

const notice = "Do not enable call forwarding yet. Your receptionist is still being prepared and tested. We will tell you when it is ready for the final connection."
const acknowledgement = "I have reviewed these instructions against the current business location and allocated number. I confirm they are suitable to share with this customer. I understand this will not enable call forwarding or activate the receptionist."
const attestation = "The operator prepared these forwarding notes from the recorded allocation."
const number = "+441632960441"
const allocationId = "a033a000-0000-4000-8000-000000000071"
const uuidKey = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function forwardingCopy(value: string) {
  return `1. Keep ${value} for the customer’s telephone provider. This is the number calls can be sent to once the receptionist is approved. 2. The exact menu names vary by telephone provider. These notes prepare the later connection and do not change the telephone line. 3. ${notice}`
}

function forwardingLocation(overrides: Record<string, unknown> = {}) {
  return {
    locationId: item.locations[0].locationId,
    locationName: "High Street",
    status: "needed" as const,
    instructionVersion: 0,
    allocationId,
    allocationVersion: 1,
    configurationVersion: 1,
    preferenceVersion: 1,
    provisionVersion: 3,
    agentRef: "agent-high-01",
    e164: number,
    forwardingMode: null,
    carrierKnown: null,
    carrierName: null,
    customerTelephone: null,
    instructionText: null,
    instructionRevision: null,
    attestation: null,
    sharedAt: null,
    ...overrides,
  }
}

function forwardingView(progress: Record<string, unknown> = {}) {
  const locations = (progress.locations as ReturnType<typeof forwardingLocation>[] | undefined) ?? [forwardingLocation()]
  return <SetupQueueView recordForwardingInstructionsEnabled providerLane="dev" items={[{
    ...item,
    operationalStatus: "setup_started",
    nextAction: "Record forwarding instructions",
    forwardingProgress: {
      sharedCount: 0,
      reviewCount: 0,
      draftCount: 0,
      locationCount: locations.length,
      locations,
      ...progress,
    },
  }]} />
}

function prepareForwarding(instruction = forwardingCopy(number)) {
  fireEvent.change(screen.getByLabelText("Instructions"), { target: { value: instruction } })
  fireEvent.change(screen.getByLabelText("Staff attestation"), { target: { value: attestation } })
}

function sent(fetchMock: ReturnType<typeof vi.fn>, call: number) {
  return {
    key: fetchMock.mock.calls[call][1].headers["idempotency-key"] as string,
    body: JSON.parse(fetchMock.mock.calls[call][1].body as string) as {
      instructionVersion: number
      provisionVersion: number
      allocationId: string
      allocationVersion: number
      instruction: { status: string; staffConfirmed: boolean; instructionText: string; instructionRevision: string }
    },
  }
}

const instructionId = "a033a000-0000-4000-8000-000000000081"
const testAttestation = "I reviewed this controlled agent conversation against the confirmed preferences."

function testLocation(overrides: {
  locationId?: string
  locationName?: string
  status?: "needed" | "pending" | "review" | "failed" | "passed"
  configurationVersion?: number
  preferenceVersion?: number
  provisionVersion?: number
  allocationVersion?: number
  instructionVersion?: number
  evidenceVersion?: number
  latestOutcome?: "PENDING_VERIFICATION" | "VERIFIED_PASSED" | "VERIFIED_FAILED" | "REQUIRES_REVIEW" | null
  providerCallId?: string | null
} = {}) {
  return {
    locationId: item.locations[0].locationId,
    locationName: "High Street",
    status: "needed" as "needed" | "pending" | "review" | "failed" | "passed",
    configurationVersion: 1,
    preferenceVersion: 1,
    provisionVersion: 3,
    allocationId,
    allocationVersion: 1,
    e164: "+441632960441",
    agentRef: "agent-high-01",
    environment: "dev" as const,
    instructionId,
    instructionVersion: 1,
    evidenceVersion: 0,
    latestOutcome: null,
    providerCallId: null,
    ...overrides,
  }
}

function testView(locations = [testLocation(), testLocation({
  locationId: item.locations[1].locationId,
  locationName: "Dock",
  status: "failed",
  latestOutcome: "VERIFIED_FAILED",
  providerCallId: "call_dock_failed",
  evidenceVersion: 1,
})]) {
  return <SetupQueueView verifyAgentTestCallEnabled providerLane="dev" items={[{
    ...item,
    operationalStatus: "setup_started",
    nextAction: "Verify AI receptionist test call",
    testProgress: {
      passedCount: locations.filter(location => location.status === "passed").length,
      reviewCount: locations.filter(location => location.status === "review").length,
      failedCount: locations.filter(location => location.status === "failed").length,
      pendingCount: locations.filter(location => location.status === "pending").length,
      locationCount: locations.length,
      locations,
    },
  }]} />
}

function prepareTest(callReference = "call_direct_01") {
  fireEvent.change(screen.getByLabelText("Provider call reference"), { target: { value: callReference } })
  for (const label of [
    "Correct business greeting",
    "Appropriate spoken language and voice",
    "Captures the caller name and callback number",
    "Collects the relevant enquiry details",
    "Handles preferred callback windows",
    "Follows business hours and out-of-hours rules",
    "Follows urgent enquiry and escalation instructions",
    "Avoids unsupported promises",
    "Produces a suitable conclusion",
  ]) fireEvent.click(screen.getByLabelText(label))
  fireEvent.change(screen.getByLabelText("Staff attestation"), { target: { value: testAttestation } })
}

describe("verify AI receptionist test call", () => {
  it("requires a separate review and does not treat a typed reference as a pass", () => {
    render(testView())
    expect(screen.getByRole("combobox", { name: "Location" })).toBeTruthy()
    expect(screen.getByRole("option", { name: "Dock · failed" })).toBeTruthy()
    fireEvent.change(screen.getByRole("combobox", { name: "Location" }), { target: { value: item.locations[1].locationId } })
    expect(screen.getByText(/call_dock_failed/)).toBeTruthy()
    expect(screen.getByText(/The last conversation test did not pass/)).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Record verification" })).toBeNull()
    fireEvent.click(screen.getByRole("button", { name: "Review test call" }))
    expect(screen.queryByRole("button", { name: "Record verification" })).toBeNull()
    prepareTest()
    fireEvent.click(screen.getByRole("button", { name: "Review test call" }))
    const record = screen.getByRole("button", { name: "Record verification" })
    expect(record).toBeDisabled()
    expect(screen.getByText(/Typing a reference is not proof/)).toBeTruthy()
    expect(screen.getByLabelText(/does not verify telephone forwarding/)).not.toBeChecked()
  })

  it("keeps the same request when the provider response is uncertain and rotates it after a pass", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ message: "We couldn’t confirm whether the provider call could be read. Try the same action again without changing the assessment." }), { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        message: "Your AI receptionist has passed its conversation test. We still need to confirm the final telephone connection before your service can go live. Telephone forwarding is not verified, and the receptionist is not live.",
        evidenceOutcome: "VERIFIED_PASSED",
        testPassed: true,
        forwardingVerified: false,
      }), { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)
    render(testView())
    prepareTest()
    fireEvent.click(screen.getByRole("button", { name: "Review test call" }))
    fireEvent.click(screen.getByLabelText(/does not verify telephone forwarding/))
    fireEvent.click(screen.getByRole("button", { name: "Record verification" }))
    await screen.findByText(/couldn’t confirm whether the provider call could be read/)
    expect(document.body.textContent).not.toContain("has passed its conversation test")
    fireEvent.click(screen.getByRole("button", { name: "Record verification" }))
    await screen.findByText(/has passed its conversation test/)
    const first = JSON.parse(fetchMock.mock.calls[0][1].body as string) as { callId: string; evidence?: unknown; qa: { staffConfirmed: boolean } }
    const second = JSON.parse(fetchMock.mock.calls[1][1].body as string) as { callId: string }
    expect(first.callId).toBe("call_direct_01")
    expect(first.evidence).toBeUndefined()
    expect(first.qa.staffConfirmed).toBe(true)
    expect(second.callId).toBe(first.callId)
    expect(fetchMock.mock.calls[0][1].headers["idempotency-key"]).toBe(fetchMock.mock.calls[1][1].headers["idempotency-key"])
    expect(refresh).toHaveBeenCalledTimes(1)
    vi.unstubAllGlobals()
  })

  it("drops a reviewed assessment when the configuration changes and shows a failed test without a pass", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      message: "The conversation test was recorded as failed. The service was not advanced. Telephone forwarding is not verified, and the receptionist is not live.",
      evidenceOutcome: "VERIFIED_FAILED",
      testPassed: false,
      forwardingVerified: false,
    }), { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)
    const view = render(testView())
    prepareTest()
    fireEvent.click(screen.getByRole("button", { name: "Review test call" }))
    fireEvent.click(screen.getByLabelText(/does not verify telephone forwarding/))
    view.rerender(testView([testLocation({ configurationVersion: 2 })]))
    expect(screen.queryByRole("button", { name: "Record verification" })).toBeNull()
    prepareTest("call_direct_02")
    fireEvent.click(screen.getByRole("button", { name: "Review test call" }))
    fireEvent.click(screen.getByLabelText(/does not verify telephone forwarding/))
    fireEvent.click(screen.getByRole("button", { name: "Record verification" }))
    await screen.findByText(/recorded as failed/)
    expect(document.body.textContent).not.toContain("has passed its conversation test")
    const sentBody = JSON.parse(fetchMock.mock.calls[0][1].body as string) as { configurationVersion: number; callId: string }
    expect(sentBody.configurationVersion).toBe(2)
    expect(sentBody.callId).toBe("call_direct_02")
    vi.unstubAllGlobals()
  })
})

describe("start controlled receptionist test", () => {
  const token = "join-token-value-123456"
  let media: ReturnType<typeof vi.fn>
  let fetches: string[]

  function installBrowser() {
    fetches = []
    media = vi.fn(async () => ({ getTracks: () => [{ kind: "audio", stop() {}, enabled: true }] }))
    vi.stubGlobal("Audio", class {
      autoplay = false
      srcObject: unknown = null
      play() { return Promise.resolve() }
    })
    vi.stubGlobal("RTCPeerConnection", class {
      connectionState = "new"
      iceConnectionState = "new"
      localDescription: { type: string; sdp: string } | null = null
      onicecandidate: ((event: { candidate: null }) => void) | null = null
      ontrack: ((event: { streams: Array<{ getTracks: () => unknown[] }>; track: unknown }) => void) | null = null
      onconnectionstatechange: (() => void) | null = null
      oniceconnectionstatechange: (() => void) | null = null
      addTrack() {}
      addTransceiver() {}
      createDataChannel() { return { close() {}, onmessage: null } }
      async createOffer() { return { type: "offer", sdp: "v=0" } }
      async setLocalDescription(description: { type: string; sdp: string }) { this.localDescription = description }
      async setRemoteDescription() {
        const track = { kind: "audio", stop() {}, enabled: true }
        this.ontrack?.({ streams: [{ getTracks: () => [track] }], track })
        this.connectionState = "connected"
        this.onconnectionstatechange?.()
      }
      close() {
        this.connectionState = "closed"
        this.onconnectionstatechange?.()
      }
    })
    Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia: media } })
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      const target = String(url)
      fetches.push(`${init?.method ?? "GET"} ${target}`)
      if (target.includes("/v1/webrtc/sessions")) {
        if (init?.method === "DELETE") return new Response(null, { status: 204 })
        return new Response(JSON.stringify({ session_id: "session-1", sdp: "v=0" }), { status: 201, headers: { "content-type": "application/json" } })
      }
      return new Response(JSON.stringify({
        message: "A controlled web call is open for this location. Telephone forwarding is not verified, and the receptionist is not live.",
        callId: "call_created_01",
        accessToken: token,
        transport: "gateway",
        iceServers: [{ urls: "stun:example.invalid", username: "turn-user", credential: "turn-secret" }],
        expiresAt: "2026-11-06T20:00:00.000Z",
        maxDurationSeconds: 600,
        forwardingVerified: false,
        testPassed: false,
      }), { status: 200, headers: { "content-type": "application/json" } })
    }))
  }

  function renderStart() {
    return render(<SetupQueueView initiateAgentTestCallEnabled providerLane="dev" items={[{
      ...item,
      operationalStatus: "setup_started",
      nextAction: "Start controlled receptionist test",
      testProgress: {
        passedCount: 0,
        reviewCount: 0,
        failedCount: 0,
        pendingCount: 0,
        locationCount: 1,
        locations: [testLocation()],
      },
    }]} />)
  }

  async function confirmAndStart() {
    fireEvent.click(screen.getByRole("checkbox", { name: /may incur a provider usage charge/ }))
    fireEvent.click(screen.getByRole("button", { name: "Start controlled test" }))
    await screen.findByText(/Connected. You can speak to the receptionist/)
  }

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("connects the browser after confirmation and ends the call without showing provider tokens", async () => {
    installBrowser()
    renderStart()
    expect(screen.queryByLabelText("Provider call reference")).toBeNull()
    expect(screen.getByText(/A typed call reference is not accepted/)).toBeTruthy()
    expect(screen.getByText(/may incur a provider usage charge/)).toBeTruthy()
    fireEvent.click(screen.getByRole("button", { name: "Start controlled test" }))
    expect(fetches.filter(call => call.includes("initiate-agent-test-call"))).toHaveLength(0)
    await confirmAndStart()
    const initiated = fetches.filter(call => call.includes("initiate-agent-test-call"))
    expect(initiated).toHaveLength(1)
    const sent = JSON.parse((vi.mocked(fetch).mock.calls.find(call => String(call[0]).includes("initiate-agent-test-call"))?.[1] as RequestInit).body as string) as Record<string, unknown>
    expect(sent.locationId).toBe(item.locations[0].locationId)
    expect(sent.confirmedCharge).toBe(true)
    expect(sent.callId).toBeUndefined()
    expect(sent.providerCallId).toBeUndefined()
    expect(screen.getByText(/Provider call reference call_created_01/)).toBeTruthy()
    expect(document.body.textContent).not.toContain(token)
    expect(document.body.textContent).not.toContain("turn-secret")
    expect(document.body.textContent).not.toContain("Join token")
    expect(document.body.textContent).not.toContain("has passed its conversation test")
    fireEvent.click(screen.getByRole("button", { name: "End call" }))
    await screen.findByText(/The controlled web call has ended/)
    expect(fetches.some(call => call.startsWith("DELETE "))).toBe(true)
    expect(fetches.filter(call => call.includes("initiate-agent-test-call"))).toHaveLength(1)
  })

  it("reports a denied microphone and does not start another provider call", async () => {
    installBrowser()
    const denied = new Error("Permission denied")
    denied.name = "NotAllowedError"
    media.mockRejectedValue(denied)
    renderStart()
    fireEvent.click(screen.getByRole("checkbox", { name: /may incur a provider usage charge/ }))
    fireEvent.click(screen.getByRole("button", { name: "Start controlled test" }))
    await screen.findByText(/microphone was not available/)
    expect(fetches.filter(call => call.includes("initiate-agent-test-call"))).toHaveLength(1)
    expect(screen.getByRole("button", { name: "Start controlled test" })).toBeDisabled()
  })

  it("reports an audio connection failure and does not start another provider call", async () => {
    installBrowser()
    vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
      const target = String(url)
      fetches.push(`${init?.method ?? "GET"} ${target}`)
      if (target.includes("/v1/webrtc/sessions")) return new Response("no", { status: 400 })
      return new Response(JSON.stringify({
        message: "A controlled web call is open for this location.",
        callId: "call_created_01",
        accessToken: token,
        transport: "gateway",
        iceServers: [{ urls: "stun:example.invalid" }],
        expiresAt: "2026-11-06T20:00:00.000Z",
        maxDurationSeconds: 600,
      }), { status: 200 })
    }))
    renderStart()
    fireEvent.click(screen.getByRole("checkbox", { name: /may incur a provider usage charge/ }))
    fireEvent.click(screen.getByRole("button", { name: "Start controlled test" }))
    await screen.findByText(/could not keep the audio connection/)
    expect(fetches.filter(call => call.includes("initiate-agent-test-call"))).toHaveLength(1)
    expect(document.body.textContent).not.toContain(token)
  })

  it("ends the browser connection when the form unmounts", async () => {
    installBrowser()
    const view = renderStart()
    await confirmAndStart()
    view.unmount()
    await vi.waitFor(() => expect(fetches.some(call => call.startsWith("DELETE "))).toBe(true))
    expect(fetches.filter(call => call.includes("initiate-agent-test-call"))).toHaveLength(1)
  })
})
