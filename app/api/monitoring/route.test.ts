import { afterEach, describe, expect, it, vi } from "vitest"
import { MONITORING_UNAVAILABLE } from "@/lib/monitoring/persistence-config"
import { resetEnquiryRateLimit } from "@/lib/enquiry-rate-limit"

const { persistMonitoringRequest } = vi.hoisted(() => ({
  persistMonitoringRequest: vi.fn(),
}))

vi.mock("@/lib/monitoring/intake", () => ({
  persistMonitoringRequest: (...args: unknown[]) => persistMonitoringRequest(...args),
}))

vi.mock("@/lib/providers/resend-enquiry-provider", () => ({
  createResendEnquiryProvider: () => {
    throw new Error("Resend must be mocked; tests must never send real email")
  },
}))

const valid = {
  fullName: "Alex Morgan",
  email: "alex@example.com",
  businessName: "Harbour Bakery",
  country: "United Kingdom",
  businessProfileUrl: "https://maps.google.com/?cid=123",
  numberOfLocations: 1,
  termsAccepted: true,
  source: "start-monitoring",
}

const SUBMISSION_KEY = "11111111-2222-4333-8444-555555555555"

afterEach(() => {
  persistMonitoringRequest.mockReset()
  vi.unstubAllEnvs()
  resetEnquiryRateLimit()
})

function post(body: unknown) {
  return new Request("http://localhost/api/monitoring", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  })
}

describe("POST /api/monitoring", () => {
  it("returns 400 for an invalid body", async () => {
    const { POST } = await import("@/app/api/monitoring/route")
    const response = await POST(post({ ...valid, email: "nope" }))
    const json = await response.json() as { ok?: boolean }
    expect(response.status).toBe(400)
    expect(json.ok).toBe(false)
    expect(persistMonitoringRequest).not.toHaveBeenCalled()
  })

  it("returns 400 when the submission key is missing", async () => {
    vi.stubEnv("MONITORING_PERSISTENCE_ENABLED", "true")
    const { POST } = await import("@/app/api/monitoring/route")
    const response = await POST(post(valid))
    const json = await response.json() as { ok?: boolean }
    expect(response.status).toBe(400)
    expect(json.ok).toBe(false)
    expect(persistMonitoringRequest).not.toHaveBeenCalled()
  })

  it("does not persist when the flag is disabled", async () => {
    const { POST } = await import("@/app/api/monitoring/route")
    const response = await POST(post({ ...valid, submissionKey: SUBMISSION_KEY }))
    const json = await response.json() as { ok?: boolean; persisted?: boolean; message?: string }
    expect(response.status).toBe(503)
    expect(json.ok).toBe(false)
    expect(json.message).toBe(MONITORING_UNAVAILABLE)
    expect(json.persisted).not.toBe(true)
    expect(persistMonitoringRequest).not.toHaveBeenCalled()
  })

  it("returns 429 when rate limited", async () => {
    const { POST } = await import("@/app/api/monitoring/route")
    let last = new Response()
    for (let i = 0; i < 9; i += 1) {
      last = await POST(post({ ...valid, submissionKey: SUBMISSION_KEY }))
    }
    const json = await last.json() as { ok?: boolean }
    expect(last.status).toBe(429)
    expect(json.ok).toBe(false)
    expect(persistMonitoringRequest).not.toHaveBeenCalled()
  })

  it("calls the monitoring service once and returns a safe REQUESTED response", async () => {
    vi.stubEnv("MONITORING_PERSISTENCE_ENABLED", "true")
    persistMonitoringRequest.mockResolvedValue({
      ok: true,
      persisted: true,
      status: "REQUESTED",
      receiptEmailSent: true,
      message: "Your Relaunch Guard setup request has been received.",
    })
    const { POST } = await import("@/app/api/monitoring/route")
    const response = await POST(post({ ...valid, submissionKey: SUBMISSION_KEY }))
    const json = await response.json() as Record<string, unknown>
    expect(response.status).toBe(200)
    expect(persistMonitoringRequest).toHaveBeenCalledTimes(1)
    expect(persistMonitoringRequest.mock.calls[0]?.[1]).toBe(SUBMISSION_KEY)
    expect(json).toMatchObject({
      ok: true,
      persisted: true,
      status: "REQUESTED",
      receiptEmailSent: true,
    })
    const serialized = JSON.stringify(json)
    expect(serialized).not.toMatch(/monitoring_request_id|submission_key|customer_id|business_id|location_id/i)
    expect(serialized).not.toMatch(/communication/i)
    expect(serialized).not.toMatch(/caseRef|publicRef|PR-|RV-|GR-/)
  })
})
