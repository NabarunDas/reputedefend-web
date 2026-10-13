import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { ENQUIRY_UNAVAILABLE } from "@/lib/enquiry-delivery"
import { hashPublicClient, useSharedPublicRateLimit } from "@/lib/enquiry-rate-limit"
import { MONITORING_UNAVAILABLE } from "@/lib/monitoring/persistence-config"

const mocks = vi.hoisted(() => ({
  general: vi.fn(),
  formal: vi.fn(),
  legacy: vi.fn(),
  monitoring: vi.fn(),
  rpc: vi.fn(),
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
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: () => ({
    rpc: (...args: unknown[]) => ({
      abortSignal: () => mocks.rpc(...args),
    }),
  }),
}))

const secret = "server-secret"
const address = "198.51.100.24"
const clientHash = hashPublicClient(address, secret)
const enquiry = {
  fullName: "Alex",
  email: "alex@example.com",
  source: "contact",
  subject: "general-question",
  details: "Please explain the service.",
  submissionKey: "22222222-2222-4222-8222-222222222222",
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

function post(url: string, body: unknown, headers?: Record<string, string>) {
  return new Request(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(headers ?? { "x-vercel-forwarded-for": address }),
    },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  useSharedPublicRateLimit()
  vi.stubEnv("SUPABASE_URL", "https://rmzozuiamjcclvtgutgd.supabase.co")
  vi.stubEnv("SUPABASE_SECRET_KEY", secret)
  vi.stubEnv("MONITORING_PERSISTENCE_ENABLED", "true")
  mocks.general.mockResolvedValue({ ok: true, persisted: true, message: "Your enquiry has been received." })
  mocks.monitoring.mockResolvedValue({ ok: true, persisted: true, status: "REQUESTED" })
  mocks.rpc.mockResolvedValue({ data: { status: "ok" }, error: null })
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("database-backed public rate limit", () => {
  it("consumes the shared hash and then persists", async () => {
    const { POST: postEnquiry } = await import("@/app/api/enquiry/route")
    const { POST: postMonitoring } = await import("@/app/api/monitoring/route")
    const enquiryResponse = await postEnquiry(post("https://profilerelaunch.com/api/enquiry", enquiry, {
      "x-forwarded-for": "203.0.113.10, 198.51.100.1",
      "x-real-ip": "192.0.2.8",
      "x-vercel-forwarded-for": address,
    }))
    const monitoringResponse = await postMonitoring(post("https://profilerelaunch.com/api/monitoring", monitoring))
    expect(enquiryResponse.status).toBe(200)
    expect(monitoringResponse.status).toBe(200)
    expect(mocks.rpc).toHaveBeenCalledTimes(2)
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, "consume_public_rate_limit_v1", { p_client_hash: clientHash })
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "consume_public_rate_limit_v1", { p_client_hash: clientHash })
    expect(mocks.general).toHaveBeenCalledTimes(1)
    expect(mocks.monitoring).toHaveBeenCalledTimes(1)
    expect(mocks.legacy).not.toHaveBeenCalled()
    expect(mocks.formal).not.toHaveBeenCalled()
  })

  it("returns 429 without persistence or email when the database budget is exhausted", async () => {
    mocks.rpc.mockResolvedValue({ data: { status: "limited" }, error: null })
    const { POST: postEnquiry } = await import("@/app/api/enquiry/route")
    const { POST: postMonitoring } = await import("@/app/api/monitoring/route")
    const enquiryResponse = await postEnquiry(post("https://profilerelaunch.com/api/enquiry", enquiry))
    const monitoringResponse = await postMonitoring(post("https://profilerelaunch.com/api/monitoring", monitoring))
    expect(enquiryResponse.status).toBe(429)
    expect(monitoringResponse.status).toBe(429)
    expect(await enquiryResponse.json()).toMatchObject({ ok: false, message: ENQUIRY_UNAVAILABLE })
    expect(await monitoringResponse.json()).toMatchObject({ ok: false, message: MONITORING_UNAVAILABLE })
    expect(mocks.general).not.toHaveBeenCalled()
    expect(mocks.formal).not.toHaveBeenCalled()
    expect(mocks.legacy).not.toHaveBeenCalled()
    expect(mocks.monitoring).not.toHaveBeenCalled()
  })

  it("returns 503 without side effects when the database call fails", async () => {
    const { POST: postEnquiry } = await import("@/app/api/enquiry/route")
    const { POST: postMonitoring } = await import("@/app/api/monitoring/route")
    mocks.rpc.mockResolvedValueOnce({ data: { status: "ok" }, error: { message: "connection refused" } })
    mocks.rpc.mockRejectedValueOnce(new Error("timeout talking to the database"))
    const enquiryResponse = await postEnquiry(post("https://profilerelaunch.com/api/enquiry", enquiry))
    const monitoringResponse = await postMonitoring(post("https://profilerelaunch.com/api/monitoring", monitoring))
    expect(enquiryResponse.status).toBe(503)
    expect(monitoringResponse.status).toBe(503)
    const enquiryBody = await enquiryResponse.json()
    const monitoringBody = await monitoringResponse.json()
    expect(enquiryBody).toMatchObject({ ok: false, message: ENQUIRY_UNAVAILABLE })
    expect(monitoringBody).toMatchObject({ ok: false, message: MONITORING_UNAVAILABLE })
    expect(JSON.stringify(enquiryBody)).not.toMatch(/connection refused|timeout|stack/i)
    expect(JSON.stringify(monitoringBody)).not.toMatch(/connection refused|timeout|stack/i)
    expect(mocks.general).not.toHaveBeenCalled()
    expect(mocks.legacy).not.toHaveBeenCalled()
    expect(mocks.formal).not.toHaveBeenCalled()
    expect(mocks.monitoring).not.toHaveBeenCalled()
  })

  it("returns 503 without side effects when the RPC payload is not an allow or limit", async () => {
    const { POST: postEnquiry } = await import("@/app/api/enquiry/route")
    const { POST: postMonitoring } = await import("@/app/api/monitoring/route")
    for (const data of [null, "ok", { status: "allowed" }, { status: "unavailable" }, []]) {
      mocks.rpc.mockResolvedValueOnce({ data, error: null })
      mocks.rpc.mockResolvedValueOnce({ data, error: null })
      const enquiryResponse = await postEnquiry(post("https://profilerelaunch.com/api/enquiry", enquiry))
      const monitoringResponse = await postMonitoring(post("https://profilerelaunch.com/api/monitoring", monitoring))
      expect(enquiryResponse.status).toBe(503)
      expect(monitoringResponse.status).toBe(503)
    }
    expect(mocks.general).not.toHaveBeenCalled()
    expect(mocks.legacy).not.toHaveBeenCalled()
    expect(mocks.formal).not.toHaveBeenCalled()
    expect(mocks.monitoring).not.toHaveBeenCalled()
  })

  it("does not call the database for a missing or malicious forwarding header", async () => {
    const { POST: postEnquiry } = await import("@/app/api/enquiry/route")
    const { POST: postMonitoring } = await import("@/app/api/monitoring/route")
    const cases = [
      {},
      { "x-forwarded-for": "203.0.113.10, 198.51.100.20", "x-real-ip": "203.0.113.10", "x-vercel-forwarded-for": "" },
      { "x-vercel-forwarded-for": "198.51.100.24, not-an-address" },
      { "x-vercel-forwarded-for": "01.2.3.4" },
      { "x-vercel-forwarded-for": ":::" },
    ]
    for (const headers of cases) {
      const enquiryResponse = await postEnquiry(post("https://profilerelaunch.com/api/enquiry", enquiry, headers))
      const monitoringResponse = await postMonitoring(post("https://profilerelaunch.com/api/monitoring", monitoring, headers))
      expect(enquiryResponse.status).toBe(503)
      expect(monitoringResponse.status).toBe(503)
    }
    expect(mocks.rpc).not.toHaveBeenCalled()
    expect(mocks.general).not.toHaveBeenCalled()
    expect(mocks.legacy).not.toHaveBeenCalled()
    expect(mocks.formal).not.toHaveBeenCalled()
    expect(mocks.monitoring).not.toHaveBeenCalled()
  })
})
