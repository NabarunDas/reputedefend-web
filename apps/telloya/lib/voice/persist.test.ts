import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

import { persistVoiceEvent, type VoiceDb } from "./persist"
import { signRetellSignature } from "./signature"

const NOW_MS = 1762300000000
const NOW_ISO = "2026-11-04T23:46:40.000Z"
const KEY = "synthetic_webhook_key_lane_dev"

function body() {
  return JSON.stringify({ event: "call_started", call: { call_id: "call_test_001", to_number: "+440000000010", agent_id: "agent_test_a" } })
}

function dbThatMustNotBeCalled(): VoiceDb {
  return {
    query: async () => {
      throw new Error("database was called")
    },
  }
}

describe("voice persistence adapter boundaries", () => {
  it("does not touch the database when the lane is closed or the signature is wrong", async () => {
    const rawBody = body()
    const closed = await persistVoiceEvent(dbThatMustNotBeCalled(), {
      enabledFlag: "false",
      environment: "dev",
      apiKey: KEY,
      nowMs: NOW_MS,
      nowIso: NOW_ISO,
      rawBody,
      signatureHeader: signRetellSignature(rawBody, KEY, String(NOW_MS)),
    })
    expect(closed.status).toBe(404)
    expect(closed.log.outcome).toBe("closed")

    const rejected = await persistVoiceEvent(dbThatMustNotBeCalled(), {
      enabledFlag: "true",
      environment: "dev",
      apiKey: KEY,
      nowMs: NOW_MS,
      nowIso: NOW_ISO,
      rawBody,
      signatureHeader: "v=1762300000000,d=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    })
    expect(rejected.status).toBe(401)
    expect(rejected.log.outcome).toBe("rejected_signature")
  })

  it("keeps provider verification beside persistence and does not add a route", () => {
    const source = readFileSync(new URL("./persist.ts", import.meta.url), "utf8")
    expect(source).toContain("verifyRetellSignature")
    expect(source).toContain("projectRetellEvent")
    expect(source).toContain("telloya_voice_commit_event_v1")
    expect(source).not.toContain("app/api")
    expect(source).not.toContain("webhook")
  })
})
