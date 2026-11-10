import { describe, expect, it, vi } from "vitest"

import { signRetellSignature } from "../../../telloya/lib/voice/signature"
import { inboundLaunchBlockers } from "./inbound-admission"
import { inboundUsageIngestPayload, ingestAdmittedUsage } from "./inbound-usage-ingest"

const NOW_MS = Date.parse("2026-11-15T12:00:00.000Z")
const KEY = "synthetic_inbound_usage_key"
const ADMISSION = "adm_" + "b".repeat(32)

function raw(event: string, call: Record<string, unknown> = {}): string {
  return JSON.stringify({
    event,
    call: {
      call_id: "call_usage_1",
      call_type: "phone_call",
      to_number: "+441111111111",
      metadata: { admission_id: ADMISSION, subscription_id: "tenant-from-provider" },
      transcript: "do not store",
      recording_url: "https://example.invalid/recording",
      ...call,
    },
  })
}

describe("inbound usage ingest", () => {
  it("stays closed while either Telloya flag is off", async () => {
    const ingest = vi.fn()
    const body = raw("call_started")
    expect(await ingestAdmittedUsage({
      usageFlag: undefined,
      admissionFlag: "true",
      environment: "dev",
      apiKey: KEY,
      nowMs: NOW_MS,
      rawBody: body,
      signatureHeader: signRetellSignature(body, KEY, String(NOW_MS)),
      ingest,
    })).toEqual({ status: 404, outcome: "closed" })
    expect(await ingestAdmittedUsage({
      usageFlag: "true",
      admissionFlag: "false",
      environment: "dev",
      apiKey: KEY,
      nowMs: NOW_MS,
      rawBody: body,
      signatureHeader: signRetellSignature(body, KEY, String(NOW_MS)),
      ingest,
    })).toEqual({ status: 404, outcome: "closed" })
    expect(ingest).not.toHaveBeenCalled()
    expect(inboundLaunchBlockers()).toContain("admission_usage_ingest_not_applied")
    expect(inboundLaunchBlockers()).toContain("usage_events_flag_off")
    expect(inboundLaunchBlockers()).toContain("inbound_admission_flag_off")
  })

  it("keeps provider content out of the database payload and does not treat metadata as identity", () => {
    const body = raw("call_analyzed", {
      call_analysis: { custom_analysis_data: { caller_name: "Ada", summary: "Boiler repair", callback_number: "+447700900111" } },
    })
    const built = inboundUsageIngestPayload({ environment: "dev", rawBody: body })
    expect("error" in built).toBe(false)
    if ("error" in built) return
    expect(built.payload).toMatchObject({
      eventType: "call_analyzed",
      providerCallRef: "call_usage_1",
      toNumber: "+441111111111",
      admissionRef: ADMISSION,
      assertedSubscriptionId: "tenant-from-provider",
      callerName: "Ada",
      summary: "Boiler repair",
      callbackNumber: "+447700900111",
    })
    expect(JSON.stringify(built.payload)).not.toMatch(/transcript|recording|access_token|do not store/)
    expect(inboundUsageIngestPayload({
      environment: "dev",
      rawBody: raw("call_started", { metadata: { admission_id: "adm_not-valid" } }),
    })).toEqual({ error: "rejected_payload" })
    expect(inboundUsageIngestPayload({
      environment: "dev",
      rawBody: raw("call_ended", { call_type: "web_call" }),
    })).toEqual({ error: "rejected_payload" })
  })
})
