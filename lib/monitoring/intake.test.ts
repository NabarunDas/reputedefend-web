import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it, vi } from "vitest"
import { persistMonitoringRequest, type CreateMonitoringRequestV1Args, type MonitoringIntakeRpcResult } from "@/lib/monitoring/intake"
import { buildMonitoringIntakeSnapshot } from "@/lib/monitoring/snapshot"
import type { MonitoringIntakeInput } from "@/lib/monitoring/snapshot"

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
    internal_communication_recipient: "owner@example.com",
    intake_snapshot: buildMonitoringIntakeSnapshot(validInput),
    ...overrides,
  }
}

describe("persistMonitoringRequest", () => {
  it("calls create_monitoring_request_v1 once with validated onboarding fields", async () => {
    const createRequest = vi.fn<(args: CreateMonitoringRequestV1Args) => Promise<MonitoringIntakeRpcResult>>(
      async () => rpcRow(),
    )
    const result = await persistMonitoringRequest(validInput, SUBMISSION_KEY, {
      createRequest,
      internalRecipient: "owner@example.com",
    })
    expect(createRequest).toHaveBeenCalledTimes(1)
    expect(createRequest.mock.calls[0]?.[0]).toMatchObject({
      p_submission_key: SUBMISSION_KEY,
      p_full_name: "Alex Morgan",
      p_email: "alex@example.com",
      p_phone: "+44 7700 900123",
      p_business_name: "Harbour Bakery",
      p_country: "United Kingdom",
      p_website_url: "https://harbourbakery.example",
      p_business_profile_url: "https://maps.google.com/?cid=123",
      p_number_of_locations: 1,
      p_terms_accepted: true,
      p_internal_recipient: "owner@example.com",
    })
    expect(createRequest.mock.calls[0]?.[0].p_intake_snapshot).toMatchObject({
      source: "start-monitoring",
      numberOfLocations: 1,
    })
    expect(result.monitoring_request_id).toBe("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")
    expect(result.status).toBe("REQUESTED")
    expect(result).not.toHaveProperty("public_ref")
    expect(result).not.toHaveProperty("case_id")
    expect(result).not.toHaveProperty("publicRef")
  })

  it("returns the canonical persisted row on retry", async () => {
    const createRequest = vi.fn<(args: CreateMonitoringRequestV1Args) => Promise<MonitoringIntakeRpcResult>>(
      async () => rpcRow({ was_existing: true, status: "REQUESTED" }),
    )
    const result = await persistMonitoringRequest(validInput, SUBMISSION_KEY, {
      createRequest,
      internalRecipient: "owner@example.com",
    })
    expect(result.was_existing).toBe(true)
    expect(createRequest).toHaveBeenCalledTimes(1)
  })
})

describe("monitoring intake module shape", () => {
  it("is server-only, uses one RPC, and does not send email or write tables itself", () => {
    expect(intakeSource.startsWith('import "server-only"')).toBe(true)
    expect(intakeSource).toContain('client.rpc("create_monitoring_request_v1"')
    expect(intakeSource).not.toMatch(/from\("customers"\)/)
    expect(intakeSource).not.toMatch(/from\("businesses"\)/)
    expect(intakeSource).not.toMatch(/from\("locations"\)/)
    expect(intakeSource).not.toMatch(/from\("cases"\)/)
    expect(intakeSource).not.toMatch(/from\("monitoring_requests"\)/)
    expect(intakeSource).not.toMatch(/from\("communications"\)/)
    expect(intakeSource).not.toMatch(/resend|createResendEnquiryProvider|send\(/i)
    expect(intakeSource).not.toMatch(/NEXT_PUBLIC_SUPABASE/)
    expect(intakeSource).not.toMatch(/public_ref|generate_case_public_ref|GR-26-/)
    expect(intakeSource).not.toMatch(/createBrowserClient|createClientComponentClient/)
  })
})
