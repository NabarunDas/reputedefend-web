import { beforeEach, describe, expect, it, vi } from "vitest"
import { ENQUIRY_UNAVAILABLE } from "@/lib/enquiry-delivery"
import { MONITORING_UNAVAILABLE } from "@/lib/monitoring/persistence-config"
import { resetEnquiryRateLimit, useSharedPublicRateLimit } from "@/lib/enquiry-rate-limit"
import { PUBLIC_BODY_LIMIT_BYTES } from "@/lib/public-body"

const mocks = vi.hoisted(() => ({
  general: vi.fn(),
  formal: vi.fn(),
  legacy: vi.fn(),
  monitoring: vi.fn(),
}))

vi.mock("@/lib/enquiries/intake", () => ({ persistGeneralEnquiry: mocks.general }))
vi.mock("@/lib/cases/intake", () => ({ persistGetHelpCase: mocks.formal }))
vi.mock("@/lib/enquiry-delivery", () => ({
  deliverEnquiry: mocks.legacy,
  ENQUIRY_UNAVAILABLE: "Enquiries are temporarily unavailable. Please try again shortly.",
}))
vi.mock("@/lib/monitoring/intake", () => ({ persistMonitoringRequest: mocks.monitoring }))
vi.mock("@/lib/providers/resend-enquiry-provider", () => ({
  createResendEnquiryProvider: () => {
    throw new Error("Resend must be mocked; tests must never send real email")
  },
}))

const key = "22222222-2222-4222-8222-222222222222"
const enquiry = {
  fullName: "Alex",
  email: "alex@example.com",
  source: "contact",
  subject: "general-question",
  details: "Please explain the service.",
  submissionKey: key,
}
const monitoring = {
  fullName: "Alex Morgan",
  email: "alex@example.com",
  businessName: "Harbour Bakery",
  country: "United Kingdom",
  businessProfileUrl: "https://maps.google.com/?cid=123",
  numberOfLocations: 1,
  termsAccepted: true,
  source: "start-monitoring",
  submissionKey: "11111111-2222-4333-8444-555555555555",
}

function post(url: string, body: BodyInit, headers: Record<string, string> = {}) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  resetEnquiryRateLimit()
  mocks.general.mockResolvedValue({ ok: true, persisted: true, message: "Your enquiry has been received." })
  mocks.monitoring.mockResolvedValue({ ok: true, persisted: true, status: "REQUESTED" })
})

describe("public endpoint guards", () => {
  it("shares one budget across enquiry and monitoring and ignores spoofed forwarding headers", async () => {
    const { POST: postEnquiry } = await import("@/app/api/enquiry/route")
    const { POST: postMonitoring } = await import("@/app/api/monitoring/route")
    vi.stubEnv("MONITORING_PERSISTENCE_ENABLED", "true")
    for (let index = 0; index < 4; index += 1) {
      const response = await postEnquiry(post("https://profilerelaunch.com/api/enquiry", JSON.stringify(enquiry), {
        "x-forwarded-for": `203.0.113.${index}, 198.51.100.1`,
        "x-real-ip": "203.0.113.9",
      }))
      expect(response.status).toBe(200)
    }
    for (let index = 0; index < 4; index += 1) {
      const response = await postMonitoring(post("https://profilerelaunch.com/api/monitoring", JSON.stringify(monitoring), {
        "x-forwarded-for": `192.0.2.${index}`,
      }))
      expect(response.status).toBe(200)
    }
    const rejectedEnquiry = await postEnquiry(post("https://profilerelaunch.com/api/enquiry", JSON.stringify(enquiry), {
      "x-forwarded-for": "198.51.100.77",
    }))
    const rejectedMonitoring = await postMonitoring(post("https://profilerelaunch.com/api/monitoring", JSON.stringify(monitoring), {
      "x-forwarded-for": "198.51.100.88",
      "x-real-ip": "198.51.100.89",
    }))
    expect(rejectedEnquiry.status).toBe(429)
    expect(rejectedMonitoring.status).toBe(429)
    expect(await rejectedEnquiry.json()).toMatchObject({ ok: false, message: ENQUIRY_UNAVAILABLE })
    expect(await rejectedMonitoring.json()).toMatchObject({ ok: false, message: MONITORING_UNAVAILABLE })
    expect(mocks.general).toHaveBeenCalledTimes(4)
    expect(mocks.monitoring).toHaveBeenCalledTimes(4)
    expect(mocks.legacy).not.toHaveBeenCalled()

    const separateClient = await postEnquiry(post("https://profilerelaunch.com/api/enquiry", JSON.stringify(enquiry), {
      "x-forwarded-for": "203.0.113.10",
      "x-vercel-forwarded-for": "203.0.113.10, 198.51.100.24",
    }))
    expect(separateClient.status).toBe(200)
    expect(mocks.general).toHaveBeenCalledTimes(5)
  })

  it("rejects an exactly-over-limit body and accepts the exact 64 KiB boundary before any side effect", async () => {
    const { POST } = await import("@/app/api/enquiry/route")
    const skeleton = JSON.stringify({ ...enquiry, details: "" })
    const exactDetails = "a".repeat(PUBLIC_BODY_LIMIT_BYTES - skeleton.length)
    const exact = JSON.stringify({ ...enquiry, details: exactDetails })
    expect(Buffer.byteLength(exact)).toBe(PUBLIC_BODY_LIMIT_BYTES)
    const accepted = await POST(post("https://profilerelaunch.com/api/enquiry", exact))
    expect(accepted.status).not.toBe(413)
    expect(mocks.general).not.toHaveBeenCalled()

    const oversized = JSON.stringify({ ...enquiry, details: `${exactDetails}b` })
    expect(Buffer.byteLength(oversized)).toBe(PUBLIC_BODY_LIMIT_BYTES + 1)
    const rejected = await POST(post("https://profilerelaunch.com/api/enquiry", oversized))
    expect(rejected.status).toBe(413)
    expect(mocks.general).not.toHaveBeenCalled()
    expect(mocks.legacy).not.toHaveBeenCalled()
    expect(mocks.formal).not.toHaveBeenCalled()
  })

  it("cancels an oversized stream and does not persist or send email", async () => {
    const { POST: postEnquiry } = await import("@/app/api/enquiry/route")
    const { POST: postMonitoring } = await import("@/app/api/monitoring/route")
    let cancelled = false
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(new Uint8Array(40_000))
      },
      cancel() {
        cancelled = true
      },
    })
    const response = await postEnquiry(new Request("https://profilerelaunch.com/api/enquiry", {
      method: "POST",
      body: stream,
      duplex: "half",
    } as RequestInit))
    expect(response.status).toBe(413)
    expect(cancelled).toBe(true)
    expect(mocks.general).not.toHaveBeenCalled()
    expect(mocks.legacy).not.toHaveBeenCalled()

    const monitoringResponse = await postMonitoring(post(
      "https://profilerelaunch.com/api/monitoring",
      "x".repeat(PUBLIC_BODY_LIMIT_BYTES + 1),
    ))
    expect(monitoringResponse.status).toBe(413)
    expect(mocks.monitoring).not.toHaveBeenCalled()
  })

  it("returns generic 400 for malformed JSON and does not persist", async () => {
    const { POST: postEnquiry } = await import("@/app/api/enquiry/route")
    const { POST: postMonitoring } = await import("@/app/api/monitoring/route")
    const enquiryResponse = await postEnquiry(post("https://profilerelaunch.com/api/enquiry", "{not-json"))
    const monitoringResponse = await postMonitoring(post("https://profilerelaunch.com/api/monitoring", "{not-json"))
    expect(enquiryResponse.status).toBe(400)
    expect(monitoringResponse.status).toBe(400)
    expect(JSON.stringify(await enquiryResponse.json())).not.toMatch(/SyntaxError|Unexpected token|stack/i)
    expect(JSON.stringify(await monitoringResponse.json())).not.toMatch(/SyntaxError|Unexpected token|stack/i)
    expect(mocks.general).not.toHaveBeenCalled()
    expect(mocks.monitoring).not.toHaveBeenCalled()
    expect(mocks.legacy).not.toHaveBeenCalled()
  })

  it("returns 503 and does no work when the shared limiter cannot decide", async () => {
    useSharedPublicRateLimit()
    const { POST: postEnquiry } = await import("@/app/api/enquiry/route")
    const { POST: postMonitoring } = await import("@/app/api/monitoring/route")
    vi.stubEnv("MONITORING_PERSISTENCE_ENABLED", "true")
    const enquiryResponse = await postEnquiry(post("https://profilerelaunch.com/api/enquiry", JSON.stringify(enquiry)))
    const monitoringResponse = await postMonitoring(post("https://profilerelaunch.com/api/monitoring", JSON.stringify(monitoring)))
    expect(enquiryResponse.status).toBe(503)
    expect(monitoringResponse.status).toBe(503)
    expect(await enquiryResponse.json()).toMatchObject({ ok: false, message: ENQUIRY_UNAVAILABLE })
    expect(await monitoringResponse.json()).toMatchObject({ ok: false, message: MONITORING_UNAVAILABLE })
    expect(mocks.general).not.toHaveBeenCalled()
    expect(mocks.formal).not.toHaveBeenCalled()
    expect(mocks.legacy).not.toHaveBeenCalled()
    expect(mocks.monitoring).not.toHaveBeenCalled()
  })
})
