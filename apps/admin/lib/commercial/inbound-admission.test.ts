import { describe, expect, it, vi } from "vitest"

import { signRetellSignature } from "../../../telloya/lib/voice/signature"
import { usageEventsEnabled } from "./usage-events-flag"
import {
  admitInboundCall,
  inboundBindPayload,
  inboundFailClosedProviderConfiguration,
  inboundLaunchBlockers,
  inboundMetadataPropagation,
  inboundReservationPayload,
  INBOUND_RETELL_REJECT,
  type InboundReservationPayload,
  type InboundReservationResult,
} from "./inbound-admission"
import { inboundAdmissionEnabled } from "./inbound-admission-flag"

const NOW_MS = Date.parse("2026-11-15T12:00:00.000Z")
const KEY = "synthetic_inbound_admission_key"
const ADMISSION = "adm_" + "a".repeat(32)
const AGENT = "agent_seat_a"

function raw(call: Record<string, unknown> = {}, event = "call_inbound"): string {
  return JSON.stringify({
    event,
    event_timestamp: NOW_MS,
    call_inbound: {
      from_number: "+447700900123",
      to_number: "+441111111111",
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
  reserve: (payload: InboundReservationPayload) => Promise<InboundReservationResult> = vi.fn(async (_payload: InboundReservationPayload) => {
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
    const reserve = vi.fn(async (_payload: InboundReservationPayload) => ({ status: "admitted", billable: true, agentRef: AGENT, admissionRef: ADMISSION }))
    const result = await admit(raw(), { enabledFlag: undefined, reserve })
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

  it("rejects an invalid signature and stores nothing", async () => {
    const body = raw({ transcript: "TRANSCRIPT_SENTINEL", recording_url: "https://recordings.example.invalid/a", access_token: "token_sentinel" })
    const reserve = vi.fn(async (_payload: InboundReservationPayload) => ({ status: "admitted", billable: true, agentRef: AGENT, admissionRef: ADMISSION }))
    expect(await admit(body, { signatureHeader: "v=1,d=abcd", reserve })).toMatchObject({
      body: INBOUND_RETELL_REJECT,
      outcome: "rejected_signature",
      persistedCallerContent: false,
    })
    expect(await admit(body, { signatureHeader: null, reserve })).toMatchObject({ outcome: "rejected_signature" })
    expect(reserve).not.toHaveBeenCalled()
    expect(JSON.stringify(await admit(body, { signatureHeader: null, reserve }))).not.toContain("TRANSCRIPT_SENTINEL")
  })

  it("accepts the documented inbound body without a call id and does not use the caller number as identity", () => {
    const first = raw({ agent_id: "agent_from_caller" })
    const second = raw({ from_number: "+447700900999", agent_id: "agent_from_caller" })
    const built = inboundReservationPayload({ environment: "dev", rawBody: first, nowMs: NOW_MS })
    const other = inboundReservationPayload({ environment: "dev", rawBody: second, nowMs: NOW_MS })
    if (!("payload" in built) || !("payload" in other)) throw new Error("payload")
    expect(built.payload.providerCallRef).toBeNull()
    expect(built.payload.toNumber).toBe("+441111111111")
    expect(built.payload.callScope).toBe("customer_phone")
    expect(JSON.stringify(built.payload)).not.toContain("+447700900123")
    expect(JSON.stringify(built.payload)).not.toContain("agent_from_caller")
    expect(built.payload.bodySha256).not.toBe(other.payload.bodySha256)
    expect(built.payload.providerCallRef).toBe(other.payload.providerCallRef)
  })

  it("keeps an optional call id when one is supplied and drops caller content and commercial preferences", () => {
    const body = raw({
      call_id: "call_preallocated_1",
      agent_version: 3,
      custom_sip_headers: { "x-my-header": "my-value" },
      transcript: "TRANSCRIPT_SENTINEL",
      recording_url: "https://recordings.example.invalid/a",
      access_token: "token_sentinel",
      included_minutes: 999,
      metadata: { subscription_id: "44444444-4444-4444-8444-444444444441", admission_id: ADMISSION },
    })
    const built = inboundReservationPayload({ environment: "dev", rawBody: body, nowMs: NOW_MS })
    if (!("payload" in built)) throw new Error("payload")
    expect(built.payload.providerCallRef).toBe("call_preallocated_1")
    expect(built.payload.quotedAdmissionRef).toBe(ADMISSION)
    expect(built.payload.assertedSubscriptionId).toBe("44444444-4444-4444-8444-444444444441")
    const encoded = JSON.stringify(built.payload)
    expect(encoded).not.toContain("TRANSCRIPT_SENTINEL")
    expect(encoded).not.toContain("recording")
    expect(encoded).not.toContain("token_sentinel")
    expect(encoded).not.toContain("included_minutes")
    expect(encoded).not.toContain("custom_sip_headers")
    expect(encoded).not.toContain("x-my-header")
  })

  it("rejects a malformed optional call id and an SMS inbound event", async () => {
    const reserve = vi.fn(async (_payload: InboundReservationPayload) => ({ status: "admitted", billable: true, agentRef: AGENT, admissionRef: ADMISSION }))
    expect((await admit(raw({ call_id: "bad id" }), { reserve })).outcome).toBe("rejected_payload")
    expect((await admit(JSON.stringify({ event: "chat_inbound", chat_inbound: { from_number: "+447700900123", to_number: "+441111111111" } }), { reserve })).outcome).toBe("rejected_payload")
    expect(reserve).not.toHaveBeenCalled()
  })

  it("returns the number owner's agent and the same admission reference on an identical retry", async () => {
    expect(inboundMetadataPropagation).toBe("UNVERIFIED")
    expect(inboundLaunchBlockers()).toContain("default_inbound_agent_fallback_unverified")
    expect(inboundLaunchBlockers()).toContain("inbound_metadata_propagation_not_live_verified")
    const reserve = vi.fn(async (_payload: InboundReservationPayload): Promise<InboundReservationResult> => ({
      status: "admitted",
      reason: "allow_included",
      billable: true,
      admissionRef: ADMISSION,
      agentRef: AGENT,
      reserveSeconds: 60,
    }))
    const first = await admit(raw(), { providerConfiguration: "VERIFIED", reserve })
    expect(first.body).toEqual({
      call_inbound: { override_agent_id: AGENT, metadata: { admission_id: ADMISSION } },
    })
    expect(first.launchBlocked).toBe(false)
    expect(inboundFailClosedProviderConfiguration).toBe("UNVERIFIED")
    reserve.mockResolvedValueOnce({
      status: "replay",
      decision: "admitted",
      reason: "allow_included",
      billable: true,
      admissionRef: ADMISSION,
      agentRef: AGENT,
    })
    const retry = await admit(raw(), { providerConfiguration: "VERIFIED", reserve })
    expect(retry).toMatchObject({
      outcome: "replay",
      admissionRef: ADMISSION,
      reservationBillable: true,
      body: first.body,
    })
    expect(JSON.stringify(retry.body)).not.toContain("agent_from_caller")
  })

  it("rejects a correctly signed call while the provider configuration is unverified", async () => {
    const reserve = vi.fn(async (_payload: InboundReservationPayload): Promise<InboundReservationResult> => ({
      status: "admitted",
      billable: true,
      admissionRef: ADMISSION,
      agentRef: AGENT,
    }))
    const result = await admit(raw(), { enabledFlag: "true", reserve })
    expect(result).toMatchObject({
      httpStatus: 200,
      body: INBOUND_RETELL_REJECT,
      outcome: "provider_fail_open_unverified",
      admissionRef: null,
      reservationBillable: false,
      launchBlocked: true,
      persistedCallerContent: false,
    })
    expect(result.body).not.toHaveProperty("call_inbound.override_agent_id")
    expect(JSON.stringify(result.body)).not.toContain(ADMISSION)
    expect(JSON.stringify(result.body)).not.toContain(AGENT)
    expect(reserve).not.toHaveBeenCalled()
    expect(await admit(raw(), { enabledFlag: "true", providerConfiguration: "UNVERIFIED", reserve })).toMatchObject({
      outcome: "provider_fail_open_unverified",
    })
    expect(reserve).not.toHaveBeenCalled()
  })

  it("does not authorise a closed replay, a conflict, or a response without an agent", async () => {
    const closed = vi.fn(async (_payload: InboundReservationPayload) => ({
      status: "replay",
      decision: "admitted",
      reason: "admission_closed",
      billable: false,
      admissionRef: ADMISSION,
    }))
    expect(await admit(raw(), { providerConfiguration: "VERIFIED", reserve: closed })).toMatchObject({ body: INBOUND_RETELL_REJECT, outcome: "replay", reservationBillable: false })
    const conflict = vi.fn(async (_payload: InboundReservationPayload) => ({ status: "conflict", billable: false, admissionRef: ADMISSION }))
    expect(await admit(raw({ from_number: "+447700900124" }), { providerConfiguration: "VERIFIED", reserve: conflict })).toMatchObject({ body: INBOUND_RETELL_REJECT, outcome: "conflict" })
    const missingAgent = vi.fn(async (_payload: InboundReservationPayload) => ({ status: "admitted", billable: true, admissionRef: ADMISSION }))
    expect(await admit(raw({ from_number: "+447700900125" }), { providerConfiguration: "VERIFIED", reserve: missingAgent })).toMatchObject({
      body: INBOUND_RETELL_REJECT,
      outcome: "provider_response_invalid",
      reservationBillable: false,
    })
  })

  it("returns the documented reject body when the simulated database denies or is unavailable", async () => {
    const denied = vi.fn(async (_payload: InboundReservationPayload) => ({ status: "denied", reason: "allowance_exhausted", billable: false }))
    expect(await admit(raw(), { providerConfiguration: "VERIFIED", reserve: denied })).toMatchObject({
      body: INBOUND_RETELL_REJECT,
      outcome: "denied",
      reason: "allowance_exhausted",
      reservationBillable: false,
    })
    const unavailable = vi.fn(async (_payload: InboundReservationPayload) => {
      throw new Error("connection terminated")
    })
    expect(await admit(raw({ from_number: "+447700900126" }), { providerConfiguration: "VERIFIED", reserve: unavailable })).toMatchObject({
      body: INBOUND_RETELL_REJECT,
      outcome: "database_unavailable",
      reservationBillable: false,
    })
  })

  it("builds a later correlation command from an echoed admission reference and drops caller content", () => {
    const body = JSON.stringify({
      event: "call_ended",
      call: {
        call_id: "call_later_1",
        call_type: "phone_call",
        to_number: "+441111111111",
        from_number: "+447700900123",
        transcript: "TRANSCRIPT_SENTINEL",
        recording_url: "https://recordings.example.invalid/a",
        metadata: { admission_id: ADMISSION, subscription_id: "44444444-4444-4444-8444-444444444441" },
      },
    })
    const built = inboundBindPayload({ environment: "dev", rawBody: body, nowMs: NOW_MS })
    if (!("payload" in built)) throw new Error("payload")
    expect(built.payload).toEqual({
      environment: "dev",
      providerCallRef: "call_later_1",
      toNumber: "+441111111111",
      admissionRef: ADMISSION,
      now: "2026-11-15T12:00:00.000Z",
    })
    expect(JSON.stringify(built.payload)).not.toContain("TRANSCRIPT_SENTINEL")
    expect(JSON.stringify(built.payload)).not.toContain("subscription_id")
    expect(inboundBindPayload({
      environment: "dev",
      rawBody: JSON.stringify({ event: "call_started", call: { to_number: "+441111111111" } }),
      nowMs: NOW_MS,
    })).toEqual({ error: "correlation_unverified" })
  })
})
