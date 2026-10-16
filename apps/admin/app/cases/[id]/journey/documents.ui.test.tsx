// @vitest-environment jsdom
import React from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import type { CaseCommunicationRead } from "@/lib/communications/model"
import type { EvidenceRequest } from "@/lib/evidence/model"
import { buildJourneyDocuments, type JourneyDocuments } from "@/lib/case-journey/documents"
import { DocumentRequestPanel } from "./documents"

const refresh = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }))

const CASE_ID = "55555555-5555-4555-8555-555555555555"
const REQUEST_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const MESSAGE_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
const sendDisabled = "Outgoing customer email is not enabled yet. Reviewed drafts are preserved, but sending will be enabled only after the production worker runs at the required cadence."

function request(title = "Google suspension or rejection notice"): EvidenceRequest {
  return {
    id: REQUEST_ID,
    title,
    requestText: `${title} — The notice Google sent about the suspension or rejection.`,
    status: "OPEN",
    dueAt: null,
    createdAt: "2026-02-01T00:00:00.000Z",
    fulfilledAt: null,
    version: 4,
  }
}

function communication(overrides: Partial<CaseCommunicationRead["communications"][number]> = {}): CaseCommunicationRead["communications"][number] {
  return {
    id: MESSAGE_ID,
    caseId: CASE_ID,
    caseReference: "PR-1042",
    communicationType: "EVIDENCE_REQUEST",
    templateKey: "EVIDENCE_REQUEST",
    templateVersion: 1,
    lifecycle: "DRAFT",
    deliveryStatus: "NONE",
    legacyStatus: null,
    recipient: "alex@example.com",
    subject: "Evidence needed for PR-1042",
    bodyText: "To continue with PR-1042, we need the Google suspension notice.",
    provider: null,
    providerMessageId: null,
    lastError: null,
    contentLocked: false,
    contentVersion: 1,
    version: 2,
    draftedAt: "2026-02-02T00:00:00.000Z",
    reviewedAt: null,
    queuedAt: null,
    firstProviderAttemptAt: null,
    providerAcceptedAt: null,
    deliveredAt: null,
    failedAt: null,
    cancelledAt: null,
    supersededBy: null,
    events: [],
    evidenceRequestId: REQUEST_ID,
    eventsTruncated: false,
    canReplace: false,
    ...overrides,
  }
}

function documents(input: {
  caseType?: string
  issue?: string
  requests?: EvidenceRequest[]
  history?: CaseCommunicationRead | null
} = {}): JourneyDocuments {
  const history = input.history === undefined
    ? {
      status: "success" as const,
      complete: true,
      total: 0,
      returned: 0,
      verifiedEmail: "alex@example.com",
      verifiedEmailSuppressed: false,
      communications: [],
    }
    : input.history
  return buildJourneyDocuments({
    caseType: input.caseType ?? "PROFILE_RECOVERY",
    issue: input.issue ?? "The business profile was suspended without warning.",
    businessName: "Mercer Bakery",
    requests: input.requests ?? [],
    history,
    sendDisabledReason: sendDisabled,
  })
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  refresh.mockClear()
})

function jsonResponse(status: number, message: string) {
  return { ok: status >= 200 && status < 300, status, json: async () => ({ message }) }
}

describe("the step 3 document request", () => {
  it("shows the original request and lets the operator edit the suggested documents", async () => {
    render(<DocumentRequestPanel caseId={CASE_ID} documents={documents()} />)
    expect(screen.getByText("Mercer Bakery")).toBeInTheDocument()
    expect(screen.getByText("Profile recovery")).toBeInTheDocument()
    expect(screen.getByText("The business profile was suspended without warning.")).toBeInTheDocument()
    expect(screen.getByRole("checkbox", { name: "Include Google suspension or rejection notice" })).toBeChecked()
    fireEvent.change(screen.getByLabelText("Document name: Google suspension or rejection notice"), { target: { value: "Suspension notice from Google" } })
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, "The evidence request has been recorded. No email was sent."))
    vi.stubGlobal("fetch", fetchMock)
    fireEvent.click(screen.getByRole("button", { name: "Save evidence requirements" }))
    await screen.findByText("The evidence request has been recorded. No email was sent.")
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body))
    expect(fetchMock.mock.calls[0][0]).toBe("/api/evidence/command")
    expect(body).toMatchObject({
      operation: "create_request",
      caseId: CASE_ID,
      title: "Suspension notice from Google",
      dueAt: null,
    })
    expect(body.requestText).toMatch(/Suspension notice from Google — The notice Google sent/)
    expect(fetchMock.mock.calls[0][1].headers["idempotency-key"]).toMatch(/^[0-9a-f-]{36}$/i)
    expect(screen.queryByRole("button", { name: "Queue for sending" })).toBeNull()
  })

  it("changes the suggested documents for a review dispute and for monitoring", () => {
    const { unmount } = render(<DocumentRequestPanel caseId={CASE_ID} documents={documents({
      caseType: "REVIEW_PROTECTION",
      issue: "A customer asked for a review to be removed.",
    })} />)
    expect(screen.getByText("Review protection")).toBeInTheDocument()
    expect(screen.queryByRole("checkbox", { name: /suspension or rejection/i })).toBeNull()
    expect(screen.getByRole("checkbox", { name: /Google correspondence or appeal reference/ })).not.toBeChecked()
    unmount()
    render(<DocumentRequestPanel caseId={CASE_ID} documents={documents({
      caseType: "MONITORING",
      issue: "Watch the listing each month.",
    })} />)
    expect(screen.getByRole("checkbox", { name: /Website or business contact details/ })).not.toBeChecked()
    expect(screen.getByRole("button", { name: "Save evidence requirements" })).toBeDisabled()
    expect(screen.getByText(/empty list is not a decision/i)).toBeInTheDocument()
  })

  it("does not save an empty checklist or a requirement that is already open", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)
    render(<DocumentRequestPanel caseId={CASE_ID} documents={documents()} />)
    fireEvent.click(screen.getByRole("checkbox", { name: "Include Google suspension or rejection notice" }))
    expect(screen.getByRole("button", { name: "Save evidence requirements" })).toBeDisabled()
    expect(fetchMock).not.toHaveBeenCalled()

    cleanup()
    render(<DocumentRequestPanel caseId={CASE_ID} documents={documents({ requests: [request()] })} />)
    expect(screen.getByRole("heading", { name: "Google suspension or rejection notice" })).toBeInTheDocument()
    expect(screen.getAllByRole("heading", { name: "Google suspension or rejection notice" })).toHaveLength(1)
    expect(screen.getByText("Requirements saved. The customer has not been contacted.")).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Save evidence requirements" }))
    expect(await screen.findByText(/already saved/i)).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("uses one idempotency key for a repeated save and stops after a session or conflict failure", async () => {
    let resolveFetch: (value: ReturnType<typeof jsonResponse>) => void = () => undefined
    const fetchMock = vi.fn().mockReturnValue(new Promise(resolve => { resolveFetch = resolve }))
    vi.stubGlobal("fetch", fetchMock)
    render(<DocumentRequestPanel caseId={CASE_ID} documents={documents()} />)
    const button = screen.getByRole("button", { name: "Save evidence requirements" })
    fireEvent.click(button)
    fireEvent.click(button)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    resolveFetch(jsonResponse(500, "We couldn’t confirm the change. Reload the record before trying again."))
    expect(await screen.findByRole("button", { name: "Reload this step" })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Save evidence requirements" })).toBeDisabled()
    fireEvent.click(screen.getByRole("button", { name: "Save evidence requirements" }))
    expect(fetchMock).toHaveBeenCalledTimes(1)

    cleanup()
    const denied = vi.fn().mockResolvedValue(jsonResponse(401, "Your session has ended. Please sign in again."))
    vi.stubGlobal("fetch", denied)
    render(<DocumentRequestPanel caseId={CASE_ID} documents={documents()} />)
    fireEvent.click(screen.getByRole("button", { name: "Save evidence requirements" }))
    expect(await screen.findByText("Your session has ended. Please sign in again.")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Reload this step" })).toBeNull()
  })

  it("drafts from the saved requirement and reviews the exact message without offering send", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, "The communication was drafted. It has not been sent."))
    vi.stubGlobal("fetch", fetchMock)
    const { unmount } = render(<DocumentRequestPanel caseId={CASE_ID} documents={documents({ requests: [request("Shop licence")] })} />)
    fireEvent.click(screen.getByRole("button", { name: "Generate email draft" }))
    await screen.findByText("The communication was drafted. It has not been sent.")
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toMatchObject({
      operation: "draft",
      templateKey: "EVIDENCE_REQUEST",
      caseId: CASE_ID,
      evidenceRequestId: REQUEST_ID,
    })
    expect(fetchMock.mock.calls[0][0]).toBe("/api/operations/communications")
    unmount()

    const reviewedFetch = vi.fn().mockResolvedValue(jsonResponse(409, "That communication changed. Reload the page and try again."))
    vi.stubGlobal("fetch", reviewedFetch)
    render(<DocumentRequestPanel caseId={CASE_ID} documents={documents({
      requests: [request()],
      history: {
        status: "success",
        complete: true,
        total: 1,
        returned: 1,
        verifiedEmail: "alex@example.com",
        verifiedEmailSuppressed: false,
        communications: [communication()],
      },
    })} />)
    expect(screen.getByText("alex@example.com")).toBeInTheDocument()
    expect(screen.getByText("Evidence needed for PR-1042")).toBeInTheDocument()
    expect(screen.getByText("To continue with PR-1042, we need the Google suspension notice.")).toBeInTheDocument()
    expect(screen.getByText(/not approved, and it has not been sent/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Mark reviewed" }))
    expect(await screen.findByText("That communication changed. Reload the page and try again.")).toBeInTheDocument()
    expect(JSON.parse(String(reviewedFetch.mock.calls[0][1].body))).toMatchObject({
      operation: "review",
      communicationId: MESSAGE_ID,
      version: 2,
    })
    expect(screen.getByRole("button", { name: "Mark reviewed" })).toBeDisabled()
    expect(screen.queryByRole("button", { name: "Queue for sending" })).toBeNull()
  })

  it("keeps a reviewed draft when sending is unavailable and does not draft to a suppressed address", () => {
    render(<DocumentRequestPanel caseId={CASE_ID} documents={documents({
      requests: [request()],
      history: {
        status: "success",
        complete: true,
        total: 1,
        returned: 1,
        verifiedEmail: "alex@example.com",
        verifiedEmailSuppressed: false,
        communications: [communication({ lifecycle: "REVIEWED", contentLocked: true, reviewedAt: "2026-02-03T00:00:00.000Z" })],
      },
    })} />)
    expect(screen.getByText(sendDisabled)).toBeInTheDocument()
    expect(screen.getByText("To continue with PR-1042, we need the Google suspension notice.")).toBeInTheDocument()
    expect(screen.getByText("This wording is locked. A later change is a new draft, not an edit of this message.")).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Generate email draft" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Queue for sending" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Mark reviewed" })).toBeNull()

    cleanup()
    render(<DocumentRequestPanel caseId={CASE_ID} documents={buildJourneyDocuments({
      caseType: "PROFILE_RECOVERY",
      issue: "The business profile was suspended without warning.",
      businessName: "Mercer Bakery",
      requests: [request()],
      history: {
        status: "success",
        complete: true,
        total: 0,
        returned: 0,
        verifiedEmail: "alex@example.com",
        verifiedEmailSuppressed: true,
        communications: [],
      },
      sendDisabledReason: sendDisabled,
    })} />)
    expect(screen.getByText(/email address is suppressed/i)).toBeInTheDocument()
    expect(screen.queryByRole("button", { name: "Generate email draft" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Queue for sending" })).toBeNull()
  })
})
