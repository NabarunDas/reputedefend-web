import { createHash } from "node:crypto"
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

import { acceptVoiceWebhook, hashRawBody, isVoiceWebhookEnabled, listLeads, markNotificationFailed, runFallback, settleNotification } from "./accept"
import { ACCEPTANCE_SCENARIOS, scenarioMark } from "./coverage"
import { RETELL_SIGNATURE_WINDOW_MS, signRetellSignature, signatureHeaderName, verifyRetellSignature } from "./signature"
import { resolveTenant } from "./tenant"
import type { NumberMapRow, VoiceState } from "./types"
import { MINIMAL_LEAD_FIELDS } from "./types"
import { projectRetellEvent } from "./validate"
import { reconcileUsage } from "./usage"

const DEV_KEY = "synthetic_webhook_key_lane_dev"
const PROD_KEY = "synthetic_webhook_key_lane_prod"
const STANDALONE_SECRET = "standalone_signing_secret"
const NOW_MS = 1762300000000
const NOW_ISO = "2026-11-04T23:46:40.000Z"
const BUSINESS_A = "11111111-1111-4111-8111-111111111111"
const LOCATION_A = "22222222-2222-4222-8222-222222222222"
const BUSINESS_B = "33333333-3333-4333-8333-333333333333"
const LOCATION_B = "44444444-4444-4444-8444-444444444444"
const NUMBER_A = "+440000000010"
const NUMBER_B = "+440000000020"
const NETWORK_CLI = "+440000000001"
const CALLBACK = "+440000000099"
const TRANSCRIPT = "TRANSCRIPT_SENTINEL_not_a_real_call"
const RECORDING = "https://recordings.example.invalid/call_test_001"
const KNOWN_BODY = '{"event":"call_started","call":{"call_id":"call_test_001"}}'
const KNOWN_DIGEST = "15b6656660fe26b055ceb076e7e8658ec361bd39a085098223ed5527b94504ee"

const maps: NumberMapRow[] = [
  { inboundToNumber: NUMBER_A, agentId: "agent_test_a", businessId: BUSINESS_A, locationId: LOCATION_A, environment: "dev", active: true },
  { inboundToNumber: NUMBER_B, agentId: "agent_test_b", businessId: BUSINESS_B, locationId: LOCATION_B, environment: "dev", active: true },
  { inboundToNumber: NUMBER_A, agentId: "agent_test_a", businessId: BUSINESS_A, locationId: LOCATION_A, environment: "production", active: true },
]

function callBody(event: string, call: Record<string, unknown>): string {
  return JSON.stringify({ event, call })
}

function baseCall(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    call_type: "phone_call",
    call_id: "call_test_001",
    agent_id: "agent_test_a",
    call_status: "ended",
    from_number: NETWORK_CLI,
    to_number: NUMBER_A,
    direction: "inbound",
    disconnection_reason: "user_hangup",
    metadata: { business_id: BUSINESS_B, location_id: LOCATION_B },
    retell_llm_dynamic_variables: { tenant: BUSINESS_B },
    transcript: TRANSCRIPT,
    transcript_object: [{ role: "agent", content: TRANSCRIPT }],
    recording_url: RECORDING,
    data_storage_setting: "everything",
    ...overrides,
  }
}

function collected(overrides: Record<string, unknown> = {}) {
  return {
    caller_name: "Ada Test",
    callback_number: CALLBACK,
    service_requested: "Leaking tap",
    job_location: "Test Street",
    callback_window: "Weekday morning",
    ...overrides,
  }
}

function analyzedBody(callId = "call_test_001", analysisOverrides: Record<string, unknown> = {}, callOverrides: Record<string, unknown> = {}) {
  return callBody("call_analyzed", baseCall({
    call_id: callId,
    call_analysis: {
      call_summary: TRANSCRIPT,
      custom_analysis_data: collected(analysisOverrides),
    },
    ...callOverrides,
  }))
}

type DeliverOptions = {
  state?: VoiceState
  apiKey?: string
  verifyKey?: string
  timestampMs?: number
  nowMs?: number
  signature?: string | null
  enabledFlag?: string
  environment?: "dev" | "production"
  mapRows?: NumberMapRow[]
  deps?: Parameters<typeof acceptVoiceWebhook>[0]["deps"]
}

function deliver(rawBody: string, options: DeliverOptions = {}) {
  const apiKey = options.apiKey ?? DEV_KEY
  const timestamp = String(options.timestampMs ?? NOW_MS)
  const signature = options.signature === undefined ? signRetellSignature(rawBody, apiKey, timestamp) : options.signature
  return acceptVoiceWebhook({
    state: options.state,
    enabledFlag: "enabledFlag" in options ? options.enabledFlag : "true",
    environment: options.environment ?? "dev",
    apiKey: options.verifyKey ?? apiKey,
    nowMs: options.nowMs ?? NOW_MS,
    nowIso: NOW_ISO,
    rawBody,
    signatureHeader: signature,
    maps: options.mapRows ?? maps,
    deps: options.deps,
  })
}

function assertNoSensitive(value: unknown) {
  const text = JSON.stringify(value)
  expect(text).not.toContain(TRANSCRIPT)
  expect(text).not.toContain(RECORDING)
  expect(text).not.toContain(NETWORK_CLI)
  expect(text).not.toContain("from_number")
  expect(text).not.toContain("recording_url")
  expect(text).not.toContain("transcript")
}

function onlyLead(state: VoiceState) {
  expect(state.calls).toHaveLength(1)
  return state.calls[0].record
}

describe("Retell signature", () => {
  it("matches the published HMAC vector for x-retell-signature", () => {
    expect(signatureHeaderName()).toBe("x-retell-signature")
    const header = `v=${NOW_MS},d=${KNOWN_DIGEST}`
    expect(signRetellSignature(KNOWN_BODY, DEV_KEY, String(NOW_MS))).toBe(header)
    expect(verifyRetellSignature({ rawBody: KNOWN_BODY, apiKey: DEV_KEY, signature: header, nowMs: NOW_MS })).toBe(true)
    expect(verifyRetellSignature({ rawBody: KNOWN_BODY, apiKey: STANDALONE_SECRET, signature: header, nowMs: NOW_MS })).toBe(false)
    expect(verifyRetellSignature({ rawBody: KNOWN_BODY, apiKey: "", signature: header, nowMs: NOW_MS })).toBe(false)
  })

  it("rejects a re-serialised body, a stale timestamp, and a malformed header", () => {
    const spaced = '{ "event": "call_started", "call": { "call_id": "call_test_001" } }'
    const header = signRetellSignature(spaced, DEV_KEY, String(NOW_MS))
    expect(verifyRetellSignature({ rawBody: spaced, apiKey: DEV_KEY, signature: header, nowMs: NOW_MS })).toBe(true)
    expect(verifyRetellSignature({
      rawBody: JSON.stringify(JSON.parse(spaced)),
      apiKey: DEV_KEY,
      signature: header,
      nowMs: NOW_MS,
    })).toBe(false)
    expect(verifyRetellSignature({
      rawBody: KNOWN_BODY,
      apiKey: DEV_KEY,
      signature: signRetellSignature(KNOWN_BODY, DEV_KEY, String(NOW_MS - RETELL_SIGNATURE_WINDOW_MS)),
      nowMs: NOW_MS,
    })).toBe(true)
    expect(verifyRetellSignature({
      rawBody: KNOWN_BODY,
      apiKey: DEV_KEY,
      signature: signRetellSignature(KNOWN_BODY, DEV_KEY, String(NOW_MS - RETELL_SIGNATURE_WINDOW_MS - 1)),
      nowMs: NOW_MS,
    })).toBe(false)
    expect(verifyRetellSignature({ rawBody: KNOWN_BODY, apiKey: DEV_KEY, signature: null, nowMs: NOW_MS })).toBe(false)
    expect(verifyRetellSignature({ rawBody: KNOWN_BODY, apiKey: DEV_KEY, signature: "v=1,d=abcd", nowMs: NOW_MS })).toBe(false)
    expect(verifyRetellSignature({
      rawBody: KNOWN_BODY,
      apiKey: DEV_KEY,
      signature: `v=${NOW_MS},d=${KNOWN_DIGEST.toUpperCase()}`,
      nowMs: NOW_MS,
    })).toBe(false)
  })
})

describe("acceptance scenarios", () => {
  it("marks provider-dependent scenarios NOT EXECUTED", () => {
    expect(ACCEPTANCE_SCENARIOS.map((item) => item.id)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20])
    for (const id of [1, 8, 10, 11]) {
      expect(scenarioMark(id).status).toBe("not_executed")
      expect(scenarioMark(id).detail).toContain("NOT EXECUTED")
    }
  })

  it("scenario 2 creates one completed lead and drops the transcript", () => {
    const result = deliver(analyzedBody())
    expect(result.status).toBe(204)
    expect(result.body).toBe("")
    const record = onlyLead(result.state)
    expect(record.finalised).toBe(true)
    expect(record.notification).toBeNull()
    expect(record.lead.callStatus).toBe("completed")
    expect(record.lead.incomplete).toBe(false)
    expect(record.lead.summary.length).toBeLessThanOrEqual(600)
    expect(record.lead.callerName).toBe("Ada Test")
    expect(Object.keys(record.lead).sort()).toEqual([...MINIMAL_LEAD_FIELDS].sort())
    expect(record.lead.tenantBusinessId).toBe(BUSINESS_A)
    expect(JSON.stringify(result.state)).not.toContain(BUSINESS_B)
    assertNoSensitive(result.state)
    assertNoSensitive(result.log)
    const settled = settleNotification(result.state, "dev", "call_test_001")
    expect(settled.calls[0].record.notification?.idempotencyKey).toBe(`${settled.calls[0].record.notification?.leadId}-business`)
  })

  it("scenario 3 stores the caller-supplied callback number only", () => {
    const result = deliver(analyzedBody("call_test_003", { callback_number: "+44 0000 000099" }))
    expect(onlyLead(result.state).lead.callbackNumber).toBe(CALLBACK)
    assertNoSensitive(result.state)
  })

  it("scenario 4 records a preference without promising the time", () => {
    const result = deliver(analyzedBody("call_test_004", { callback_window: "Sunday 7pm" }, { opening_hours: "Monday to Friday" }))
    const summary = onlyLead(result.state).lead.summary
    expect(summary).toContain("Callback preference: Sunday 7pm")
    expect(summary.toLowerCase()).not.toContain("booked")
    expect(summary.toLowerCase()).not.toContain("promised")
    expect(summary.toLowerCase()).not.toContain("confirmed")
  })

  it("scenario 5 keeps an early hang-up incomplete", () => {
    const raw = callBody("call_analyzed", baseCall({
      call_id: "call_test_005",
      call_analysis: { call_summary: TRANSCRIPT, custom_analysis_data: { caller_name: "Ada Test" } },
    }))
    const result = deliver(raw)
    const lead = onlyLead(result.state).lead
    expect(lead.incomplete).toBe(true)
    expect(lead.callStatus).toBe("incomplete")
    expect(lead.callbackNumber).toBeNull()
    expect(lead.summary).not.toContain("+")
    assertNoSensitive(result.state)
  })

  it("scenario 6 acknowledges a duplicate call_ended without a second lead or a notification", () => {
    const raw = callBody("call_ended", baseCall({ call_id: "call_test_006" }))
    const first = deliver(raw)
    const second = deliver(raw, { state: first.state })
    expect(second.status).toBe(204)
    expect(second.log.outcome).toBe("duplicate")
    expect(second.state.receipts).toHaveLength(1)
    expect(second.state.calls).toHaveLength(1)
    expect(second.state.calls[0].record.finalised).toBe(false)
    expect(second.state.calls[0].record.notification).toBeNull()
    const settled = settleNotification(second.state, "dev", "call_test_006")
    expect(settled.calls[0].record.notification).toBeNull()
    assertNoSensitive(second.state)
  })

  it("scenario 7 rejects invalid signatures before extraction or tenant mapping", () => {
    const raw = analyzedBody("call_test_007", { caller_name: "NAME_SENTINEL" })
    const deps = {
      project: () => {
        throw new Error("parsed before signature")
      },
      resolveTenant: () => {
        throw new Error("mapped before signature")
      },
    }
    const cases = [
      deliver(raw, { verifyKey: PROD_KEY, deps }),
      deliver(raw, { apiKey: STANDALONE_SECRET, verifyKey: DEV_KEY, deps }),
      deliver(raw, { signature: null, deps }),
      deliver(raw, { signature: "v=nope,d=00", deps }),
      deliver(raw, { timestampMs: NOW_MS - RETELL_SIGNATURE_WINDOW_MS - 1, deps }),
    ]
    for (const result of cases) {
      expect(result.status).toBe(401)
      expect(result.body).toBe("")
      expect(result.state.calls).toHaveLength(0)
      expect(result.log.outcome).toBe("rejected_signature")
      expect(JSON.stringify(result.log)).not.toContain("NAME_SENTINEL")
      expect(JSON.stringify(result.log)).not.toContain(TRANSCRIPT)
      expect(JSON.stringify(result.log)).not.toContain(RECORDING)
      expect(JSON.stringify(result.log)).not.toContain(CALLBACK)
    }
    expect(isVoiceWebhookEnabled(undefined)).toBe(false)
    expect(isVoiceWebhookEnabled("TRUE")).toBe(false)
    const closed = deliver(raw, {
      enabledFlag: undefined,
      deps: { verify: () => { throw new Error("verified while closed") } },
    })
    expect(closed.status).toBe(404)
    expect(closed.body).toBe("")
    expect(closed.state.calls).toHaveLength(0)
  })

  it("scenario 8 mocks a delivered failure and silence, and does not claim a live outage", () => {
    expect(scenarioMark(8).status).toBe("not_executed")
    const failed = deliver(callBody("call_ended", baseCall({ call_id: "call_test_008", call_status: "error" })))
    expect(onlyLead(failed.state).lead.callStatus).toBe("failed")
    expect(onlyLead(failed.state).notification).toBeNull()
    const finalised = runFallback(failed.state, "dev", "call_test_008")
    expect(finalised.calls).toHaveLength(1)
    expect(finalised.calls[0].record.notification?.status).toBe("pending")
    const silent = runFallback({ receipts: [], calls: [] }, "dev", "call_test_008")
    expect(silent.calls).toHaveLength(0)
    const erroredAnalysis = deliver(analyzedBody("call_test_008b", {}, { call_status: "error" }))
    expect(onlyLead(erroredAnalysis.state).lead.callStatus).toBe("failed")
    expect(onlyLead(erroredAnalysis.state).lead.callStatus).not.toBe("completed")
  })

  it("scenario 9 keeps one lead and one key when notification is marked failed", () => {
    const raw = analyzedBody("call_test_009")
    const accepted = deliver(raw)
    expect(accepted.state.calls[0].record.notification).toBeNull()
    const pending = settleNotification(accepted.state, "dev", "call_test_009")
    const failed = markNotificationFailed(pending, "dev", "call_test_009")
    const again = markNotificationFailed(deliver(raw, { state: failed }).state, "dev", "call_test_009")
    expect(again.calls).toHaveLength(1)
    expect(again.calls[0].record.lead.callStatus).toBe("completed")
    expect(again.calls[0].record.notification).toEqual(failed.calls[0].record.notification)
    expect(again.calls[0].record.notification?.status).toBe("failed")
    expect(again.calls[0].record.notification?.idempotencyKey.endsWith("-business")).toBe(true)
  })

  it("scenario 12 isolates tenants and rejects missing or conflicting maps", () => {
    const first = deliver(analyzedBody("call_test_012a"))
    const second = deliver(analyzedBody("call_test_012b", {}, { to_number: NUMBER_B, agent_id: "agent_test_b" }), { state: first.state })
    expect(listLeads(second.state, "dev", BUSINESS_A).map((lead) => lead.providerCallRef)).toEqual(["call_test_012a"])
    expect(listLeads(second.state, "dev", BUSINESS_B).map((lead) => lead.providerCallRef)).toEqual(["call_test_012b"])
    expect(listLeads(second.state, "production", BUSINESS_A)).toEqual([])

    const unknown = deliver(analyzedBody("call_test_012c", {}, { to_number: "+440000000030" }))
    expect(unknown.status).toBe(204)
    expect(unknown.state.calls).toHaveLength(0)
    expect(unknown.log.outcome).toBe("unknown_tenant")
    expect(JSON.stringify(unknown.log)).not.toContain("+440000000030")

    const mismatched = deliver(analyzedBody("call_test_012d", {}, { agent_id: "agent_test_b" }))
    expect(mismatched.state.calls).toHaveLength(0)
    const ambiguous = deliver(analyzedBody("call_test_012e"), {
      mapRows: [
        maps[0],
        { ...maps[0], locationId: LOCATION_B, businessId: BUSINESS_B },
      ],
    })
    expect(ambiguous.state.calls).toHaveLength(0)
    const crossed = deliver(analyzedBody("call_test_012f"), { environment: "production", apiKey: PROD_KEY, verifyKey: DEV_KEY })
    expect(crossed.status).toBe(401)
    const production = deliver(analyzedBody("call_test_012g"), { environment: "production", apiKey: PROD_KEY })
    expect(onlyLead(production.state).lead.tenantBusinessId).toBe(BUSINESS_A)
    const devKeyOnProdMapOnly = resolveTenant({
      maps: [maps[2]],
      environment: "dev",
      toNumber: NUMBER_A,
      agentId: "agent_test_a",
    })
    expect(devKeyOnProdMapOnly.ok).toBe(false)
  })

  it("scenario 13 applies call_analyzed after call_ended without a hash conflict", () => {
    const ended = callBody("call_ended", baseCall({ call_id: "call_test_013" }))
    const analyzed = analyzedBody("call_test_013")
    expect(hashRawBody(ended)).not.toBe(hashRawBody(analyzed))
    const first = deliver(ended)
    expect(onlyLead(first.state).lead.callStatus).not.toBe("completed")
    expect(onlyLead(first.state).finalised).toBe(false)
    const second = deliver(analyzed, { state: first.state })
    expect(second.state.calls).toHaveLength(1)
    expect(second.state.receipts).toHaveLength(2)
    expect(second.state.receipts.every((receipt) => receipt.conflicts.length === 0)).toBe(true)
    expect(onlyLead(second.state).lead.callStatus).toBe("completed")
    expect(onlyLead(second.state).finalised).toBe(true)
    assertNoSensitive(second.state)
    assertNoSensitive(second.log)
  })

  it("scenario 14 does not let a later call_ended downgrade analysis", () => {
    const analyzed = analyzedBody("call_test_014", {}, { start_timestamp: undefined, end_timestamp: undefined })
    const ended = callBody("call_ended", baseCall({
      call_id: "call_test_014",
      start_timestamp: NOW_MS - 20_000,
      end_timestamp: NOW_MS,
    }))
    const first = settleNotification(deliver(analyzed).state, "dev", "call_test_014")
    const summary = onlyLead(first).lead.summary
    const second = deliver(ended, { state: first })
    const record = onlyLead(second.state)
    expect(record.lead.summary).toBe(summary)
    expect(record.lead.callStatus).toBe("completed")
    expect(record.durationSeconds).toBe(20)
    expect(record.notification?.idempotencyKey).toBe(first.calls[0].record.notification?.idempotencyKey)
    expect(second.state.calls).toHaveLength(1)

    const withDuration = deliver(analyzedBody("call_test_014b", {}, {
      start_timestamp: NOW_MS - 20_000,
      end_timestamp: NOW_MS,
    }))
    const overwritten = deliver(callBody("call_ended", baseCall({
      call_id: "call_test_014b",
      start_timestamp: NOW_MS - 50_000,
      end_timestamp: NOW_MS,
    })), { state: withDuration.state })
    expect(onlyLead(overwritten.state).durationSeconds).toBe(20)
    expect(onlyLead(overwritten.state).lead.summary).toBe(onlyLead(withDuration.state).lead.summary)
  })

  it("scenario 15 keeps one notification for a duplicate call_analyzed", () => {
    const raw = analyzedBody("call_test_015")
    const first = settleNotification(deliver(raw).state, "dev", "call_test_015")
    const second = deliver(raw, { state: first })
    const settled = settleNotification(second.state, "dev", "call_test_015")
    expect(second.status).toBe(204)
    expect(second.log.outcome).toBe("duplicate")
    expect(settled.calls).toHaveLength(1)
    expect(settled.receipts).toHaveLength(1)
    expect(settled.calls[0].record.notification?.idempotencyKey).toBe(first.calls[0].record.notification?.idempotencyKey)
  })

  it("scenario 16 does not overwrite a conflicting call_analyzed", () => {
    const firstBody = analyzedBody("call_test_016", { caller_name: "Ada Test" })
    const secondBody = analyzedBody("call_test_016", { caller_name: "Other Name" })
    const first = deliver(firstBody)
    const second = deliver(secondBody, { state: first.state })
    expect(second.status).toBe(204)
    expect(second.log.outcome).toBe("conflict")
    expect(second.state.calls).toHaveLength(1)
    expect(second.state.receipts).toHaveLength(1)
    expect(second.state.receipts[0].conflicts).toEqual([hashRawBody(secondBody)])
    expect(onlyLead(second.state).lead.callerName).toBe("Ada Test")
    expect(onlyLead(second.state).lead.summary).toBe(onlyLead(first.state).lead.summary)
  })

  it("scenario 17 finalises a partial call only when fallback is invoked", () => {
    const ended = deliver(callBody("call_ended", baseCall({ call_id: "call_test_017", disconnection_reason: "user_hangup" })))
    expect(onlyLead(ended.state).finalised).toBe(false)
    expect(onlyLead(ended.state).notification).toBeNull()
    const finalised = runFallback(ended.state, "dev", "call_test_017")
    expect(onlyLead(finalised).lead.callStatus).toBe("incomplete")
    expect(onlyLead(finalised).lead.incomplete).toBe(true)
    expect(onlyLead(finalised).lead.callbackNumber).toBeNull()
    expect(onlyLead(finalised).notification?.status).toBe("pending")
    const again = runFallback(finalised, "dev", "call_test_017")
    expect(again.calls[0].record.notification).toEqual(finalised.calls[0].record.notification)
    const late = deliver(analyzedBody("call_test_017"), { state: again })
    const settled = settleNotification(late.state, "dev", "call_test_017")
    expect(settled.calls).toHaveLength(1)
    expect(onlyLead(settled).lead.callStatus).toBe("completed")
    expect(onlyLead(settled).notification?.idempotencyKey).toBe(finalised.calls[0].record.notification?.idempotencyKey)
  })

  it("scenario 18 stores a hash and allowlisted fields, not the sensitive body", () => {
    const raw = callBody("call_ended", baseCall({ call_id: "call_test_018" }))
    const result = deliver(raw)
    expect(result.state.receipts[0].rawBodyHash).toBe(createHash("sha256").update(raw, "utf8").digest("hex"))
    expect(JSON.stringify(result.state.receipts[0])).not.toContain(raw)
    assertNoSensitive(result.state)
    assertNoSensitive(result.log)
    expect(projectRetellEvent(raw).ok).toBe(true)
  })

  it("scenario 19 refuses charges for unknown usage, concurrency, and enquiry preferences", () => {
    const decision = reconcileUsage({
      leadCallIds: ["call_test_019a", "call_test_019b"],
      providerExport: [
        { callId: "call_test_019a", durationSeconds: 90, product: "telloya" },
        { callId: "call_test_019b", durationSeconds: null, product: "telloya" },
      ],
      entitlement: { status: "unreadable" },
      inProgressCallIds: ["call_test_019a", "call_test_019b"],
    })
    expect(decision.authorised).toBe(false)
    expect(decision.overageActive).toBe(false)
    expect(decision.hardCapGuaranteed).toBe(false)
    expect(decision.unknownTreatedAsZero).toBe(false)
    expect(decision.stoppedCall).toBe(false)
    expect(decision.knownTelloyaSeconds).toBeNull()
    expect(decision.unknownCallIds).toEqual(["call_test_019b"])
    expect(decision.unresolvedCallIds).toEqual(["call_test_019a", "call_test_019b"])
    expect(decision.reasons).toContain("missing_entitlement")
    expect(decision.reasons).toContain("unknown_usage")
    expect(decision.exceptions.every((item) => item.recordedAsZero === false && item.billedSeconds === null)).toBe(true)

    const enquiry = reconcileUsage({
      leadCallIds: ["call_test_019c"],
      providerExport: [{ callId: "call_test_019c", durationSeconds: 60, product: "telloya" }],
      entitlement: {
        status: "readable",
        includedMinutes: 120,
        overageOptIn: true,
        monthlyCapGbp: 75,
        authorisationSource: "enquiry_preference",
      },
    })
    expect(enquiry.authorised).toBe(false)
    expect(enquiry.reasons).toContain("enquiry_preference")
    expect(enquiry.overageActive).toBe(false)

    const offer = reconcileUsage({
      leadCallIds: ["call_test_019d"],
      providerExport: [
        { callId: "call_test_019d", durationSeconds: 60, product: "telloya" },
        { callId: "guard_test_001", durationSeconds: 999, product: "guard" },
      ],
      entitlement: {
        status: "readable",
        includedMinutes: 120,
        overageOptIn: true,
        monthlyCapGbp: 75,
        authorisationSource: "commercial_offer",
      },
    })
    expect(offer.authorised).toBe(false)
    expect(offer.hardCapGuaranteed).toBe(false)
    expect(offer.knownTelloyaSeconds).toBe(60)
    expect(offer.exceptions.some((item) => item.kind === "guard_ignored" && item.callId === "guard_test_001")).toBe(true)
    expect(offer.knownTelloyaSeconds).not.toBe(1059)
  })

  it("does not total extra, duplicate, or unresolved provider durations", () => {
    const readable = {
      status: "readable" as const,
      includedMinutes: 120,
      overageOptIn: true,
      monthlyCapGbp: 75,
      authorisationSource: "commercial_offer" as const,
    }
    const extra = reconcileUsage({
      leadCallIds: ["call_test_known"],
      providerExport: [
        { callId: "call_test_known", durationSeconds: 60, product: "telloya" },
        { callId: "call_test_extra", durationSeconds: 30, product: "telloya" },
        { callId: "guard_test_002", durationSeconds: 5000, product: "guard" },
      ],
      entitlement: readable,
    })
    expect(extra.knownTelloyaSeconds).toBeNull()
    expect(extra.authorised).toBe(false)
    expect(extra.overageActive).toBe(false)
    expect(extra.hardCapGuaranteed).toBe(false)
    expect(extra.reasons).toContain("unknown_usage")
    expect(extra.exceptions).toContainEqual({ callId: "call_test_extra", kind: "missing_from_leads", recordedAsZero: false, billedSeconds: null })
    expect(extra.exceptions.some((item) => item.kind === "guard_ignored")).toBe(true)
    expect(extra.knownTelloyaSeconds).not.toBe(90)
    expect(extra.knownTelloyaSeconds).not.toBe(5060)

    const duplicate = reconcileUsage({
      leadCallIds: ["call_test_dup"],
      providerExport: [
        { callId: "call_test_dup", durationSeconds: 60, product: "telloya" },
        { callId: "call_test_dup", durationSeconds: 60, product: "telloya" },
      ],
      entitlement: readable,
    })
    expect(duplicate.knownTelloyaSeconds).toBeNull()
    expect(duplicate.knownTelloyaSeconds).not.toBe(120)
    expect(duplicate.knownTelloyaSeconds).not.toBe(60)
    expect(duplicate.exceptions).toContainEqual({ callId: "call_test_dup", kind: "duplicate_call_id", recordedAsZero: false, billedSeconds: null })
    expect(duplicate.authorised).toBe(false)
    expect(duplicate.reasons).toContain("unknown_usage")

    const invalidValues = [null, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY] as const
    for (const durationSeconds of invalidValues) {
      const decision = reconcileUsage({
        leadCallIds: ["call_test_bad"],
        providerExport: [{ callId: "call_test_bad", durationSeconds, product: "telloya" }],
        entitlement: readable,
      })
      expect(decision.knownTelloyaSeconds).toBeNull()
      expect(decision.unknownTreatedAsZero).toBe(false)
      expect(decision.authorised).toBe(false)
      expect(decision.overageActive).toBe(false)
      expect(decision.unknownCallIds).toEqual(["call_test_bad"])
      const kind = durationSeconds == null ? "unknown_duration" : "invalid_duration"
      expect(decision.exceptions).toContainEqual({ callId: "call_test_bad", kind, recordedAsZero: false, billedSeconds: null })
    }

    const zero = reconcileUsage({
      leadCallIds: ["call_test_zero"],
      providerExport: [{ callId: "call_test_zero", durationSeconds: 0, product: "telloya" }],
      entitlement: readable,
    })
    expect(zero.knownTelloyaSeconds).toBe(0)
    expect(zero.authorised).toBe(false)
    expect(zero.overageActive).toBe(false)
    expect(zero.hardCapGuaranteed).toBe(false)
  })

  it("scenario 20 records usage gaps without treating them as zero or as charges", () => {
    const decision = reconcileUsage({
      leadCallIds: ["call_test_020a"],
      providerExport: [{ callId: "call_test_020b", durationSeconds: 30, product: "telloya" }],
      entitlement: { status: "missing" },
    })
    expect(decision.authorised).toBe(false)
    expect(decision.knownTelloyaSeconds).toBeNull()
    expect(decision.exceptions).toEqual(expect.arrayContaining([
      { callId: "call_test_020b", kind: "missing_from_leads", recordedAsZero: false, billedSeconds: null },
      { callId: "call_test_020a", kind: "missing_from_provider", recordedAsZero: false, billedSeconds: null },
    ]))
    expect(decision.reasons).toContain("missing_entitlement")
    expect(decision.reasons).toContain("unknown_usage")
  })

  it("keeps the same business isolated between DEV and Production", () => {
    const dev = deliver(analyzedBody("call_test_lane", { caller_name: "Ada Dev" }))
    const both = deliver(analyzedBody("call_test_lane", { caller_name: "Ada Prod" }), {
      state: dev.state,
      environment: "production",
      apiKey: PROD_KEY,
    })
    expect(both.state.calls).toHaveLength(2)
    expect(listLeads(both.state, "dev", BUSINESS_A).map((lead) => lead.callerName)).toEqual(["Ada Dev"])
    expect(listLeads(both.state, "production", BUSINESS_A).map((lead) => lead.callerName)).toEqual(["Ada Prod"])
    expect(listLeads(both.state, "dev", BUSINESS_A).map((lead) => lead.providerCallRef)).toEqual(["call_test_lane"])
    expect(JSON.stringify(listLeads(both.state, "dev", BUSINESS_A))).not.toContain("Ada Prod")
    expect(JSON.stringify(listLeads(both.state, "production", BUSINESS_A))).not.toContain("Ada Dev")
  })

  it("rejects a later event that moves the call to another business or location", () => {
    const opened = deliver(callBody("call_ended", baseCall({ call_id: "call_test_remap" })))
    const original = structuredClone(onlyLead(opened.state).lead)
    const movedBusiness = deliver(analyzedBody("call_test_remap", { caller_name: "Other Business" }), {
      state: opened.state,
      mapRows: [{ ...maps[0], businessId: BUSINESS_B }],
    })
    expect(movedBusiness.status).toBe(204)
    expect(movedBusiness.log.outcome).toBe("unknown_tenant")
    expect(movedBusiness.state.calls).toHaveLength(1)
    expect(movedBusiness.state.calls[0].record.lead).toEqual(original)
    expect(movedBusiness.state.calls[0].record.finalised).toBe(false)

    const movedLocation = deliver(analyzedBody("call_test_remap", { caller_name: "Other Location" }), {
      state: opened.state,
      mapRows: [{ ...maps[0], locationId: LOCATION_B }],
    })
    expect(movedLocation.log.outcome).toBe("unknown_tenant")
    expect(movedLocation.state.calls).toHaveLength(1)
    expect(movedLocation.state.calls[0].record.lead).toEqual(original)
    expect(JSON.stringify(movedLocation.state.calls[0].record.lead)).not.toContain("Other Location")
  })

  it("keeps call_started as a receipt and ignores caller-supplied tenant metadata", () => {
    const started = deliver(callBody("call_started", baseCall({ call_id: "call_test_021" })))
    expect(started.status).toBe(204)
    expect(started.state.calls).toHaveLength(0)
    expect(started.state.receipts).toHaveLength(1)
    expect(JSON.stringify(started.state)).not.toContain(BUSINESS_B)
    const ended = deliver(callBody("call_ended", baseCall({ call_id: "call_test_021" })))
    const afterStart = deliver(callBody("call_started", baseCall({ call_id: "call_test_021" })), { state: ended.state })
    expect(afterStart.state.calls).toHaveLength(1)
    expect(afterStart.state.calls[0].record.finalised).toBe(false)
    expect(afterStart.state.calls[0].record.notification).toBeNull()
    expect(afterStart.log.outcome).toBe("accepted")
  })
})

describe("module boundary", () => {
  it("does not read the environment or call enquiry, Stripe, Resend, or Supabase", () => {
    const directory = path.dirname(fileURLToPath(import.meta.url))
    const sources = readdirSync(directory).filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
    const combined = sources.map((name) => readFileSync(path.join(directory, name), "utf8")).join("\n")
    expect(combined).not.toContain("process.env")
    expect(combined).not.toContain("resend")
    expect(combined).not.toContain("stripe")
    expect(combined).not.toContain("supabase")
    expect(combined).not.toContain("setTimeout")
    expect(combined).not.toContain("setInterval")
    expect(combined).not.toContain("telloya-enquiry")
    expect(combined).not.toContain("TELLOYA_ENQUIRY_ENABLED")
    expect(combined).not.toContain("TELLOYA_LAUNCHED")
  })
})
