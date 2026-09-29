// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"

const loadCommunications = vi.fn()
vi.mock("@/lib/communications/queries", () => ({
  loadCommunications: (...args: unknown[]) => loadCommunications(...args),
}))

import CommunicationsPage from "./page"

afterEach(() => cleanup())
beforeEach(() => loadCommunications.mockReset())

describe("communications page", () => {
  it("shows reviewed outbound mail without treating provider acceptance as delivery", async () => {
    loadCommunications.mockResolvedValue({
      templates: [{ templateKey: "EVIDENCE_REQUEST", version: 1, name: "Evidence request" }],
      communications: [{
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        caseId: "55555555-5555-4555-8555-555555555555",
        caseReference: "PR-26-6CKR5M",
        communicationType: "EVIDENCE_REQUEST",
        templateKey: "EVIDENCE_REQUEST",
        templateVersion: 1,
        lifecycle: "QUEUED",
        deliveryStatus: "PROVIDER_ACCEPTED",
        legacyStatus: null,
        recipient: "alex@example.com",
        subject: "Evidence needed for PR-26-6CKR5M",
        bodyText: "To continue with PR-26-6CKR5M, we need Photo ID.",
        provider: "resend",
        providerMessageId: "msg_1",
        lastError: null,
        contentLocked: true,
        contentVersion: 1,
        version: 4,
        draftedAt: "2026-09-29T12:00:00.000Z",
        reviewedAt: "2026-09-29T12:01:00.000Z",
        queuedAt: "2026-09-29T12:02:00.000Z",
        firstProviderAttemptAt: "2026-09-29T12:03:00.000Z",
        providerAcceptedAt: "2026-09-29T12:03:00.000Z",
        deliveredAt: null,
        failedAt: null,
        cancelledAt: null,
        supersededBy: null,
        events: [{ eventType: "PROVIDER_ACCEPTED", occurredAt: "2026-09-29T12:03:00.000Z", summary: "Email provider accepted the message", providerMessageId: "msg_1" }],
      }],
    })
    render(await CommunicationsPage({ searchParams: Promise.resolve({}) }))
    expect(screen.getByRole("heading", { name: "Communications" })).toBeTruthy()
    expect(screen.getByText("Accepted by email provider")).toBeTruthy()
    expect(screen.queryByText("Delivered")).toBeNull()
    expect(screen.getByText(/not enabled yet/)).toBeTruthy()
    expect(screen.getByText(/operationally acceptable cadence/)).toBeTruthy()
    expect(screen.getByText("Draft communication")).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/RESEND_API_KEY|webhook|raw payload|svix/i)
  })
})
