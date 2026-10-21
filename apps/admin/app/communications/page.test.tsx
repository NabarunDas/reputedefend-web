// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"

const loadCommunications = vi.fn()
vi.mock("@/lib/communications/queries", () => ({
  loadCommunications: (...args: unknown[]) => loadCommunications(...args),
}))

import CommunicationsPage from "./page"

afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})
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
    expect(screen.queryByRole("button", { name: "Process queued email" })).toBeNull()
    expect(screen.getByRole("link", { name: "Open the case communications workspace" })).toHaveAttribute("href", "/cases/55555555-5555-4555-8555-555555555555/communications")
    expect(document.body.textContent).not.toMatch(/RESEND_API_KEY|webhook|raw payload|svix/i)
  })

  it("offers one queued development email and posts only the communication id", async () => {
    const portal = "https://profilerelaunch-customer-git-develop-clientcove.vercel.app"
    for (const [name, value] of Object.entries({
      VERCEL_ENV: "preview",
      VERCEL_GIT_COMMIT_REF: "develop",
      VERCEL_BRANCH_URL: "profilerelaunch-admin-git-develop-clientcove.vercel.app",
      SUPABASE_URL: "https://rmzozuiamjcclvtgutgd.supabase.co",
      CUSTOMER_ORIGIN: portal,
      AWS_EVIDENCE_BUCKET: "profilerelaunch-evidence-dev-01",
      COMMUNICATIONS_SEND_ENABLED: "true",
      JOB_PROVIDER_MODE: "production",
      RESEND_API_KEY: "re_dev_placeholder",
      COMMUNICATIONS_FROM_EMAIL: "ops@example.com",
    })) vi.stubEnv(name, value)
    const communicationId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    loadCommunications.mockResolvedValue({
      templates: [],
      communications: [{
        id: communicationId,
        caseId: "55555555-5555-4555-8555-555555555555",
        caseReference: "PR-26-EXAMPLE",
        communicationType: "EVIDENCE_REQUEST",
        templateKey: "EVIDENCE_REQUEST",
        templateVersion: 1,
        lifecycle: "QUEUED",
        deliveryStatus: "NONE",
        legacyStatus: null,
        recipient: "alex@example.com",
        subject: "Evidence needed",
        bodyText: "Please upload the requested file.",
        provider: null,
        providerMessageId: null,
        lastError: null,
        contentLocked: true,
        contentVersion: 1,
        version: 3,
        draftedAt: "2026-10-21T11:00:00.000Z",
        reviewedAt: "2026-10-21T11:01:00.000Z",
        queuedAt: "2026-10-21T11:02:00.000Z",
        firstProviderAttemptAt: null,
        providerAcceptedAt: null,
        deliveredAt: null,
        failedAt: null,
        cancelledAt: null,
        supersededBy: null,
        events: [],
      }],
    })
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ message: "The queued email was submitted to the email provider." }) }))
    vi.stubGlobal("fetch", fetchMock)
    render(await CommunicationsPage({ searchParams: Promise.resolve({}) }))
    expect(screen.getAllByText(/durable SEND_EMAIL job/).length).toBeGreaterThan(0)
    const button = screen.getByRole("button", { name: "Process queued email" })
    expect(button).toBeDisabled()
    fireEvent.click(screen.getByRole("checkbox", { name: "Send this queued email" }))
    fireEvent.click(button)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe("/api/operations/dev-send-email")
    expect(JSON.parse(String(init.body))).toEqual({ communicationId, confirmed: true })
    expect(String(init.body)).not.toMatch(/alex@example.com/)
  })
})
