import { describe, expect, it } from "vitest"

import { signRetellSignature } from "../../../telloya/lib/voice/signature"
import { processUsageEvent, type NumberBinding } from "./usage-event"
import { usageEventsEnabled } from "./usage-events-flag"

const NOW_MS = 1762300000000
const KEY = "synthetic_usage_webhook_key"
const BINDING: NumberBinding = {
  environment: "dev",
  businessId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
  locationId: "22222222-2222-4222-8222-222222222222",
  subscriptionId: "99999999-9999-4999-8999-999999999999",
  inboundToNumber: "+447700900123",
}

function body(event: string, call: Record<string, unknown>): string {
  return JSON.stringify({ event, call })
}

function signed(rawBody: string, nowMs = NOW_MS) {
  return signRetellSignature(rawBody, KEY, String(nowMs))
}

function accept(rawBody: string, overrides: Partial<Parameters<typeof processUsageEvent>[0]> = {}) {
  return processUsageEvent({
    enabledFlag: "true",
    environment: "dev",
    apiKey: KEY,
    nowMs: NOW_MS,
    rawBody,
    signatureHeader: signed(rawBody),
    bindingForNumber: (number) => number === BINDING.inboundToNumber ? BINDING : null,
    ...overrides,
  })
}

describe("authenticated usage events", () => {
  it("stays closed unless the flag is exactly true", () => {
    expect(usageEventsEnabled(undefined)).toBe(false)
    expect(usageEventsEnabled("TRUE")).toBe(false)
    const raw = body("call_ended", { call_id: "call_usage_1", call_type: "phone_call", to_number: BINDING.inboundToNumber })
    expect(accept(raw, { enabledFlag: undefined })).toEqual({ status: 404, outcome: "closed" })
  })

  it("rejects an unverified signature before reading caller fields", () => {
    const raw = body("call_ended", {
      call_id: "call_usage_2",
      to_number: BINDING.inboundToNumber,
      transcript: "TRANSCRIPT_SENTINEL",
    })
    expect(accept(raw, { signatureHeader: "v=1,d=abcd" })).toEqual({ status: 401, outcome: "rejected_signature" })
    expect(accept(raw, { signatureHeader: null })).toEqual({ status: 401, outcome: "rejected_signature" })
  })

  it("binds a customer call from the allocated number and ignores a foreign subscription id", () => {
    const raw = body("call_ended", {
      call_id: "call_usage_3",
      call_type: "phone_call",
      to_number: BINDING.inboundToNumber,
      start_timestamp: NOW_MS - 90_000,
      end_timestamp: NOW_MS,
      metadata: { subscription_id: "11111111-1111-4111-8111-111111111111" },
      transcript: "TRANSCRIPT_SENTINEL",
      recording_url: "https://recordings.example.invalid/call",
      access_token: "token_sentinel",
    })
    expect(accept(raw)).toEqual({ status: 422, outcome: "cross_tenant" })
  })

  it("records provider duration once and drops audio, transcripts and tokens", () => {
    const raw = body("call_ended", {
      call_id: "call_usage_4",
      call_type: "phone_call",
      to_number: BINDING.inboundToNumber,
      start_timestamp: NOW_MS - 61_000,
      end_timestamp: NOW_MS,
      transcript: "TRANSCRIPT_SENTINEL",
      recording_url: "https://recordings.example.invalid/call",
      access_token: "token_sentinel",
    })
    const result = accept(raw, { priorEventTypes: ["call_started"] })
    expect(result.status).toBe(202)
    if (result.status !== 202) return
    expect(result.command.subscriptionId).toBe(BINDING.subscriptionId)
    expect(result.command.durationSeconds).toBe(61)
    expect(result.command.durationQuality).toBe("confirmed")
    expect(result.command.droppedContent).toEqual(["transcript", "recording", "access_token"])
    expect(JSON.stringify(result.command)).not.toContain("TRANSCRIPT_SENTINEL")
    expect(JSON.stringify(result.command)).not.toContain("recordings.example")
    expect(JSON.stringify(result.command)).not.toContain("token_sentinel")
    expect(accept(raw, { priorEventTypes: ["call_started"], seenBodySha256: new Set([result.command.bodySha256]) }).outcome).toBe("replay")
  })

  it("keeps a missing duration unconfirmed and accepts an ended event that arrives first", () => {
    const missing = body("call_ended", {
      call_id: "call_usage_5",
      call_type: "phone_call",
      to_number: BINDING.inboundToNumber,
    })
    const missingResult = accept(missing, { priorEventTypes: ["call_started"] })
    expect(missingResult.status).toBe(202)
    if (missingResult.status !== 202) return
    expect(missingResult.command.durationQuality).toBe("missing")
    expect(missingResult.command.durationSeconds).toBeNull()
    const early = body("call_ended", {
      call_id: "call_usage_6",
      call_type: "phone_call",
      to_number: BINDING.inboundToNumber,
      start_timestamp: NOW_MS - 30_000,
      end_timestamp: NOW_MS,
    })
    expect(accept(early).outcome).toBe("out_of_order")
  })

  it("keeps an analysis summary on the allowlist and does not treat it as duration", () => {
    const raw = body("call_analyzed", {
      call_id: "call_usage_7",
      call_type: "phone_call",
      to_number: BINDING.inboundToNumber,
      transcript: "TRANSCRIPT_SENTINEL",
      call_analysis: { custom_analysis_data: { caller_name: "Ada", summary: "Leaking tap", transcript: "hidden" } },
    })
    const result = accept(raw, { priorEventTypes: ["call_started", "call_ended"] })
    expect(result.status).toBe(202)
    if (result.status !== 202) return
    expect(result.command.durationQuality).toBe("missing")
    expect(result.command.summary).toEqual({
      callerName: "Ada",
      callbackNumber: null,
      serviceRequested: null,
      callbackWindow: null,
      summary: "Leaking tap",
    })
    expect(JSON.stringify(result.command)).not.toContain("TRANSCRIPT_SENTINEL")
  })

  it("excludes an Admin web call from the customer subscription", () => {
    const raw = body("call_ended", {
      call_id: "call_usage_8",
      call_type: "web_call",
      start_timestamp: NOW_MS - 10_000,
      end_timestamp: NOW_MS,
      metadata: { subscription_id: BINDING.subscriptionId },
    })
    const result = accept(raw, { priorEventTypes: ["call_started"] })
    expect(result.status).toBe(202)
    if (result.status !== 202) return
    expect(result.command.scope).toBe("admin_web_qa")
    expect(result.command.subscriptionId).toBeNull()
  })

  it("rejects a customer number that is not allocated in this environment", () => {
    const raw = body("call_ended", { call_id: "call_usage_9", call_type: "phone_call", to_number: "+447700900999" })
    expect(accept(raw).outcome).toBe("unbound_number")
  })
})
