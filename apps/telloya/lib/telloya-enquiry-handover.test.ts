import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { afterEach, describe, expect, it } from "vitest"
import { persistGeneralEnquiry } from "@shared/enquiries/intake"
import type { EnquiryInput } from "@shared/enquiry"
import type { EnquiryEmailMessage } from "@shared/enquiry-provider"
import { POST } from "@/app/api/telloya/enquiry/route"
import { persistTelloyaEnquiry } from "./telloya-enquiry-intake"
import { telloyaEnquiryToPayload, validateTelloyaEnquiry, type TelloyaEnquiryInput } from "./telloya-enquiry"

const reference = "TY-26-ABCDEF"
const key = "11111111-1111-4111-8111-111111111111"
const originalFlag = process.env.TELLOYA_ENQUIRY_ENABLED

const config = {
  apiKey: "test-key",
  fromEmail: "from@example.com",
  toEmail: "team@example.com",
  extraReplyTo: "",
  sendCustomerAck: true,
  ready: true,
}

function requestBody(extra: Record<string, unknown> = {}) {
  return {
    product: "telloya",
    planTier: "growth",
    businessName: "Harbour Plumbing",
    country: "United Kingdom",
    trade: "Plumbing",
    fullName: "Ada Lovelace",
    email: "ada@example.com",
    phone: "+447700900123",
    privacyAccepted: true,
    source: "telloya",
    submissionKey: key,
    ...extra,
  }
}

function validated(extra: Partial<TelloyaEnquiryInput> & Record<string, unknown> = {}): TelloyaEnquiryInput {
  const result = validateTelloyaEnquiry(requestBody(extra))
  if (!result.valid) throw new Error(result.error)
  return result.data
}

afterEach(() => {
  process.env.TELLOYA_ENQUIRY_ENABLED = originalFlag
})

describe("Telloya enquiry handover", () => {
  it.each(["basic", "growth", "pro"] as const)("stores %s as customer interest and uses one TY reference", async (planTier) => {
    const sent: EnquiryEmailMessage[] = []
    const stored: TelloyaEnquiryInput[] = []
    const result = await persistTelloyaEnquiry(validated({ planTier, guardInterested: false }), key, {
      nodeEnv: "test",
      config,
      create: async (_key, data) => {
        stored.push(data as unknown as TelloyaEnquiryInput)
        return { status: "created", id: "enq-1", attempt: "att-1", sendAck: true, enquiryRef: reference }
      },
      finish: async () => {},
      provider: { send: async (message) => { sent.push(message); return { ok: true, id: "msg" } } },
    })

    expect(result).toMatchObject({
      ok: true,
      persisted: true,
      enquiryRef: reference,
      receiptEmailStatus: "sent",
      leadConversion: true,
    })
    expect(stored[0]).toMatchObject({ planTier, product: "telloya", guardInterested: false, privacyAccepted: true, country: "GB" })
    expect(stored[0].guardLocationCount).toBeUndefined()
    const customer = sent.find((message) => message.kind === "customer-ack")
    const internal = sent.find((message) => message.kind === "internal")
    expect(customer?.subject).toContain(reference)
    expect(customer?.text).toContain(reference)
    expect(customer?.text).toContain("ProfileRelaunch Ltd")
    expect(customer?.text).toContain("Thank you for your interest in Telloya. We have received your enquiry")
    expect(customer?.text).toContain("discuss how Telloya can help your business")
    expect(customer?.text).not.toContain("personalised Telloya demonstration")
    expect(customer?.text).not.toContain("confirmed demonstration booking")
    expect(customer?.text).toContain("does not, by itself, create a client relationship or activate any service")
    expect(internal?.text).not.toContain("Personalised live demonstration")
    expect(internal?.subject).toContain(reference)
    expect(internal?.subject).not.toContain("Complete")
    expect(internal?.text).toContain(`Selected Plan: ${planTier[0].toUpperCase()}${planTier.slice(1)}`)
    expect(internal?.text).toContain("Customer interest only. This is not an approved offer.")
    expect(internal?.html).toContain(`Selected Plan`)
    expect(internal?.html).toContain(`${planTier[0].toUpperCase()}${planTier.slice(1)}`)
    expect(internal?.html).toContain("Customer interest only. This is not an approved offer.")
    expect(internal?.text).not.toContain("consultation required")
    expect(internal?.text).not.toContain("Relaunch Guard: Interested")
  })

  it("persists a product-only Telloya enquiry as plan consultation without a subscription", async () => {
    const sent: EnquiryEmailMessage[] = []
    const stored: Array<Record<string, unknown>> = []
    const { planTier: _planTier, ...productOnly } = requestBody()
    const validatedEnquiry = validateTelloyaEnquiry(productOnly)
    expect(validatedEnquiry.valid).toBe(true)
    if (!validatedEnquiry.valid) return
    expect(validatedEnquiry.data.planTier).toBeUndefined()
    expect(validatedEnquiry.data.product).toBe("telloya")

    const result = await persistTelloyaEnquiry(validatedEnquiry.data, key, {
      nodeEnv: "test",
      config,
      create: async (_key, data) => {
        stored.push(data as unknown as Record<string, unknown>)
        return { status: "created", id: "enq-advice", attempt: "att-advice", sendAck: true, enquiryRef: reference }
      },
      finish: async () => {},
      provider: { send: async (message) => { sent.push(message); return { ok: true, id: "msg" } } },
    })

    expect(result).toMatchObject({
      ok: true,
      persisted: true,
      enquiryRef: reference,
      receiptEmailStatus: "sent",
      leadConversion: true,
    })
    expect(reference).toMatch(/^TY-\d\d-[A-HJ-NP-Z2-9]{6}$/)
    expect(stored[0]).toMatchObject({
      product: "telloya",
      privacyAccepted: true,
      guardInterested: false,
      overageInterested: false,
    })
    expect(stored[0].planTier).toBeUndefined()
    expect(stored[0].customMonthlyMinutes).toBeUndefined()
    expect(stored[0]).not.toHaveProperty("subscription")
    expect(stored[0]).not.toHaveProperty("stripe")
    const internal = sent.find((message) => message.kind === "internal")
    const customer = sent.find((message) => message.kind === "customer-ack")
    expect(internal?.subject).toContain("New Telloya enquiry")
    expect(internal?.text).toContain("Product Interest: Telloya (AI Receptionist)")
    expect(internal?.text).toContain("Plan selection: Not selected — consultation required")
    expect(internal?.text).toContain("Next action: Contact the customer to discuss requirements and recommend a suitable Telloya plan.")
    expect(internal?.html).toContain("Plan selection")
    expect(internal?.html).toContain("Not selected — consultation required")
    expect(internal?.html).toContain("Next action")
    expect(internal?.html).toContain("Contact the customer to discuss requirements and recommend a suitable Telloya plan.")
    expect(internal?.text).not.toContain("Selected Plan:")
    expect(internal?.html).not.toContain("Selected Plan")
    for (const tier of ["Basic (£49/month, 120 minutes)", "Growth (£79/month, 300 minutes)", "Pro (£120/month, 500 minutes)", "Custom (quotation required)"]) {
      expect(internal?.text).not.toContain(tier)
      expect(internal?.html).not.toContain(tier)
    }
    expect(internal?.text).not.toContain("£49")
    expect(internal?.text).not.toContain("£79")
    expect(internal?.text).not.toContain("£120")
    expect(internal?.text).not.toContain("Help me choose")
    expect(customer?.text).toContain(reference)
    expect(customer?.text).toContain("Thank you for your interest in Telloya. We have received your enquiry")
    expect(customer?.text).toContain("discuss how Telloya can help your business")
    expect(customer?.text).not.toContain("personalised Telloya demonstration")
    expect(customer?.text).not.toContain("confirmed demonstration booking")
    expect(customer?.text).toContain("does not, by itself, create a client relationship or activate any service")
    expect(internal?.text).not.toContain("Personalised live demonstration")
    expect(customer?.text).not.toContain("consultation required")
    expect(customer?.html).not.toContain("consultation required")
    expect(customer?.text).not.toMatch(/subscription|payment|Stripe|entitlement/i)
  })

  it("keeps Guard interest and a full optional record without authorising a purchase", async () => {
    const sent: EnquiryEmailMessage[] = []
    const stored: Array<Record<string, unknown>> = []
    const result = await persistTelloyaEnquiry(validated({
      planTier: "growth",
      guardInterested: true,
      guardLocationCount: 2,
      locations: "Two depots",
      websiteUrl: "https://harbour.example",
      missedCallProblem: "Calls while on site",
      phoneSetup: "Mobile",
      contactPreference: "Weekday mornings",
      voicePreference: "female",
      voiceAccent: "British",
      primaryLanguage: "English",
      speakingStyle: "professional",
      additionalLanguages: "Polish",
      overageInterested: true,
      overageMonthlyCapGbp: 40,
    }), key, {
      nodeEnv: "test",
      config,
      create: async (_key, data) => {
        stored.push(data as unknown as Record<string, unknown>)
        return { status: "created", id: "enq-1", attempt: "att-1", sendAck: true, enquiryRef: reference }
      },
      finish: async () => {},
      provider: { send: async (message) => { sent.push(message); return { ok: true, id: "msg" } } },
    })

    expect(result.enquiryRef).toBe(reference)
    expect(stored[0]).toMatchObject({
      product: "telloya",
      planTier: "growth",
      guardInterested: true,
      guardLocationCount: 2,
      phoneSetup: "Mobile",
      missedCallProblem: "Calls while on site",
      voicePreference: "female",
      voiceAccent: "British",
      primaryLanguage: "English",
      speakingStyle: "professional",
      additionalLanguages: "Polish",
      contactPreference: "Weekday mornings",
      websiteUrl: "https://harbour.example",
      overageInterested: true,
      overageMonthlyCapGbp: 40,
      privacyAccepted: true,
    })
    expect(stored[0].product).not.toBe("complete")
    const internal = sent.find((message) => message.kind === "internal")
    expect(internal?.text).toContain(reference)
    expect(internal?.text).toContain("Relaunch Guard: Interested (2 locations)")
    expect(internal?.text).toContain("not a Guard purchase")
    expect(internal?.text).toContain("not the Complete bundle")
    expect(internal?.text).toContain("does not authorise overage billing")
    expect(internal?.subject).toContain("New Telloya enquiry")
    expect(sent.filter((message) => message.kind === "customer-ack")).toHaveLength(1)
  })

  it("stores Custom quotation requirements and leaves calls optional", async () => {
    const stored: Array<Record<string, unknown>> = []
    await persistTelloyaEnquiry(validated({
      planTier: "custom",
      customMonthlyMinutes: 1000,
      customPhoneNumbers: 2,
      customLocations: 4,
      customLanguages: "English, Polish",
      customRequirements: "Night answering",
    }), key, {
      nodeEnv: "test",
      config,
      create: async (_key, data) => {
        stored.push(data as unknown as Record<string, unknown>)
        return { status: "created", id: "enq-1", attempt: "att-1", sendAck: true, enquiryRef: reference }
      },
      finish: async () => {},
      provider: { send: async () => ({ ok: true, id: "msg" }) },
    })
    expect(stored[0]).toMatchObject({
      planTier: "custom",
      customMonthlyMinutes: 1000,
      customPhoneNumbers: 2,
      customLocations: 4,
      customLanguages: "English, Polish",
      customRequirements: "Night answering",
    })
    expect(stored[0].customMonthlyCalls).toBeUndefined()
    const missingCalls = validateTelloyaEnquiry(requestBody({ planTier: "custom", customMonthlyMinutes: 1000, customPhoneNumbers: 2, customLocations: 4 }))
    expect(missingCalls.valid).toBe(true)
    const missingMinutes = validateTelloyaEnquiry(requestBody({ planTier: "custom", customPhoneNumbers: 2, customLocations: 4 }))
    expect(missingMinutes.valid).toBe(false)
    if (!missingMinutes.valid) expect(missingMinutes.errors?.customMonthlyCalls).toBeUndefined()
  })

  it("reuses one TY reference when the same submission key is retried", async () => {
    let created = false
    const sent: EnquiryEmailMessage[] = []
    const overrides = {
      nodeEnv: "test" as const,
      config,
      create: async () => {
        if (created) return { status: "existing" as const, enquiryRef: reference }
        created = true
        return { status: "created" as const, id: "enq-1", attempt: "att-1", sendAck: true, enquiryRef: reference }
      },
      finish: async () => {},
      provider: { send: async (message: EnquiryEmailMessage) => { sent.push(message); return { ok: true as const, id: "msg" } } },
    }
    const data = validated({
      planTier: "pro",
      receptionistQuestions: "Ask for the postcode and whether anyone is at the property.",
      requestIntent: "personalised-demo",
    })
    const first = await persistTelloyaEnquiry(data, key, overrides)
    const second = await persistTelloyaEnquiry(data, key, overrides)
    expect(first.enquiryRef).toBe(reference)
    expect(first.leadConversion).toBe(true)
    expect(sent.find((message) => message.kind === "internal")?.text).toContain("Ask for the postcode and whether anyone is at the property.")
    expect(sent.find((message) => message.kind === "internal")?.text).toContain("Personalised live demonstration")
    expect(sent.find((message) => message.kind === "internal")?.text).toContain("This does not book a demonstration or provision an agent.")
    expect(sent.find((message) => message.kind === "customer-ack")?.text).toContain("We'll review your requirements and contact you to arrange a time for you to call our demonstration number.")
    expect(sent.find((message) => message.kind === "customer-ack")?.text).toContain("not a confirmed demonstration booking")
    expect(second.enquiryRef).toBe(reference)
    expect(second.leadConversion).toBe(false)
    expect(sent).toHaveLength(2)
    expect(sent.filter((message) => message.text.includes("Ask for the postcode"))).toHaveLength(1)
    expect(new Set(sent.map((message) => message.text.match(/TY-\d\d-[A-HJ-NP-Z2-9]{6}/g)?.[0]))).toEqual(new Set([reference]))
  })

  it("reports failed and suppressed acknowledgement without claiming delivery", async () => {
    const failed = await persistTelloyaEnquiry(validated({ planTier: "basic" }), key, {
      nodeEnv: "test",
      config,
      create: async () => ({ status: "created", id: "enq-1", attempt: "att-1", sendAck: true, enquiryRef: reference }),
      finish: async () => {},
      provider: { send: async () => ({ ok: false, reason: "rejected" }) },
    })
    expect(failed.ok).toBe(true)
    expect(failed.enquiryRef).toBe(reference)
    expect(failed.receiptEmailSent).toBe(false)
    expect(failed.receiptEmailStatus).toBe("unavailable")

    const suppressed = await persistTelloyaEnquiry(validated({ planTier: "basic" }), key, {
      nodeEnv: "test",
      config,
      create: async () => ({ status: "created", id: "enq-2", attempt: "att-2", sendAck: false, enquiryRef: reference }),
      finish: async () => {},
      provider: { send: async (message) => { expect(message.kind).toBe("internal"); return { ok: true, id: "msg" } } },
    })
    expect(suppressed.receiptEmailStatus).toBe("suppressed")
    expect(suppressed.receiptEmailSent).toBe(false)
    expect(suppressed.enquiryRef).toBe(reference)
  })

  it("rejects malformed submissions and stays closed when public submission is disabled", async () => {
    expect(validateTelloyaEnquiry(["not", "an", "enquiry"]).valid).toBe(false)
    expect(validateTelloyaEnquiry(requestBody({ planTier: "platinum" })).valid).toBe(false)
    expect(validateTelloyaEnquiry(requestBody({ privacyAccepted: false })).valid).toBe(false)
    expect(validateTelloyaEnquiry(requestBody({ guardInterested: true })).valid).toBe(false)

    process.env.TELLOYA_ENQUIRY_ENABLED = "false"
    const disabled = await POST(new Request("http://127.0.0.1/api/telloya/enquiry", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(requestBody({ planTier: "growth" })),
    }))
    expect(disabled.status).toBe(503)
    expect(await disabled.json()).toMatchObject({ ok: false, code: "SERVICE_UNAVAILABLE" })

    process.env.TELLOYA_ENQUIRY_ENABLED = "true"
    const malformed = await POST(new Request("http://127.0.0.1/api/telloya/enquiry", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    }))
    expect(malformed.status).toBe(400)
    const missingKey = await POST(new Request("http://127.0.0.1/api/telloya/enquiry", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(requestBody({ submissionKey: "not-a-uuid" })),
    }))
    expect(missingKey.status).toBe(400)
    expect((await missingKey.json()).enquiryRef).toBeUndefined()
  })

  it("does not start Stripe, Retell, or a live agent from the enquiry path", () => {
    const files = [
      "app/api/telloya/enquiry/route.ts",
      "lib/telloya-enquiry-intake.ts",
      "lib/telloya-enquiry.ts",
      "lib/telloya-enquiry-email.ts",
    ].map((path) => readFileSync(resolve(process.cwd(), path), "utf8")).join("\n")
    expect(files).not.toMatch(/stripe|retell|checkout\.sessions|subscription_items/i)
  })

  it("leaves a ProfileRelaunch enquiry on the shared path without a Telloya reference", async () => {
    const general: EnquiryInput = {
      fullName: "Alex Morgan",
      email: "alex@example.com",
      phone: "07123456789",
      businessName: "Example Bakery",
      country: "GB",
      service: "general",
      subject: "general-question",
      details: "I need help with my business profile.",
      websiteUrl: "",
      businessProfileUrl: "",
      reviewUrl: "",
      informationAccurate: false,
      privacyAccepted: true,
      source: "contact",
    }
    const sent: EnquiryEmailMessage[] = []
    const result = await persistGeneralEnquiry(general, key, {
      nodeEnv: "test",
      config,
      create: async () => ({ status: "created", id: "pr-1", attempt: "att-1", sendAck: true }),
      finish: async () => {},
      provider: { send: async (message) => { sent.push(message); return { ok: true, id: "msg" } } },
    })
    expect(result.ok).toBe(true)
    expect(result.enquiryRef).toBeUndefined()
    expect(sent.length).toBeGreaterThan(0)
    for (const message of sent) {
      expect(message.subject).not.toContain("Telloya")
      expect(message.text).not.toContain(reference)
    }
  })

  it("accepts a bounded receptionist question, and rejects an empty-looking, oversized or malformed one", () => {
    const question = "Ask for the boiler make. Do not collect account passwords."
    for (const extra of [
      { planTier: "basic" },
      { planTier: "growth" },
      { planTier: "pro" },
      { planTier: "custom", customMonthlyMinutes: 800, customPhoneNumbers: 1, customLocations: 1 },
      { planTier: undefined },
    ]) {
      const result = validateTelloyaEnquiry(requestBody({ ...extra, receptionistQuestions: question }))
      expect(result.valid).toBe(true)
      if (!result.valid) continue
      const payload = telloyaEnquiryToPayload(result.data)
      expect(payload.receptionistQuestions).toBe(question)
      expect(payload.details).not.toContain("Receptionist questions:")
      expect(payload.requestIntent).toBeUndefined()
    }

    const blank = validateTelloyaEnquiry(requestBody({ receptionistQuestions: "  \u0000  " }))
    expect(blank.valid).toBe(true)
    if (blank.valid) expect(telloyaEnquiryToPayload(blank.data).receptionistQuestions).toBeUndefined()

    const oversized = validateTelloyaEnquiry(requestBody({ receptionistQuestions: "q".repeat(2001) }))
    expect(oversized.valid).toBe(false)
    if (!oversized.valid) expect(oversized.errors?.receptionistQuestions).toContain("2,000")

    const malformed = validateTelloyaEnquiry(requestBody({ receptionistQuestions: { password: "secret" } }))
    expect(malformed.valid).toBe(false)
    if (!malformed.valid) {
      expect(malformed.error).toBe("Unable to process this enquiry.")
      expect(malformed.errors).toBeUndefined()
    }

    const demo = validateTelloyaEnquiry(requestBody({
      requestIntent: "personalised-demo",
      receptionistQuestions: "q".repeat(2000),
      missedCallProblem: "m".repeat(4000),
    }))
    expect(demo.valid).toBe(true)
    if (demo.valid) {
      const payload = telloyaEnquiryToPayload(demo.data)
      expect(payload.requestIntent).toBe("personalised-demo")
      expect(payload.receptionistQuestions).toHaveLength(2000)
      expect(payload.details).not.toContain("Receptionist questions:")
      expect(payload.details.length).toBeLessThanOrEqual(5000)
    }

    const unknownIntent = validateTelloyaEnquiry(requestBody({ requestIntent: "instant-demo" }))
    expect(unknownIntent.valid).toBe(false)
    if (!unknownIntent.valid) expect(unknownIntent.errors).toBeUndefined()
    const blankIntent = validateTelloyaEnquiry(requestBody({ requestIntent: "   " }))
    expect(blankIntent.valid).toBe(true)
    if (blankIntent.valid) expect(telloyaEnquiryToPayload(blankIntent.data).requestIntent).toBeUndefined()
  })
})
