import { readFileSync } from "node:fs"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock("@/lib/auth/backend", async original => ({ ...await original<typeof import("@/lib/auth/backend")>(), backend: () => mocks }))

import { guidedFulfilmentClose } from "./guided-close"
import { sessionCookie } from "@/lib/auth/config"

const origin = "https://admin.profilerelaunch.com"
const caseId = "55555555-5555-4555-8555-555555555555"
const key = "33333333-3333-4333-8333-333333333333"

function req() {
  return new NextRequest(`${origin}/api/cases/guided-close`, {
    method: "POST",
    headers: {
      origin,
      "content-type": "application/json",
      "idempotency-key": key,
      cookie: `${sessionCookie}=${"a".repeat(64)}`,
    },
    body: JSON.stringify({
      id: caseId,
      version: 4,
      summary: "The Guided preparation is complete and the pack is in the portal.",
      note: "Closed after the pack was published for the customer.",
    }),
  })
}

beforeEach(() => {
  vi.stubEnv("ADMIN_AUTH_ENABLED", "true")
  vi.stubEnv("ADMIN_ORIGIN", origin)
  vi.stubEnv("VERCEL_ENV", "production")
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co")
  vi.stubEnv("SUPABASE_SECRET_KEY", "test")
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "test")
  vi.stubEnv("COMMUNICATIONS_SEND_ENABLED", "true")
  vi.stubEnv("JOB_WORKER_ENABLED", "true")
  vi.stubEnv("JOB_PROVIDER_MODE", "production")
  vi.stubEnv("RESEND_API_KEY", "re_test_key")
  vi.stubEnv("COMMUNICATIONS_FROM_EMAIL", "ops@example.com")
  vi.stubEnv("JOB_WORKER_CADENCE_SECONDS", "300")
  vi.stubEnv("COMMUNICATIONS_REPLY_TO_EMAIL", "cases@profilerelaunch.com")
  vi.stubEnv("COMMUNICATIONS_REPLY_TO_CONFIRMED", "monitored")
  mocks.rpc.mockReset()
})
afterEach(() => vi.unstubAllEnvs())

describe("guided fulfilment close", () => {
  it("returns after the case is closed while a hanging mail provider is not awaited", async () => {
    const source = readFileSync(new URL("./guided-close.ts", import.meta.url), "utf8")
    expect(source).not.toContain("wakeDevMailDispatch")
    expect(source).not.toContain("runDevMailDispatchWorker")
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name.startsWith("dev_mail_dispatch_") || name === "communication_begin_provider_attempt_v1") return new Promise(() => {})
      if (name === "admin_guided_completion_context_v1") {
        return {
          status: "applicable",
          caseRef: "PR-26-MALL2A",
          amountMinor: 9900,
          currency: "GBP",
          serviceCode: "GUIDED_RELAUNCH",
          serviceName: "Guided Relaunch",
        }
      }
      return { status: "success", completionEmail: "success", recovered: false }
    })
    const pending = guidedFulfilmentClose(req())
    const response = await Promise.race([
      pending,
      new Promise<never>((_resolve, reject) => setTimeout(() => reject(new Error("close waited for the mail provider")), 800)),
    ])
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      message: "The Guided preparation is closed. The completion email is queued. Queued is not delivered. This does not record a Google decision and it does not enrol Relaunch Guard.",
    })
    expect(mocks.rpc.mock.calls.map(call => call[0])).toEqual([
      "admin_guided_completion_context_v1",
      "admin_guided_fulfilment_close_v1",
    ])
  })
})
