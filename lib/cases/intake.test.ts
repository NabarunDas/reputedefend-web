import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { afterEach, describe, expect, it, vi } from "vitest"
import { persistGetHelpCase, retryStoredIntakeMail, type CaseIntakeRpcArgs, type CaseIntakeRpcResult } from "@/lib/cases/intake"
import { createMemoryIntakeMailLedger } from "@/lib/cases/intake-mail-ledger"
import { buildIntakeSnapshot } from "@/lib/cases/snapshot"
import { ENQUIRY_UNAVAILABLE } from "@/lib/enquiry-delivery"
import type { EnquiryInput } from "@/lib/enquiry"
import type { EnquiryEmailMessage, EnquiryProvider } from "@/lib/enquiry-provider"
import type { Database } from "@/lib/supabase/database"

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
  service: "profile-recovery" as const,
  websiteUrl: "https://harbourbakery.example",
  businessProfileUrl: "https://maps.google.com/?cid=123",
  reviewUrl: "",
  details: "The profile was suspended on Monday.",
  informationAccurate: true,
  privacyAccepted: true,
  source: "get-help" as const,
  subject: "",
} satisfies EnquiryInput

const SUBMISSION_KEY = "11111111-2222-4333-8444-555555555555"

const readyConfig = {
  apiKey: "re_test_key",
  fromEmail: "enquiries@reputedefend.com",
  toEmail: "owner@example.com",
  sendCustomerAck: false,
  ready: true,
} as const

function intakeRow(overrides: Partial<CaseIntakeRpcResult> = {}): CaseIntakeRpcResult {
  return {
    case_id: "11111111-1111-4111-8111-111111111111",
    public_ref: "PR-26-7K4M2Q",
    case_type: "PROFILE_RECOVERY",
    customer_id: "22222222-2222-4222-8222-222222222222",
    business_id: "33333333-3333-4333-8333-333333333333",
    location_id: "44444444-4444-4444-8444-444444444444",
    customer_communication_id: "55555555-5555-4555-8555-555555555555",
    internal_communication_id: "66666666-6666-4666-8666-666666666666",
    was_existing: false,
    customer_communication_status: "PENDING",
    internal_communication_status: "PENDING",
    intake_snapshot: buildIntakeSnapshot(validCase),
    customer_communication_recipient: validCase.email,
    internal_communication_recipient: readyConfig.toEmail,
    ...overrides,
  }
}

function mockCreateIntake(result: CaseIntakeRpcResult = intakeRow()) {
  return vi.fn<(args: CaseIntakeRpcArgs) => Promise<CaseIntakeRpcResult>>(async () => result)
}

function mockProvider(send: EnquiryProvider["send"]): EnquiryProvider {
  return { send }
}

describe("persistGetHelpCase", () => {
  it("returns a persisted public case reference after RPC success", async () => {
    const send = vi.fn(async () => ({ ok: true as const, id: "email_123" }))
    const createIntake = mockCreateIntake()
    const result = await persistGetHelpCase(validCase, SUBMISSION_KEY, {
      createIntake,
      updateCommunication: async () => {},
      provider: mockProvider(send),
      emailConfig: readyConfig,
      nodeEnv: "production",
    })
    expect(result).toMatchObject({
      ok: true,
      persisted: true,
      caseRef: "PR-26-7K4M2Q",
      caseType: "PROFILE_RECOVERY",
      receiptEmailSent: true,
      receiptEmailStatus: "sent",
    })
    expect(result).not.toHaveProperty("case_id")
    expect(result).not.toHaveProperty("customer_id")
    expect(JSON.stringify(result)).not.toMatch(/11111111-1111-4111-8111-111111111111/)
  })

  it("maps profile-access to PROFILE_RECOVERY with ACCESS_VERIFICATION", async () => {
    const createIntake = mockCreateIntake()
    await persistGetHelpCase(
      { ...validCase, service: "profile-access" },
      SUBMISSION_KEY,
      {
        createIntake,
        updateCommunication: async () => {},
        provider: mockProvider(async () => ({ ok: true, id: "email_123" })),
        emailConfig: readyConfig,
        nodeEnv: "production",
      },
    )
    expect(createIntake.mock.calls[0]?.[0]).toMatchObject({
      p_submission_key: SUBMISSION_KEY,
      p_case_type: "PROFILE_RECOVERY",
      p_issue_subtype: "ACCESS_VERIFICATION",
    })
  })

  it("maps review-protection to REVIEW_PROTECTION", async () => {
    const createIntake = mockCreateIntake(intakeRow({
      public_ref: "RV-26-X8P3LM",
      case_type: "REVIEW_PROTECTION",
    }))
    const result = await persistGetHelpCase(
      { ...validCase, service: "review-protection" },
      SUBMISSION_KEY,
      {
        createIntake,
        updateCommunication: async () => {},
        provider: mockProvider(async () => ({ ok: true, id: "email_123" })),
        emailConfig: readyConfig,
        nodeEnv: "production",
      },
    )
    expect(createIntake.mock.calls[0]?.[0].p_case_type).toBe("REVIEW_PROTECTION")
    expect(createIntake.mock.calls[0]?.[0].p_issue_subtype).toBeNull()
    expect(result.caseRef).toBe("RV-26-X8P3LM")
  })

  it("rejects a formal general case without calling the RPC", async () => {
    const createIntake = mockCreateIntake()
    const send = vi.fn(async () => ({ ok: true as const, id: "email_123" }))
    const result = await persistGetHelpCase(
      { ...validCase, service: "general" },
      SUBMISSION_KEY,
      {
        createIntake,
        updateCommunication: async () => {},
        provider: mockProvider(send),
        emailConfig: readyConfig,
        nodeEnv: "production",
      },
    )
    expect(result.ok).toBe(false)
    expect(createIntake).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
  })

  it("returns the same case when the same submission key is reused", async () => {
    const createIntake = mockCreateIntake(intakeRow({ was_existing: true }))
    const first = await persistGetHelpCase(validCase, SUBMISSION_KEY, {
      createIntake,
      updateCommunication: async () => {},
      provider: mockProvider(async () => ({ ok: true, id: "email_123" })),
      emailConfig: readyConfig,
      nodeEnv: "production",
    })
    const second = await persistGetHelpCase(validCase, SUBMISSION_KEY, {
      createIntake,
      updateCommunication: async () => {},
      provider: mockProvider(async () => ({ ok: true, id: "email_456" })),
      emailConfig: readyConfig,
      nodeEnv: "production",
    })
    expect(first.caseRef).toBe(second.caseRef)
    expect(createIntake.mock.calls[0]?.[0].p_submission_key).toBe(SUBMISSION_KEY)
    expect(createIntake.mock.calls[1]?.[0].p_submission_key).toBe(SUBMISSION_KEY)
  })

  it("does not attempt email when the RPC fails", async () => {
    const send = vi.fn(async () => ({ ok: true as const, id: "email_123" }))
    const result = await persistGetHelpCase(validCase, SUBMISSION_KEY, {
      createIntake: async () => {
        throw new Error("rpc down")
      },
      updateCommunication: async () => {},
      provider: mockProvider(send),
      emailConfig: readyConfig,
      nodeEnv: "production",
    })
    expect(result.ok).toBe(false)
    expect(result.message).toBe(ENQUIRY_UNAVAILABLE)
    expect(result.caseRef).toBeUndefined()
    expect(send).not.toHaveBeenCalled()
  })

  it("attempts email only after a persisted RPC result", async () => {
    const order: string[] = []
    const createIntake = vi.fn<(args: CaseIntakeRpcArgs) => Promise<CaseIntakeRpcResult>>(async () => {
      order.push("rpc")
      return intakeRow()
    })
    const send = vi.fn(async () => {
      order.push("email")
      return { ok: true as const, id: "email_123" }
    })
    await persistGetHelpCase(validCase, SUBMISSION_KEY, {
      createIntake,
      updateCommunication: async () => {},
      provider: mockProvider(send),
      emailConfig: readyConfig,
      nodeEnv: "production",
    })
    expect(order).toEqual(["rpc", "email", "email"])
  })

  it("still returns case success when the customer email fails", async () => {
    const send = vi.fn(async (message: EnquiryEmailMessage) => (
      message.kind === "customer-ack"
        ? { ok: false as const, reason: "rejected" as const }
        : { ok: true as const, id: "email_internal" }
    ))
    const result = await persistGetHelpCase(validCase, SUBMISSION_KEY, {
      createIntake: async () => intakeRow(),
      updateCommunication: async () => {},
      provider: mockProvider(send),
      emailConfig: readyConfig,
      nodeEnv: "production",
    })
    expect(result.ok).toBe(true)
    expect(result.caseRef).toBe("PR-26-7K4M2Q")
    expect(result.receiptEmailSent).toBe(false)
    expect(result.receiptEmailStatus).toBe("unavailable")
  })

  it("still returns case success when the internal email fails", async () => {
    const send = vi.fn(async (message: EnquiryEmailMessage) => (
      message.kind === "internal"
        ? { ok: false as const, reason: "rejected" as const }
        : { ok: true as const, id: "email_customer" }
    ))
    const result = await persistGetHelpCase(validCase, SUBMISSION_KEY, {
      createIntake: async () => intakeRow(),
      updateCommunication: async () => {},
      provider: mockProvider(send),
      emailConfig: readyConfig,
      nodeEnv: "production",
    })
    expect(result.ok).toBe(true)
    expect(result.caseRef).toBe("PR-26-7K4M2Q")
    expect(result.receiptEmailSent).toBe(true)
  })

  it("does not resend a communication that is already SENT", async () => {
    const send = vi.fn(async () => ({ ok: true as const, id: "email_new" }))
    const updates: Array<[string, Database["public"]["Tables"]["communications"]["Update"]]> = []
    const result = await persistGetHelpCase(validCase, SUBMISSION_KEY, {
      createIntake: async () => intakeRow({
        was_existing: true,
        customer_communication_status: "SENT",
        internal_communication_status: "SENT",
      }),
      updateCommunication: async (id, values) => {
        updates.push([id, values])
      },
      provider: mockProvider(send),
      emailConfig: readyConfig,
      nodeEnv: "production",
    })
    expect(result.ok).toBe(true)
    expect(result.receiptEmailSent).toBe(true)
    expect(result.receiptEmailStatus).toBe("sent")
    expect(send).not.toHaveBeenCalled()
    expect(updates).toEqual([])
  })

  it("reports feature-preview suppression without sending or calling it an unexpected failure", async () => {
    vi.stubEnv("VERCEL_ENV", "preview")
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "feature/pr")
    vi.stubEnv("SUPABASE_URL", "https://rmzozuiamjcclvtgutgd.supabase.co")
    const send = vi.fn(async () => ({ ok: true as const, id: "email_should_not_send" }))
    const updates: Array<Database["public"]["Tables"]["communications"]["Update"]> = []
    try {
      const result = await persistGetHelpCase(validCase, SUBMISSION_KEY, {
        createIntake: async () => intakeRow(),
        updateCommunication: async (_id, values) => { updates.push(values) },
        provider: mockProvider(send),
        emailConfig: readyConfig,
        nodeEnv: "production",
      })
      expect(result.ok).toBe(true)
      expect(result.receiptEmailSent).toBe(false)
      expect(result.receiptEmailStatus).toBe("suppressed")
      expect(send).not.toHaveBeenCalled()
      expect(updates.some((value) => value.status === "FAILED")).toBe(true)
      expect(JSON.stringify(result)).not.toMatch(/couldn't send|unexpected/i)
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it("keeps an already sent receipt as sent on a feature preview", async () => {
    vi.stubEnv("VERCEL_ENV", "preview")
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "feature/pr")
    vi.stubEnv("SUPABASE_URL", "https://rmzozuiamjcclvtgutgd.supabase.co")
    const send = vi.fn(async () => ({ ok: true as const, id: "email_should_not_send" }))
    try {
      const result = await persistGetHelpCase(validCase, SUBMISSION_KEY, {
        createIntake: async () => intakeRow({
          was_existing: true,
          customer_communication_status: "SENT",
          internal_communication_status: "SENT",
        }),
        updateCommunication: async () => {},
        provider: mockProvider(send),
        emailConfig: readyConfig,
        nodeEnv: "production",
      })
      expect(result.receiptEmailSent).toBe(true)
      expect(result.receiptEmailStatus).toBe("sent")
      expect(send).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllEnvs()
    }
  })

  it("retries FAILED and PENDING communications without creating new rows", async () => {
    const send = vi.fn(async () => ({ ok: true as const, id: "email_retry" }))
    const updatedIds: string[] = []
    await persistGetHelpCase(validCase, SUBMISSION_KEY, {
      createIntake: async () => intakeRow({
        was_existing: true,
        customer_communication_status: "FAILED",
        internal_communication_status: "PENDING",
      }),
      updateCommunication: async (id) => {
        updatedIds.push(id)
      },
      provider: mockProvider(send),
      emailConfig: readyConfig,
      nodeEnv: "production",
    })
    expect(send).toHaveBeenCalledTimes(2)
    expect(updatedIds).toContain("55555555-5555-4555-8555-555555555555")
    expect(updatedIds).toContain("66666666-6666-4666-8666-666666666666")
  })

  it("marks communications FAILED and still returns the case when email config is missing", async () => {
    const send = vi.fn(async () => ({ ok: true as const, id: "email_123" }))
    const updates: Array<Database["public"]["Tables"]["communications"]["Update"]> = []
    const result = await persistGetHelpCase(validCase, SUBMISSION_KEY, {
      createIntake: async () => intakeRow(),
      updateCommunication: async (_id, values) => {
        updates.push(values)
      },
      provider: mockProvider(send),
      emailConfig: { ...readyConfig, apiKey: "", ready: false },
      nodeEnv: "production",
    })
    expect(result.ok).toBe(true)
    expect(result.caseRef).toBe("PR-26-7K4M2Q")
    expect(result.receiptEmailSent).toBe(false)
    expect(result.receiptEmailStatus).toBe("unavailable")
    expect(send).not.toHaveBeenCalled()
    expect(updates.some((value) => value.status === "FAILED")).toBe(true)
    expect(JSON.stringify(updates)).not.toMatch(/re_test_key|SUPABASE|stack/i)
  })

  it("always attempts the customer receipt for persisted cases", async () => {
    const kinds: string[] = []
    const send = vi.fn(async (message: EnquiryEmailMessage) => {
      kinds.push(message.kind)
      return { ok: true as const, id: `email_${message.kind}` }
    })
    await persistGetHelpCase(validCase, SUBMISSION_KEY, {
      createIntake: async () => intakeRow(),
      updateCommunication: async () => {},
      provider: mockProvider(send),
      emailConfig: { ...readyConfig, sendCustomerAck: false },
      nodeEnv: "production",
    })
    expect(kinds).toEqual(["customer-ack", "internal"])
    expect(send.mock.calls[0]?.[0].subject).toContain("PR-26-7K4M2Q")
    expect(send.mock.calls[1]?.[0].subject).toContain("PR-26-7K4M2Q")
  })

  it("does not put a honeypot or secrets in the RPC snapshot", async () => {
    const createIntake = mockCreateIntake()
    await persistGetHelpCase(validCase, SUBMISSION_KEY, {
      createIntake,
      updateCommunication: async () => {},
      provider: mockProvider(async () => ({ ok: true, id: "email_123" })),
      emailConfig: readyConfig,
      nodeEnv: "production",
    })
    const snapshot = createIntake.mock.calls[0]?.[0].p_intake_snapshot
    expect(JSON.stringify(snapshot)).not.toMatch(/companyFax|RESEND|SUPABASE|apiKey/i)
  })

  it("retries email using the original persisted intake, not the changed request", async () => {
    const original = {
      ...validCase,
      fullName: "Original Name",
      email: "original@example.com",
      businessName: "Alpha Ltd",
      service: "profile-recovery" as const,
    }
    const send = vi.fn<EnquiryProvider["send"]>(async () => ({ ok: true, id: "email_retry" }))
    const result = await persistGetHelpCase(
      {
        ...validCase,
        service: "review-protection",
        businessName: "Beta Ltd",
        email: "changed@example.com",
      },
      SUBMISSION_KEY,
      {
        createIntake: async () => intakeRow({
          was_existing: true,
          case_type: "PROFILE_RECOVERY",
          public_ref: "PR-26-7K4M2Q",
          customer_communication_status: "FAILED",
          internal_communication_status: "PENDING",
          intake_snapshot: buildIntakeSnapshot(original),
          customer_communication_recipient: "original@example.com",
          internal_communication_recipient: "cases@example.com",
        }),
        updateCommunication: async () => {},
        provider: mockProvider(send),
        emailConfig: { ...readyConfig, toEmail: "owner@example.com" },
        nodeEnv: "production",
      },
    )

    expect(result.ok).toBe(true)
    expect(result.caseRef).toBe("PR-26-7K4M2Q")
    expect(result.caseType).toBe("PROFILE_RECOVERY")
    expect(send).toHaveBeenCalledTimes(2)

    const customer = send.mock.calls[0]?.[0]
    const internal = send.mock.calls[1]?.[0]
    expect(customer?.to).toBe("original@example.com")
    expect(customer?.subject).toContain("Profile Recovery")
    expect(customer?.subject).toContain("PR-26-7K4M2Q")
    expect(customer?.text).toContain("Alpha Ltd")
    expect(customer?.text).not.toContain("Beta Ltd")
    expect(customer?.text).not.toMatch(/Review Protection/)
    expect(JSON.stringify(customer)).not.toContain("changed@example.com")

    expect(internal?.to).toBe("cases@example.com")
    expect(internal?.subject).toContain("Profile Recovery")
    expect(internal?.subject).toContain("PR-26-7K4M2Q")
    expect(internal?.subject).toContain("Alpha Ltd")
    expect(internal?.text).toContain("original@example.com")
    expect(internal?.text).toContain("Alpha Ltd")
    expect(internal?.text).toContain("Form route: Business Profile Recovery")
    expect(internal?.text).not.toContain("Beta Ltd")
    expect(internal?.text).not.toContain("changed@example.com")
    expect(internal?.subject).not.toMatch(/Review Protection/)
  })

  it("does not email from the current request if the persisted snapshot cannot be parsed", async () => {
    const send = vi.fn(async () => ({ ok: true as const, id: "email_123" }))
    const updates: Array<Database["public"]["Tables"]["communications"]["Update"]> = []
    const result = await persistGetHelpCase(
      { ...validCase, service: "review-protection", businessName: "Beta Ltd" },
      SUBMISSION_KEY,
      {
        createIntake: async () => intakeRow({
          was_existing: true,
          customer_communication_status: "PENDING",
          internal_communication_status: "FAILED",
          intake_snapshot: { corrupted: true },
        }),
        updateCommunication: async (_id, values) => {
          updates.push(values)
        },
        provider: mockProvider(send),
        emailConfig: readyConfig,
        nodeEnv: "production",
      },
    )
    expect(result.ok).toBe(true)
    expect(result.caseRef).toBe("PR-26-7K4M2Q")
    expect(result.receiptEmailSent).toBe(false)
    expect(result.receiptEmailStatus).toBe("unavailable")
    expect(send).not.toHaveBeenCalled()
    expect(updates.every((value) => value.status === "FAILED")).toBe(true)
    expect(JSON.stringify(updates)).not.toMatch(/corrupted|stack|Beta Ltd/i)
  })

  it("is a server-only module", () => {
    const source = readFileSync(fileURLToPath(new URL("./intake.ts", import.meta.url)), "utf8")
    expect(source).toMatch(/^import "server-only"/m)
    expect(source).not.toContain("NEXT_PUBLIC_")
  })
})

const DEV_URL = "https://rmzozuiamjcclvtgutgd.supabase.co"
const CASE_ID = "11111111-1111-4111-8111-111111111111"

function stubPreview(overrides: Record<string, string | undefined> = {}) {
  const values: Record<string, string | undefined> = {
    VERCEL_ENV: "preview",
    VERCEL_GIT_COMMIT_REF: "develop",
    SUPABASE_URL: DEV_URL,
    DEV_MAIL_ENABLED: "true",
    DEV_CASE_INTAKE_NO_EMAIL: "false",
    DEV_MAIL_ALLOWED_RECIPIENTS: undefined,
    ...overrides,
  }
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) vi.stubEnv(key, undefined)
    else vi.stubEnv(key, value)
  }
}

const storedIdentity = { caseId: CASE_ID, publicRef: "PR-26-7K4M2Q" }

describe("persistGetHelpCase DEV mail gate", () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it("sends the branded acknowledgement and internal notice only when both recipients are approved", async () => {
    stubPreview()
    const send = vi.fn(async (message: EnquiryEmailMessage) => ({ ok: true as const, id: `email_${message.kind}` }))
    const updates: Array<Database["public"]["Tables"]["communications"]["Update"]> = []
    const createIntake = mockCreateIntake()
    const result = await persistGetHelpCase(validCase, SUBMISSION_KEY, {
      createIntake,
      updateCommunication: async (_id, values) => { updates.push(values) },
      provider: mockProvider(send),
      emailConfig: { ...readyConfig, extraReplyTo: "reply@example.com" },
      nodeEnv: "production",
    })
    expect(result).toMatchObject({ ok: true, persisted: true, caseRef: "PR-26-7K4M2Q", receiptEmailSent: true, receiptEmailStatus: "sent" })
    expect(createIntake).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledTimes(2)
    const customer = send.mock.calls[0]?.[0]
    const internal = send.mock.calls[1]?.[0]
    expect(customer?.kind).toBe("customer-ack")
    expect(customer?.to).toBe("alex@example.com")
    expect(customer?.replyTo).toBe(readyConfig.fromEmail)
    expect(customer?.text).toContain("PR-26-7K4M2Q")
    expect(customer?.html).toContain("PR-26-7K4M2Q")
    expect(internal?.kind).toBe("internal")
    expect(internal?.to).toBe("owner@example.com")
    expect(internal?.replyTo).toEqual(["alex@example.com", "reply@example.com"])
    expect(updates).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: "SENT", provider_message_id: "email_customer-ack", error_message: null }),
      expect.objectContaining({ status: "SENT", provider_message_id: "email_internal", error_message: null }),
    ]))
    expect(JSON.stringify(updates)).not.toMatch(/DELIVERED|re_test_key/)
  })

  it("keeps Production sending to a recipient that is not on the DEV allowlist", async () => {
    stubPreview({ VERCEL_ENV: "production", DEV_MAIL_ALLOWED_RECIPIENTS: "somebody-else@example.com" })
    const send = vi.fn(async () => ({ ok: true as const, id: "email_production" }))
    const result = await persistGetHelpCase(validCase, SUBMISSION_KEY, {
      createIntake: mockCreateIntake(),
      updateCommunication: async () => {},
      provider: mockProvider(send),
      emailConfig: readyConfig,
      nodeEnv: "production",
    })
    expect(result.receiptEmailStatus).toBe("sent")
    expect(result.emailConfirmation).toBe("omitted")
    expect(send.mock.calls[0]?.[0].text).not.toContain("Confirm my email address")
    expect(send.mock.calls[1]?.[0].text).not.toContain("Confirm my email address")
    expect(send).toHaveBeenCalledTimes(2)
  })

  it("attaches one confirmation link to the first receipt and keeps it out of the mail ledger", async () => {
    stubPreview({
      VERCEL_ENV: "production",
      COMMUNICATIONS_LINK_SECRET: "production-secret-must-not-mint-a-link",
    })
    const token = "cd".repeat(32)
    const url = `https://profilerelaunch.com/confirm-email/11111111-1111-4111-8111-111111111111#t=${token}`
    const send = vi.fn(async (message: EnquiryEmailMessage) => ({ ok: true as const, id: `email_${message.kind}` }))
    const updates: Array<Database["public"]["Tables"]["communications"]["Update"]> = []
    const result = await persistGetHelpCase(validCase, SUBMISSION_KEY, {
      createIntake: mockCreateIntake(),
      updateCommunication: async (_id, values) => { updates.push(values) },
      provider: mockProvider(send),
      emailConfig: readyConfig,
      nodeEnv: "production",
      resolveEmailConfirmation: async () => url,
    })
    const customer = send.mock.calls.find(call => call[0].kind === "customer-ack")?.[0]
    const internal = send.mock.calls.find(call => call[0].kind === "internal")?.[0]
    expect(result.emailConfirmation).toBe("pending")
    expect(customer?.text.match(/Confirm my email address/g)).toHaveLength(1)
    expect(customer?.html.match(/Confirm my email address/g)).toHaveLength(1)
    expect(customer?.text).toContain(url)
    expect(internal?.text).not.toContain("Confirm my email address")
    expect(internal?.html).not.toContain(token)
    expect(JSON.stringify(updates)).not.toContain(token)
    expect(JSON.stringify(updates)).not.toContain("confirm-email")
  })

  it("does not send on another Preview branch or another Supabase project", async () => {
    const overridesList: Array<Record<string, string>> = [
      { VERCEL_GIT_COMMIT_REF: "feature/pr" },
      { SUPABASE_URL: "https://cxwwekdzkkjjbiyofrov.supabase.co" },
    ]
    for (const overrides of overridesList) {
      vi.unstubAllEnvs()
      stubPreview(overrides)
      const send = vi.fn(async () => ({ ok: true as const, id: "email_should_not_send" }))
      const result = await persistGetHelpCase(validCase, SUBMISSION_KEY, {
        createIntake: mockCreateIntake(),
        updateCommunication: async () => {},
        provider: mockProvider(send),
        emailConfig: readyConfig,
        nodeEnv: "production",
      })
      expect(result.receiptEmailStatus).toBe("suppressed")
      expect(send).not.toHaveBeenCalled()
    }
  })

  it("sends on develop DEV when the old switches would have closed the gate", async () => {
    const cases: Array<Record<string, string | undefined>> = [
      { DEV_MAIL_ENABLED: undefined, DEV_CASE_INTAKE_NO_EMAIL: "true" },
      { DEV_MAIL_ENABLED: "true", DEV_MAIL_ALLOWED_RECIPIENTS: "" },
      { DEV_MAIL_ENABLED: "true\n", DEV_MAIL_ALLOWED_RECIPIENTS: "somebody-else@example.com" },
    ]
    for (const env of cases) {
      vi.unstubAllEnvs()
      stubPreview(env)
      const send = vi.fn(async (message: EnquiryEmailMessage) => ({ ok: true as const, id: `email_${message.kind}` }))
      const result = await persistGetHelpCase(validCase, SUBMISSION_KEY, {
        createIntake: mockCreateIntake(),
        updateCommunication: async () => {},
        provider: mockProvider(send),
        emailConfig: readyConfig,
        nodeEnv: "production",
      })
      expect(result.receiptEmailStatus).toBe("sent")
      expect(send).toHaveBeenCalledTimes(2)
      expect(send.mock.calls[0]?.[0].to).toBe("alex@example.com")
      expect(send.mock.calls[0]?.[0].idempotencyKey).toBe("case-intake:55555555-5555-4555-8555-555555555555")
      expect(send.mock.calls[1]?.[0].to).toBe("owner@example.com")
    }
  })

  it("records a provider failure without calling it delivered, and does not send a second copy after acceptance", async () => {
    stubPreview()
    const send = vi.fn(async (message: EnquiryEmailMessage) => {
      if (message.kind === "customer-ack") return { ok: false as const, reason: "rejected" as const }
      throw new Error("provider network failed")
    })
    const updates: Array<Database["public"]["Tables"]["communications"]["Update"]> = []
    const failed = await persistGetHelpCase(validCase, SUBMISSION_KEY, {
      createIntake: mockCreateIntake(),
      updateCommunication: async (_id, values) => { updates.push(values) },
      provider: mockProvider(send),
      emailConfig: readyConfig,
      nodeEnv: "production",
    })
    expect(failed.ok).toBe(true)
    expect(failed.receiptEmailStatus).toBe("unavailable")
    expect(send).toHaveBeenCalledTimes(2)
    expect(updates.some((value) => value.status === "FAILED" && value.error_message === "Delivery failed.")).toBe(true)
    expect(JSON.stringify(updates)).not.toMatch(/DELIVERED|provider network/)

    vi.unstubAllEnvs()
    stubPreview()
    const accepted = vi.fn(async (message: EnquiryEmailMessage) => ({ ok: true as const, id: `email_${message.kind}` }))
    let existing = false
    const createIntake = vi.fn<(args: CaseIntakeRpcArgs) => Promise<CaseIntakeRpcResult>>(async () => intakeRow(existing ? {
      was_existing: true,
      customer_communication_status: "SENT",
      internal_communication_status: "SENT",
    } : {}))
    await persistGetHelpCase(validCase, SUBMISSION_KEY, {
      createIntake,
      updateCommunication: async () => {},
      provider: mockProvider(accepted),
      emailConfig: readyConfig,
      nodeEnv: "production",
    })
    existing = true
    const retry = await persistGetHelpCase(validCase, SUBMISSION_KEY, {
      createIntake,
      updateCommunication: async () => {},
      provider: mockProvider(accepted),
      emailConfig: readyConfig,
      nodeEnv: "production",
    })
    expect(retry.receiptEmailStatus).toBe("sent")
    expect(createIntake).toHaveBeenCalledTimes(2)
    expect(createIntake.mock.calls[0]?.[0].p_submission_key).toBe(SUBMISSION_KEY)
    expect(createIntake.mock.calls[1]?.[0].p_submission_key).toBe(SUBMISSION_KEY)
    expect(accepted).toHaveBeenCalledTimes(2)
  })

  it("does not construct a live provider during a test run when the gate is open", async () => {
    stubPreview()
    const result = await persistGetHelpCase(validCase, SUBMISSION_KEY, {
      createIntake: mockCreateIntake(),
      updateCommunication: async () => {},
      emailConfig: readyConfig,
    })
    expect(result.ok).toBe(true)
    expect(result.receiptEmailStatus).toBe("unavailable")
  })

  it("sends when the enable flag is the word true with a trailing newline", async () => {
    stubPreview({ DEV_MAIL_ENABLED: "true\n" })
    const send = vi.fn(async () => ({ ok: true as const, id: "email_padded" }))
    const result = await persistGetHelpCase(validCase, SUBMISSION_KEY, {
      createIntake: mockCreateIntake(),
      updateCommunication: async () => {},
      provider: mockProvider(send),
      emailConfig: readyConfig,
      nodeEnv: "production",
    })
    expect(result.receiptEmailStatus).toBe("sent")
    expect(send).toHaveBeenCalledTimes(2)
  })

  it("logs a feature preview with classes and not a recipient", async () => {
    stubPreview({ VERCEL_GIT_COMMIT_REF: "feature/pr" })
    const error = vi.spyOn(console, "error").mockImplementation(() => {})
    try {
      const send = vi.fn(async () => ({ ok: true as const, id: "email_should_not_send" }))
      const result = await persistGetHelpCase(validCase, SUBMISSION_KEY, {
        createIntake: mockCreateIntake(),
        updateCommunication: async () => {},
        provider: mockProvider(send),
        emailConfig: readyConfig,
        nodeEnv: "production",
      })
      expect(result.receiptEmailStatus).toBe("suppressed")
      expect(send).not.toHaveBeenCalled()
      const lines = error.mock.calls.map((call) => String(call[0]))
      expect(lines).toContain("[case-intake] feature preview mail withheld vercel=preview ref=other database=exact-dev")
      expect(lines.join("\n")).not.toMatch(/alex@example.com|owner@example.com|@/)
    } finally {
      error.mockRestore()
    }
  })

  it("retries the stored case when the case id and public reference match", async () => {
    stubPreview()
    const send = vi.fn(async (message: EnquiryEmailMessage) => ({ ok: true as const, id: `email_${message.kind}` }))
    const loadIntake = vi.fn(async () => intakeRow({
      was_existing: true,
      customer_communication_status: "FAILED",
      internal_communication_status: "FAILED",
    }))
    const audit = vi.fn(async () => {})
    const updates: Array<Database["public"]["Tables"]["communications"]["Update"]> = []
    const first = await retryStoredIntakeMail(storedIdentity, {
      loadIntake,
      audit,
      updateCommunication: async (_id, values) => { updates.push(values) },
      provider: mockProvider(send),
      emailConfig: readyConfig,
      nodeEnv: "production",
    })
    expect(first).toMatchObject({ ok: true, persisted: true, caseRef: "PR-26-7K4M2Q", receiptEmailStatus: "sent" })
    expect(loadIntake).toHaveBeenCalledWith(storedIdentity)
    expect(send).toHaveBeenCalledTimes(2)
    expect(updates).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: "SENT", provider_message_id: "email_customer-ack" }),
      expect.objectContaining({ status: "SENT", provider_message_id: "email_internal" }),
    ]))
    expect(audit).toHaveBeenCalledWith({ caseId: CASE_ID, customer: "sent", internal: "sent" })
    expect(JSON.stringify(audit.mock.calls)).not.toMatch(/@/)
  })

  it("does not load a retry from a public reference alone or outside the develop DEV lane", async () => {
    const loadIntake = vi.fn(async () => intakeRow())
    const send = vi.fn(async () => ({ ok: true as const, id: "email_should_not_send" }))
    const overridesList: Array<Record<string, string>> = [
      { VERCEL_ENV: "production" },
      { VERCEL_GIT_COMMIT_REF: "feature/pr" },
      { SUPABASE_URL: "https://cxwwekdzkkjjbiyofrov.supabase.co" },
    ]
    for (const overrides of overridesList) {
      vi.unstubAllEnvs()
      stubPreview(overrides)
      const result = await retryStoredIntakeMail(storedIdentity, {
        loadIntake,
        updateCommunication: async () => {},
        provider: mockProvider(send),
        emailConfig: readyConfig,
        nodeEnv: "production",
      })
      expect(result.ok).toBe(false)
    }
    stubPreview()
    const mismatched = await retryStoredIntakeMail(
      { caseId: CASE_ID, publicRef: "PR-26-OTHER1" },
      { loadIntake, provider: mockProvider(send), emailConfig: readyConfig, nodeEnv: "production" },
    )
    expect(mismatched.ok).toBe(false)
    expect(loadIntake).not.toHaveBeenCalled()
    expect(send).not.toHaveBeenCalled()
  })

  it("lets one of two simultaneous retries call the provider", async () => {
    stubPreview()
    const ledger = createMemoryIntakeMailLedger()
    const customerId = "55555555-5555-4555-8555-555555555555"
    ledger.seed(customerId, { status: "FAILED", providerMessageId: null, metadata: {} })
    let release: () => void = () => {}
    const gate = new Promise<void>((resolve) => { release = resolve })
    const send = vi.fn(async () => {
      await gate
      return { ok: true as const, id: "email_once" }
    })
    const loadIntake = async () => intakeRow({
      internal_communication_id: null,
      internal_communication_status: null,
      internal_communication_recipient: null,
      customer_communication_status: "FAILED",
    })
    const options = {
      loadIntake,
      mailLedger: ledger,
      audit: async () => {},
      provider: mockProvider(send),
      emailConfig: readyConfig,
      nodeEnv: "production",
    }
    const first = retryStoredIntakeMail(storedIdentity, options)
    const second = retryStoredIntakeMail(storedIdentity, options)
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1))
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(send).toHaveBeenCalledTimes(1)
    release()
    await Promise.all([first, second])
    expect(send).toHaveBeenCalledTimes(1)
  })

  it("stops after three definite provider rejections", async () => {
    stubPreview()
    const ledger = createMemoryIntakeMailLedger()
    ledger.seed("55555555-5555-4555-8555-555555555555", { status: "FAILED", providerMessageId: null, metadata: {} })
    const send = vi.fn(async () => ({ ok: false as const, reason: "rejected" as const }))
    const loadIntake = async () => intakeRow({
      internal_communication_id: null,
      internal_communication_status: null,
      internal_communication_recipient: null,
      customer_communication_status: "FAILED",
    })
    const options = {
      loadIntake,
      mailLedger: ledger,
      audit: async () => {},
      provider: mockProvider(send),
      emailConfig: readyConfig,
      nodeEnv: "production",
    }
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await retryStoredIntakeMail(storedIdentity, options)
    }
    await retryStoredIntakeMail(storedIdentity, options)
    expect(send).toHaveBeenCalledTimes(3)
  })

  it("does not send again when the provider accepted and the acceptance row was not saved", async () => {
    stubPreview()
    const ledger = createMemoryIntakeMailLedger()
    ledger.seed("55555555-5555-4555-8555-555555555555", { status: "FAILED", providerMessageId: null, metadata: {} })
    ledger.failNextAcceptedWrite()
    const send = vi.fn(async () => ({ ok: true as const, id: "email_accepted" }))
    const loadIntake = async () => intakeRow({
      internal_communication_id: null,
      internal_communication_status: null,
      internal_communication_recipient: null,
      customer_communication_status: "FAILED",
    })
    const options = {
      loadIntake,
      mailLedger: ledger,
      audit: async () => {},
      provider: mockProvider(send),
      emailConfig: readyConfig,
      nodeEnv: "production",
    }
    const first = await retryStoredIntakeMail(storedIdentity, options)
    const second = await retryStoredIntakeMail(storedIdentity, options)
    expect(first.receiptEmailStatus).toBe("unavailable")
    expect(second.receiptEmailStatus).toBe("unavailable")
    expect(send).toHaveBeenCalledTimes(1)
  })
})
