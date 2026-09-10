import { afterEach, describe, expect, it, vi } from "vitest"
import { validateEnquiry, type EnquiryInput } from "@/lib/enquiry"
import { readEnquiryEmailConfig } from "@/lib/enquiry-config"
import {
  ENQUIRY_SIMULATED_MESSAGE,
  ENQUIRY_UNAVAILABLE,
  buildInternalEnquiryMessage,
  deliverEnquiry,
} from "@/lib/enquiry-delivery"
import { enquiryEmailSubject } from "@/lib/enquiry-email"
import type { EnquiryEmailMessage, EnquiryProvider } from "@/lib/enquiry-provider"
import { resetEnquiryRateLimit } from "@/lib/enquiry-rate-limit"
import { POST } from "@/app/api/enquiry/route"

vi.mock("@/lib/providers/resend-enquiry-provider", () => ({
  createResendEnquiryProvider: () => {
    throw new Error("Resend must be mocked; tests must never send real email")
  },
}))

const validCase = {
  fullName: "Alex Morgan",
  email: "alex@example.com",
  businessName: "Harbour Bakery",
  country: "United Kingdom",
  phone: "+44 7700 900123",
  service: "profile-recovery",
  websiteUrl: "https://harbourbakery.example",
  businessProfileUrl: "https://maps.google.com/?cid=123",
  reviewUrl: "",
  details: "The profile was suspended on Monday.",
  informationAccurate: true,
  privacyAccepted: true,
  source: "get-help",
  subject: "",
} satisfies EnquiryInput

const readyConfig = {
  apiKey: "re_test_key",
  fromEmail: "enquiries@reputedefend.com",
  toEmail: "owner@example.com",
  sendCustomerAck: false,
  ready: true,
} as const

function mockProvider(send: EnquiryProvider["send"]): EnquiryProvider {
  return { send }
}

function firstSend(send: { mock: { calls: unknown[][] } }) {
  return send.mock.calls[0]?.[0] as EnquiryEmailMessage | undefined
}

afterEach(() => {
  vi.unstubAllEnvs()
  resetEnquiryRateLimit()
})

describe("readEnquiryEmailConfig", () => {
  it("is not ready when required values are missing", () => {
    const config = readEnquiryEmailConfig({
      RESEND_API_KEY: "",
      ENQUIRY_FROM_EMAIL: "enquiries@reputedefend.com",
      ENQUIRY_TO_EMAIL: "owner@example.com",
    })
    expect(config.ready).toBe(false)
  })

  it("is ready when API key, from and to are present", () => {
    const config = readEnquiryEmailConfig({
      RESEND_API_KEY: "re_test_key",
      ENQUIRY_FROM_EMAIL: "enquiries@reputedefend.com",
      ENQUIRY_TO_EMAIL: "owner@example.com",
    })
    expect(config.ready).toBe(true)
    expect(config.sendCustomerAck).toBe(false)
  })
})

describe("deliverEnquiry", () => {
  it("returns unavailable when production configuration is missing", async () => {
    const result = await deliverEnquiry(validCase, {
      nodeEnv: "production",
      config: { ...readyConfig, apiKey: "", ready: false },
    })
    expect(result.ok).toBe(false)
    expect(result.simulated).not.toBe(true)
    expect(result.message).toBe(ENQUIRY_UNAVAILABLE)
  })

  it("returns success only after the provider confirms delivery", async () => {
    const send = vi.fn(async () => ({ ok: true as const, id: "email_123" }))
    const result = await deliverEnquiry(validCase, {
      nodeEnv: "production",
      config: readyConfig,
      provider: mockProvider(send),
    })
    expect(result.ok).toBe(true)
    expect(result.simulated).not.toBe(true)
    expect(send).toHaveBeenCalledTimes(1)
    const message = firstSend(send)
    expect(message?.replyTo).toBe("alex@example.com")
    expect(message?.to).toBe("owner@example.com")
    expect(message?.from).toContain("enquiries@reputedefend.com")
    expect(message?.kind).toBe("internal")
  })

  it("returns failure when the provider rejects the message", async () => {
    const send = vi.fn(async () => ({ ok: false as const, reason: "rejected" as const }))
    const result = await deliverEnquiry(validCase, {
      nodeEnv: "production",
      config: readyConfig,
      provider: mockProvider(send),
    })
    expect(result.ok).toBe(false)
    expect(result.simulated).not.toBe(true)
    expect(result.message).toBe(ENQUIRY_UNAVAILABLE)
  })

  it("returns failure when the provider throws", async () => {
    const send = vi.fn(async () => {
      throw new Error("network down")
    })
    const result = await deliverEnquiry(validCase, {
      nodeEnv: "production",
      config: readyConfig,
      provider: mockProvider(send),
    })
    expect(result.ok).toBe(false)
    expect(result.message).toBe(ENQUIRY_UNAVAILABLE)
  })

  it("never simulates success in production", async () => {
    const send = vi.fn()
    const result = await deliverEnquiry(validCase, {
      nodeEnv: "production",
      config: { ...readyConfig, ready: false },
      provider: mockProvider(send),
    })
    expect(result.ok).toBe(false)
    expect(result.simulated).not.toBe(true)
    expect(send).not.toHaveBeenCalled()
  })

  it("labels development simulation explicitly when no live provider is configured", async () => {
    const result = await deliverEnquiry(validCase, {
      nodeEnv: "development",
      config: { ...readyConfig, ready: false },
    })
    expect(result.ok).toBe(true)
    expect(result.simulated).toBe(true)
    expect(result.message).toBe(ENQUIRY_SIMULATED_MESSAGE)
  })

  it("does not simulate in the test runtime even if configuration is missing", async () => {
    const result = await deliverEnquiry(validCase, {
      nodeEnv: "test",
      config: { ...readyConfig, ready: false },
    })
    expect(result.ok).toBe(false)
    expect(result.simulated).not.toBe(true)
  })

  it("does not create a live send when credentials are present in the test runtime", async () => {
    const result = await deliverEnquiry(validCase, {
      nodeEnv: "test",
      config: readyConfig,
    })
    expect(result.ok).toBe(false)
    expect(result.simulated).not.toBe(true)
  })

  it("sets Reply-To to the validated customer email", async () => {
    const send = vi.fn(async () => ({ ok: true as const, id: "email_123" }))
    const message = buildInternalEnquiryMessage(validCase, readyConfig, new Date("2026-09-10T12:00:00.000Z"))
    expect(message.replyTo).toBe("alex@example.com")
    await deliverEnquiry(validCase, {
      nodeEnv: "production",
      config: readyConfig,
      provider: mockProvider(send),
    })
    expect(firstSend(send)?.replyTo).toBe("alex@example.com")
  })

  it("keeps the customer email as Reply-To when an extra Reply-To is configured", async () => {
    const message = buildInternalEnquiryMessage(
      validCase,
      { ...readyConfig, extraReplyTo: "team@reputedefend.com" },
      new Date("2026-09-10T12:00:00.000Z"),
    )
    expect(message.replyTo).toEqual(["alex@example.com", "team@reputedefend.com"])
  })

  it("does not send a customer acknowledgement unless explicitly enabled", async () => {
    const send = vi.fn(async () => ({ ok: true as const, id: "email_123" }))
    await deliverEnquiry(validCase, {
      nodeEnv: "production",
      config: { ...readyConfig, sendCustomerAck: false },
      provider: mockProvider(send),
    })
    expect(send).toHaveBeenCalledTimes(1)
    expect(firstSend(send)?.kind).toBe("internal")
  })

  it("does not treat a failed customer acknowledgement as a received enquiry failure", async () => {
    const send = vi.fn(async (message) => (
      message.kind === "internal"
        ? { ok: true as const, id: "email_123" }
        : { ok: false as const, reason: "rejected" as const }
    ))
    const result = await deliverEnquiry(validCase, {
      nodeEnv: "production",
      config: { ...readyConfig, sendCustomerAck: true },
      provider: mockProvider(send),
    })
    expect(result.ok).toBe(true)
    expect(send).toHaveBeenCalledTimes(2)
  })
})

describe("enquiry email mapping", () => {
  it("distinguishes case and general enquiry subjects", () => {
    expect(enquiryEmailSubject(validCase)).toBe("[ReputeDefend] New Profile Recovery case — Harbour Bakery")
    expect(enquiryEmailSubject({
      ...validCase,
      service: "review-protection",
      businessName: "Lee & Co",
    })).toBe("[ReputeDefend] New Review Protection case — Lee & Co")
    expect(enquiryEmailSubject({
      fullName: "Sam Patel",
      email: "sam@example.com",
      businessName: "",
      country: "",
      phone: "",
      service: "",
      subject: "partnership",
      websiteUrl: "",
      businessProfileUrl: "",
      reviewUrl: "",
      details: "A partnership question.",
      informationAccurate: false,
      privacyAccepted: false,
      source: "contact",
    })).toBe("[ReputeDefend] General enquiry — Partnership / business enquiry")
    expect(enquiryEmailSubject({
      fullName: "Jordan Lee",
      email: "jordan@example.com",
      businessName: "Lee & Co",
      country: "",
      phone: "",
      service: "review-protection",
      subject: "",
      websiteUrl: "",
      businessProfileUrl: "",
      reviewUrl: "",
      details: "A homepage enquiry about a review.",
      informationAccurate: false,
      privacyAccepted: false,
      source: "homepage",
    })).toBe("[ReputeDefend] General enquiry — Review issue")
  })

  it("includes case-intake fields and omits empty optionals and any honeypot", () => {
    const text = buildInternalEnquiryMessage(
      validCase,
      readyConfig,
      new Date("2026-09-10T12:00:00.000Z"),
    ).text
    expect(text).toContain("Source: Get Help")
    expect(text).toContain("Service type: Business Profile Recovery")
    expect(text).toContain("Name: Alex Morgan")
    expect(text).toContain("Email: alex@example.com")
    expect(text).toContain("Phone: +44 7700 900123")
    expect(text).toContain("Business: Harbour Bakery")
    expect(text).toContain("Country: United Kingdom")
    expect(text).toContain("Website: https://harbourbakery.example")
    expect(text).toContain("Business Profile URL: https://maps.google.com/?cid=123")
    expect(text).not.toContain("Review URL:")
    expect(text).toContain("Accuracy confirmation: Yes")
    expect(text).toContain("Privacy acknowledgement: Yes")
    expect(text).toContain("Submitted: 2026-09-10T12:00:00.000Z")
    expect(text.indexOf("Privacy acknowledgement")).toBeLessThan(text.indexOf("Submitted:"))
    expect(text).not.toContain("companyFax")
    expect(text).not.toContain("honeypot")
  })

  it("escapes user-controlled HTML in the internal message", () => {
    const html = buildInternalEnquiryMessage(
      { ...validCase, details: '<img src=x onerror="alert(1)"> & more' },
      readyConfig,
      new Date("2026-09-10T12:00:00.000Z"),
    ).html
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; more")
    expect(html).not.toContain("<img")
  })
})

describe("honeypot isolation", () => {
  it("never reaches the provider when the honeypot is filled", async () => {
    const send = vi.fn(async () => ({ ok: true as const, id: "email_123" }))
    const checked = validateEnquiry({ ...validCase, companyFax: "https://spam.example" })
    expect(checked.valid).toBe(false)
    expect(send).not.toHaveBeenCalled()

    const response = await POST(new Request("http://localhost/api/enquiry", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...validCase, companyFax: "https://spam.example" }),
    }))
    expect(response.status).toBe(400)
    expect(send).not.toHaveBeenCalled()
  })
})

describe("POST /api/enquiry", () => {
  it("returns unavailable in the test runtime without simulating success", async () => {
    const response = await POST(new Request("http://localhost/api/enquiry", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validCase),
    }))
    const json = await response.json() as { ok?: boolean; simulated?: boolean; message?: string }
    expect(response.status).toBe(503)
    expect(json.ok).toBe(false)
    expect(json.simulated).not.toBe(true)
    expect(json.message).toBe(ENQUIRY_UNAVAILABLE)
  })

  it("returns unavailable when production configuration is missing", async () => {
    vi.stubEnv("NODE_ENV", "production")
    vi.stubEnv("RESEND_API_KEY", "")
    vi.stubEnv("ENQUIRY_FROM_EMAIL", "")
    vi.stubEnv("ENQUIRY_TO_EMAIL", "")

    const response = await POST(new Request("http://localhost/api/enquiry", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(validCase),
    }))
    const json = await response.json() as { ok?: boolean; simulated?: boolean; message?: string }
    expect(response.status).toBe(503)
    expect(json.ok).toBe(false)
    expect(json.simulated).not.toBe(true)
    expect(json.message).toBe(ENQUIRY_UNAVAILABLE)
  })
})
