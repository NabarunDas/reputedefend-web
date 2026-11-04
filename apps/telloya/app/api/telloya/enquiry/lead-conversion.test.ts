import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { POST } from "./route"
import { resetEnquiryRateLimit } from "@shared/enquiry-rate-limit"
import type { TelloyaEnquiryRequest } from "@/lib/enquiry-contract"

const persistTelloyaEnquiry = vi.hoisted(() => vi.fn())

vi.mock("@/lib/telloya-enquiry-intake", () => ({
  persistTelloyaEnquiry: (...args: unknown[]) => persistTelloyaEnquiry(...args),
}))

const payload: TelloyaEnquiryRequest = {
  product: "telloya",
  planTier: "growth",
  guardInterested: true,
  guardLocationCount: 2,
  businessName: "Harbour Plumbing",
  country: "United Kingdom",
  trade: "Plumbing",
  websiteUrl: "https://harbour.example",
  fullName: "Ada Lovelace",
  email: "ada@example.com",
  phone: "+447700900123",
  customRequirements: "Please call about transcripts",
  overageMonthlyCapGbp: 40,
  privacyAccepted: true,
  source: "telloya",
  submissionKey: "11111111-1111-4111-8111-111111111111",
}

function request() {
  return new Request("http://localhost:3003/api/telloya/enquiry", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-vercel-forwarded-for": "203.0.113.10",
    },
    body: JSON.stringify(payload),
  })
}

describe("Telloya enquiry lead conversion flag", () => {
  const original = process.env.TELLOYA_ENQUIRY_ENABLED

  beforeEach(() => {
    process.env.TELLOYA_ENQUIRY_ENABLED = "true"
    resetEnquiryRateLimit()
    persistTelloyaEnquiry.mockReset()
  })

  afterEach(() => {
    process.env.TELLOYA_ENQUIRY_ENABLED = original
  })

  it("returns leadConversion only for a genuine newly persisted TY enquiry", async () => {
    persistTelloyaEnquiry.mockResolvedValue({
      ok: true,
      persisted: true,
      simulated: false,
      message: "Your enquiry has been received.",
      enquiryRef: "TY-26-ABCDEF",
      receiptEmailStatus: "sent",
      leadConversion: true,
    })

    const response = await POST(request())
    const json = await response.json()
    expect(response.status).toBe(200)
    expect(json).toMatchObject({
      ok: true,
      enquiryRef: "TY-26-ABCDEF",
      leadConversion: true,
    })
    expect(json.email).toBeUndefined()
    expect(json.phone).toBeUndefined()
    expect(json.submissionKey).toBeUndefined()
    expect(json.businessName).toBeUndefined()
    expect(json.customRequirements).toBeUndefined()
    expect(json.overageMonthlyCapGbp).toBeUndefined()
  })

  it("keeps a duplicate success from counting as a new lead", async () => {
    persistTelloyaEnquiry.mockResolvedValue({
      ok: true,
      persisted: true,
      simulated: false,
      message: "Your enquiry has been received.",
      enquiryRef: "TY-26-ABCDEF",
      leadConversion: false,
    })
    const json = await (await POST(request())).json()
    expect(json.ok).toBe(true)
    expect(json.leadConversion).toBe(false)
  })

  it("does not mark a simulated or failed enquiry as a lead", async () => {
    persistTelloyaEnquiry.mockResolvedValue({
      ok: true,
      persisted: true,
      simulated: true,
      message: "simulated",
      enquiryRef: "TY-26-ABCDEF",
      leadConversion: true,
    })
    const simulated = await POST(request())
    const simulatedJson = await simulated.json()
    expect(simulated.status).toBe(503)
    expect(simulatedJson.ok).toBe(false)
    expect(simulatedJson.leadConversion).toBeUndefined()

    persistTelloyaEnquiry.mockResolvedValue({
      ok: false,
      persisted: false,
      message: "Unable to process this enquiry right now.",
      leadConversion: true,
    })
    const failed = await POST(request())
    expect(failed.status).toBe(503)
    expect((await failed.json()).leadConversion).not.toBe(true)
  })

  it("does not mark an invalid reference as a lead", async () => {
    persistTelloyaEnquiry.mockResolvedValue({
      ok: true,
      persisted: true,
      simulated: false,
      message: "Your enquiry has been received.",
      enquiryRef: "PR-26-ABCDEF",
      leadConversion: true,
    })
    const response = await POST(request())
    expect(response.status).toBe(500)
    expect((await response.json()).leadConversion).toBeUndefined()
  })
})
