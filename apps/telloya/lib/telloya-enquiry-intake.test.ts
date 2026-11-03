import { beforeEach, describe, expect, it, vi } from "vitest"
import type { EnquiryEmailConfig } from "@shared/enquiry-config"
import type { EnquiryInput } from "@shared/enquiry"
import type { CustomEmailBuilder } from "@shared/enquiries/intake"
import { persistTelloyaEnquiry } from "./telloya-enquiry-intake"
import type { TelloyaEnquiryInput } from "./telloya-enquiry"

const persistGeneralEnquiry = vi.fn()

vi.mock("@shared/enquiries/intake", () => ({
  persistGeneralEnquiry: (...args: unknown[]) => persistGeneralEnquiry(...args),
}))

const config: EnquiryEmailConfig = {
  apiKey: "test-key",
  fromEmail: "from@example.com",
  toEmail: "team@example.com",
  extraReplyTo: "",
  sendCustomerAck: false,
  ready: true,
}

const enquiry: TelloyaEnquiryInput = {
  planTier: "custom",
  product: "telloya",
  guardInterested: true,
  guardLocationCount: 2,
  customMonthlyMinutes: 10000,
  customPhoneNumbers: 3,
  customLocations: 4,
  customRequirements: "Need <script>alert('xss')</script> & CRM",
  voicePreference: "female",
  voiceAccent: "British",
  primaryLanguage: "English",
  speakingStyle: "professional",
  additionalLanguages: "Polish <b>and</b> Romanian",
  overageInterested: true,
  overageMonthlyCapGbp: 75,
  businessName: "Harbour & Co",
  country: "GB",
  trade: "Plumbing",
  fullName: "Ada <script>",
  email: "ada@example.com",
  phone: "+447700900000",
  privacyAccepted: true,
  source: "telloya",
}

describe("Telloya internal email builder path", () => {
  beforeEach(() => {
    persistGeneralEnquiry.mockReset()
  })

  it("passes plan, Guard, custom, voice and overage through the real builder with escaped HTML", async () => {
    let builder: CustomEmailBuilder | undefined
    let persisted: EnquiryInput | undefined
    persistGeneralEnquiry.mockImplementation(async (data: EnquiryInput, _key: string, options: { customEmailBuilder?: CustomEmailBuilder }) => {
      persisted = data
      builder = options.customEmailBuilder
      return { ok: true, persisted: true, message: "stored", enquiryRef: "TY-26-ABCDEF" }
    })

    const result = await persistTelloyaEnquiry(enquiry, "11111111-1111-4111-8111-111111111111")
    expect(result.ok).toBe(true)
    expect(builder).toBeDefined()
    expect(persisted).toMatchObject({
      planTier: "custom",
      guardInterested: true,
      guardLocationCount: 2,
      customMonthlyMinutes: 10000,
      customRequirements: "Need <script>alert('xss')</script> & CRM",
      voicePreference: "female",
      overageInterested: true,
      overageMonthlyCapGbp: 75,
    })

    const message = builder!.buildInternal(persisted!, config, new Date("2026-11-03T12:00:00Z"), "TY-26-ABCDEF")
    expect(message.kind).toBe("internal")
    expect(message.text).toContain("Selected Plan: Custom")
    expect(message.text).toContain("Relaunch Guard: Interested (2 locations)")
    expect(message.text).toContain("Monthly minutes: 10000")
    expect(message.text).toContain("Need <script>alert('xss')</script> & CRM")
    expect(message.text).toContain("Voice preference: female")
    expect(message.text).toContain("Accent: British")
    expect(message.text).toContain("Interested in additional minutes (cap: £75/month)")

    expect(message.html).toContain("Selected Plan")
    expect(message.html).toContain("Custom (quotation required)")
    expect(message.html).toContain("Relaunch Guard")
    expect(message.html).toContain("Interested (2 locations)")
    expect(message.html).toContain("Additional Minutes Interest")
    expect(message.html).toContain("£75/month")
    expect(message.html).toContain("&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;")
    expect(message.html).toContain("&amp; CRM")
    expect(message.html).toContain("Ada &lt;script&gt;")
    expect(message.html).toContain("Polish &lt;b&gt;and&lt;/b&gt; Romanian")
    expect(message.html).not.toContain("<script>")
    expect(message.html).not.toContain("<b>and</b>")
  })
})
