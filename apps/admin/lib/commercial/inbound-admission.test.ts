import { describe, expect, it, vi } from "vitest"

import { signRetellSignature } from "../../../telloya/lib/voice/signature"
import { usageEventsEnabled } from "./usage-events-flag"
import {
  admitInboundCall,
  inboundFailClosedProviderConfiguration,
  inboundLaunchBlockers,
  inboundReservationPayload,
  INBOUND_RETELL_REJECT,
  type InboundReservationPayload,
  type InboundReservationResult,
} from "./inbound-admission"
import { inboundAdmissionEnabled } from "./inbound-admission-flag"

const NOW_MS = Date.parse("2026-11-15T12:00:00.000Z")
const KEY = "synthetic_inbound_admission_key"

function raw(call: Record<string, unknown>): string {
  return JSON.stringify({
    event: "call_inbound",
    call_inbound: {
      call_id: "call_inbound_1",
      call_type: "phone_call",
      to_number: "+441111111111",
      from_number: "+447700900123",
      ...call,
    },
  })
}

function signed(body: string, nowMs = NOW_MS) {
  return signRetellSignature(body, KEY, String(nowMs))
}

function admit(
  body: string,
  overrides: Partial<Parameters<typeof admitInboundCall>[0]> = {},
  reserve: (payload: InboundReservationPayload) => Promise<InboundReservationResult> = vi.fn(async () => {
    throw new Error("reserve should not be called")
  }),
) {
  return admitInboundCall({
    enabledFlag: "true",
    environment: "dev",
    apiKey: KEY,
    nowMs: NOW_MS,
    rawBody: body,
    signatureHeader: signed(body),
    reserve,
    ...overrides,
  })
}

describe("inbound call admission", () => {
  it("stays closed unless the admission flag is exactly true", async () => {
    expect(inboundAdmissionEnabled(undefined)).toBe(false)
    expect(inboundAdmissionEnabled("TRUE")).toBe(false)
    expect(usageEventsEnabled(undefined)).toBe(false)
    const reserve = vi.fn(async () => ({ status: "admitted", billable: true }))
    const result = await admit(raw({}), { enabledFlag: undefined, reserve })
    expect(result).toMatchObject({
      httpStatus: 200,
      body: INBOUND_RETELL_REJECT,
      outcome: "admission_disabled",
      reservationBillable: false,
      launchBlocked: true,
      persistedCallerContent: false,
    })
    expect(reserve).not.toHaveBeenCalled()
  })

  it("rejects an invalid signature with the provider reject body and stores nothing", async () => {
    const body = raw({ transcript: "TRANSCRIPT_SENTINEL", recording_url: "https://recordings.example.invalid/a", access_token: "token_sentinel" })
    const reserve = vi.fn(async () => ({ status: "admitted", billable: true }))
    expect(await admit(body, { signatureHeader: "v=1,d=abcd", reserve })).toMatchObject({
      body: INBOUND_RETELL_REJECT,
      outcome: "rejected_signature",
      persistedCallerContent: false,
    })
    expect(await admit(body, { signatureHeader: null, reserve })).toMatchObject({ outcome: "rejected_signature" })
    expect(reserve).not.toHaveBeenCalled()
    expect(JSON.stringify(await admit(body, { signatureHeader: null, reserve }))).not.toContain("TRANSCRIPT_SENTINEL")
  })

  it("rejects a missing or malformed call reference before reservation", async () => {
    const reserve = vi.fn(async () => ({ status: "admitted", billable: true }))
    expect((await admit("{", { reserve })).outcome).toBe("rejected_payload")
    expect((await admit(raw({ call_id: "" }), { reserve })).outcome).toBe("rejected_payload")
    expect((await admit(raw({ call_id: "bad id" }), { reserve })).outcome).toBe("rejected_payload")
    expect(reserve).not.toHaveBeenCalled()
  })

  it("keeps webhook commercial preferences and caller content out of the reservation command", () => {
    const body = raw({
      transcript: "TRANSCRIPT_SENTINEL",
      recording_url: "https://recordings.example.invalid/a",
      access_token: "token_sentinel",
      included_minutes: 999,
      overage_opt_in: true,
      overage_cap_minor: 1,
      metadata: { subscription_id: "44444444-4444-4444-8444-444444444441" },
    })
    const built = inboundReservationPayload({ environment: "dev", rawBody: body, nowMs: NOW_MS })
    expect("payload" in built).toBe(true)
    if (!("payload" in built)) return
    expect(built.payload.callScope).toBe("customer_phone")
    expect(built.payload.subscriptionId).toBe("44444444-4444-4444-8444-444444444441")
    const encoded = JSON.stringify(built.payload)
    expect(encoded).not.toContain("TRANSCRIPT_SENTINEL")
    expect(encoded).not.toContain("recording_url")
    expect(encoded).not.toContain("token_sentinel")
    expect(encoded).not.toContain("includedMinutes")
    expect(encoded).not.toContain("overageOptIn")
    expect(encoded).not.toContain("overageCapMinor")
    expect(Object.keys(built.payload).sort()).toEqual([
      "bodySha256",
      "businessId",
      "callScope",
      "environment",
      "locationId",
      "now",
      "providerCallRef",
      "subscriptionId",
      "toNumber",
    ])
  })

  it("classifies an admin web call as non-billable before a customer reservation", () => {
    const body = raw({ call_type: "web_call", to_number: "+441111111111" })
    const built = inboundReservationPayload({ environment: "dev", rawBody: body, nowMs: NOW_MS })
    if (!("payload" in built)) throw new Error("payload")
    expect(built.payload.callScope).toBe("admin_web_qa")
    expect(built.payload.toNumber).toBeNull()
  })

  it("rejects while the provider fail-closed configuration is unverified, without reserving", async () => {
    expect(inboundFailClosedProviderConfiguration).toBe("UNVERIFIED")
    expect(inboundLaunchBlockers()).toContain("default_inbound_agent_fallback_unverified")
    expect(inboundLaunchBlockers()).toContain("in_progress_provider_stop_not_proved")
    const reserve = vi.fn(async () => ({ status: "admitted", billable: true, reason: "allow_included" }))
    const result = await admit(raw({}), { reserve })
    expect(result).toMatchObject({
      body: INBOUND_RETELL_REJECT,
      outcome: "provider_fail_open_unverified",
      reservationBillable: false,
      launchBlocked: true,
    })
    expect(reserve).not.toHaveBeenCalled()
  })

  it("returns the documented reject body when the simulated database denies or is unavailable", async () => {
    const denied = vi.fn(async () => ({ status: "denied", reason: "allowance_exhausted", billable: false }))
    expect(await admit(raw({}), { providerConfiguration: "VERIFIED", reserve: denied })).toMatchObject({
      body: INBOUND_RETELL_REJECT,
      outcome: "denied",
      reason: "allowance_exhausted",
      reservationBillable: false,
    })
    const unavailable = vi.fn(async () => {
      throw new Error("connection terminated")
    })
    expect(await admit(raw({ call_id: "call_inbound_db" }), { providerConfiguration: "VERIFIED", reserve: unavailable })).toMatchObject({
      body: INBOUND_RETELL_REJECT,
      outcome: "database_unavailable",
      reservationBillable: false,
    })
  })

  it("maps a verified simulated admission to an empty inbound response", async () => {
    const reserve = vi.fn(async () => ({ status: "admitted", reason: "allow_included", billable: true, reserveSeconds: 60 }))
    const result = await admit(raw({}), { providerConfiguration: "VERIFIED", reserve })
    expect(result).toMatchObject({
      httpStatus: 200,
      body: { call_inbound: {} },
      outcome: "admitted",
      reservationBillable: true,
      launchBlocked: false,
      persistedCallerContent: false,
    })
    expect(result.body).not.toHaveProperty("call_inbound.reject")
    expect(reserve).toHaveBeenCalledOnce()
  })
})
