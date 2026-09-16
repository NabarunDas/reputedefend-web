import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it, vi } from "vitest"
import { persistMonitoringRequest, type CreateMonitoringRequestV1Args, type MonitoringIntakeRpcResult } from "@/lib/monitoring/intake"
import { buildMonitoringIntakeSnapshot } from "@/lib/monitoring/snapshot"
import type { MonitoringIntakeInput } from "@/lib/monitoring/snapshot"
import type { EnquiryEmailMessage, EnquiryProvider } from "@/lib/enquiry-provider"
import type { Database } from "@/lib/supabase/database"

vi.mock("@/lib/providers/resend-enquiry-provider", () => ({
  createResendEnquiryProvider: () => {
    throw new Error("Resend must be mocked; tests must never send real email")
  },
}))

const intakeSource = readFileSync(
  fileURLToPath(new URL("./intake.ts", import.meta.url)),
  "utf8",
)

const validInput = {
  fullName: "Alex Morgan",
  email: "alex@example.com",
  phone: "+44 7700 900123",
  businessName: "Harbour Bakery",
  country: "United Kingdom",
  websiteUrl: "https://harbourbakery.example",
  businessProfileUrl: "https://maps.google.com/?cid=123",
  numberOfLocations: 1,
  termsAccepted: true,
} satisfies MonitoringIntakeInput

const SUBMISSION_KEY = "11111111-2222-4333-8444-555555555555"

const readyConfig = {
  apiKey: "re_test_key",
  fromEmail: "enquiries@reputedefend.com",
  toEmail: "owner@example.com",
  sendCustomerAck: false,
  ready: true,
} as const

function rpcRow(overrides: Partial<MonitoringIntakeRpcResult> = {}): MonitoringIntakeRpcResult {
  return {
    monitoring_request_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    customer_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
    business_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
    location_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    status: "REQUESTED",
    number_of_locations: 1,
    was_existing: false,
    customer_communication_id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    customer_communication_status: "PENDING",
    customer_communication_recipient: validInput.email,
    internal_communication_id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
    internal_communication_status: "PENDING",
    internal_communication_recipient: readyConfig.toEmail,
    intake_snapshot: buildMonitoringIntakeSnapshot(validInput),
    ...overrides,
  }
}

function mockProvider(send: EnquiryProvider["send"]): EnquiryProvider {
  return { send }
}

describe("persistMonitoringRequest", () => {
  it("calls create_monitoring_request_v1 once and returns a public REQUESTED result", async () => {
    const send = vi.fn(async () => ({ ok: true as const, id: "email_123" }))
    const createRequest = vi.fn<(args: CreateMonitoringRequestV1Args) => Promise<MonitoringIntakeRpcResult>>(
      async () => rpcRow(),
    )
    const result = await persistMonitoringRequest(validInput, SUBMISSION_KEY, {
      createRequest,
      updateCommunication: async () => {},
      provider: mockProvider(send),
      emailConfig: readyConfig,
      nodeEnv: "production",
    })
    expect(createRequest).toHaveBeenCalledTimes(1)
    expect(createRequest.mock.calls[0]?.[0]).toMatchObject({
      p_submission_key: SUBMISSION_KEY,
      p_full_name: "Alex Morgan",
      p_number_of_locations: 1,
      p_terms_accepted: true,
    })
    expect(result).toEqual({
      ok: true,
      persisted: true,
      status: "REQUESTED",
      receiptEmailSent: true,
      message: "Your Relaunch Guard setup request has been received.",
    })
    expect(result).not.toHaveProperty("monitoring_request_id")
    expect(result).not.toHaveProperty("public_ref")
    expect(result).not.toHaveProperty("caseRef")
    expect(JSON.stringify(result)).not.toMatch(/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/)
  })

  it("sends customer then internal using persisted snapshot and recipients", async () => {
    const original = {
      ...validInput,
      fullName: "Original Name",
      email: "original@example.com",
      businessName: "Alpha Ltd",
      numberOfLocations: 4,
    }
    const send = vi.fn<EnquiryProvider["send"]>(async () => ({ ok: true, id: "email_retry" }))
    const result = await persistMonitoringRequest(
      { ...validInput, businessName: "Beta Ltd", email: "changed@example.com" },
      SUBMISSION_KEY,
      {
        createRequest: async () => rpcRow({
          was_existing: true,
          customer_communication_status: "FAILED",
          internal_communication_status: "PENDING",
          intake_snapshot: buildMonitoringIntakeSnapshot(original),
          customer_communication_recipient: "original@example.com",
          internal_communication_recipient: "ops@example.com",
        }),
        updateCommunication: async () => {},
        provider: mockProvider(send),
        emailConfig: readyConfig,
        nodeEnv: "production",
      },
    )
    expect(result.ok).toBe(true)
    expect(send).toHaveBeenCalledTimes(2)
    const customer = send.mock.calls[0]?.[0]
    const internal = send.mock.calls[1]?.[0]
    expect(customer?.to).toBe("original@example.com")
    expect(customer?.text).toContain("Alpha Ltd")
    expect(customer?.text).toContain("4")
    expect(customer?.text).not.toContain("Beta Ltd")
    expect(JSON.stringify(customer)).not.toContain("changed@example.com")
    expect(internal?.to).toBe("ops@example.com")
    expect(internal?.text).toContain("Alpha Ltd")
    expect(internal?.text).not.toContain("Beta Ltd")
  })

  it("does not resend SENT communications", async () => {
    const send = vi.fn(async () => ({ ok: true as const, id: "email_new" }))
    const updates: Array<[string, Database["public"]["Tables"]["communications"]["Update"]]> = []
    const result = await persistMonitoringRequest(validInput, SUBMISSION_KEY, {
      createRequest: async () => rpcRow({
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
    expect(result.receiptEmailSent).toBe(true)
    expect(send).not.toHaveBeenCalled()
    expect(updates).toEqual([])
  })

  it("retries FAILED and PENDING communications and stores SENT metadata", async () => {
    const send = vi.fn(async () => ({ ok: true as const, id: "email_retry" }))
    const updates: Array<[string, Database["public"]["Tables"]["communications"]["Update"]]> = []
    await persistMonitoringRequest(validInput, SUBMISSION_KEY, {
      createRequest: async () => rpcRow({
        customer_communication_status: "FAILED",
        internal_communication_status: "PENDING",
      }),
      updateCommunication: async (id, values) => {
        updates.push([id, values])
      },
      provider: mockProvider(send),
      emailConfig: readyConfig,
      nodeEnv: "production",
      now: new Date("2026-09-16T12:00:00.000Z"),
    })
    expect(send).toHaveBeenCalledTimes(2)
    expect(updates.some(([, value]) => value.status === "SENT" && value.provider_message_id === "email_retry")).toBe(true)
    expect(updates.some(([, value]) => value.sent_at === "2026-09-16T12:00:00.000Z")).toBe(true)
    expect(updates.some(([, value]) => value.provider === "resend")).toBe(true)
  })

  it("marks FAILED and still returns persisted success when email cannot send", async () => {
    const send = vi.fn(async () => ({ ok: false as const, reason: "rejected" as const }))
    const updates: Array<Database["public"]["Tables"]["communications"]["Update"]> = []
    const result = await persistMonitoringRequest(validInput, SUBMISSION_KEY, {
      createRequest: async () => rpcRow(),
      updateCommunication: async (_id, values) => {
        updates.push(values)
      },
      provider: mockProvider(send),
      emailConfig: readyConfig,
      nodeEnv: "production",
    })
    expect(result).toMatchObject({ ok: true, persisted: true, status: "REQUESTED", receiptEmailSent: false })
    expect(updates.some((value) => value.status === "FAILED")).toBe(true)
    expect(JSON.stringify(updates)).not.toMatch(/re_test_key|SUPABASE|stack/i)
  })

  it("does not fall back to the current request when the persisted snapshot is invalid", async () => {
    const send = vi.fn(async () => ({ ok: true as const, id: "email_123" }))
    const updates: Array<Database["public"]["Tables"]["communications"]["Update"]> = []
    const result = await persistMonitoringRequest(
      { ...validInput, businessName: "Beta Ltd", email: "changed@example.com" },
      SUBMISSION_KEY,
      {
        createRequest: async () => rpcRow({
          intake_snapshot: { corrupted: true },
          customer_communication_recipient: "original@example.com",
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
    expect(result.persisted).toBe(true)
    expect(send).not.toHaveBeenCalled()
    expect(updates.some((value) => value.status === "FAILED")).toBe(true)
  })

  it("does not send to the current request recipient when the persisted recipient is missing", async () => {
    const send = vi.fn(async () => ({ ok: true as const, id: "email_123" }))
    const result = await persistMonitoringRequest(
      { ...validInput, email: "changed@example.com" },
      SUBMISSION_KEY,
      {
        createRequest: async () => rpcRow({
          customer_communication_recipient: "",
          internal_communication_status: "SENT",
        }),
        updateCommunication: async () => {},
        provider: mockProvider(send),
        emailConfig: readyConfig,
        nodeEnv: "production",
      },
    )
    expect(result.ok).toBe(true)
    expect(send).not.toHaveBeenCalled()
  })
})

describe("monitoring intake module shape", () => {
  it("is server-only, uses one RPC, and does not insert tables itself", () => {
    expect(intakeSource.startsWith('import "server-only"')).toBe(true)
    expect(intakeSource).toContain('client.rpc("create_monitoring_request_v1"')
    expect(intakeSource).not.toMatch(/from\("customers"\)/)
    expect(intakeSource).not.toMatch(/from\("businesses"\)/)
    expect(intakeSource).not.toMatch(/from\("locations"\)/)
    expect(intakeSource).not.toMatch(/from\("cases"\)/)
    expect(intakeSource).not.toMatch(/from\("monitoring_requests"\)/)
    expect(intakeSource).not.toMatch(/NEXT_PUBLIC_SUPABASE/)
    expect(intakeSource).not.toMatch(/public_ref|generate_case_public_ref|GR-26-/)
    expect(intakeSource).not.toMatch(/createBrowserClient|createClientComponentClient/)
  })
})
