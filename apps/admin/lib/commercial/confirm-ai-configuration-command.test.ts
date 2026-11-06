import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { ADMIN_RECENT_SIGN_IN_MESSAGE } from "../admin/reauth-copy"
import { sessionCookie } from "../auth/config"

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock("@/lib/auth/backend", async original => ({ ...await original<typeof import("@/lib/auth/backend")>(), backend: () => mocks }))
import { POST } from "@/app/api/commercial/confirm-ai-configuration/route"
import { commercialProviderLane } from "./provider-lane"

const origin = "https://admin.profilerelaunch.com"
const key = "33333333-3333-4333-8333-333333333333"
const body = {
  subscriptionId: "a033a000-0000-4000-8000-000000000031",
  version: 4,
  customerId: "a033a000-0000-4000-8000-0000000000a1",
  businessId: "a033a000-0000-4000-8000-000000000011",
  onboardingRequestId: "a033a000-0000-4000-8000-000000000041",
  onboardingVersion: 2,
  locationId: "a033a000-0000-4000-8000-000000000021",
  preferenceVersion: 1,
  provisionVersion: 1,
  configurationVersion: 0,
  provider: {
    provider: "telloya_voice",
    environment: "dev",
    agentRef: "agent-high-01",
    revision: "rev-0004",
    chosenVoice: "Harbour",
    chosenLanguage: "en-GB",
    attestation: "The operator recorded this configuration in the provider console.",
    staffConfirmed: true,
  },
}

function req(payload: unknown = body, requestOrigin = origin) {
  return new NextRequest(`${requestOrigin}/api/commercial/confirm-ai-configuration`, {
    method: "POST",
    headers: {
      origin: requestOrigin,
      "content-type": "application/json",
      "idempotency-key": key,
      cookie: `${sessionCookie}=${"a".repeat(64)}`,
    },
    body: JSON.stringify(payload),
  })
}

beforeEach(() => {
  vi.stubEnv("ADMIN_AUTH_ENABLED", "true")
  vi.stubEnv("ADMIN_ORIGIN", origin)
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co")
  vi.stubEnv("SUPABASE_SECRET_KEY", "test")
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "test")
  vi.stubEnv("ADMIN_COMMERCIAL_SETUP_QUEUE_ENABLED", "true")
  vi.stubEnv("ADMIN_COMMERCIAL_CONFIRM_AI_CONFIGURATION_ENABLED", "true")
  vi.stubEnv("VERCEL_ENV", "development")
  mocks.rpc.mockReset()
})
afterEach(() => vi.unstubAllEnvs())

describe("confirm AI configuration command messages", () => {
  it("stays closed while either flag is off and does not call the database", async () => {
    vi.stubEnv("ADMIN_COMMERCIAL_CONFIRM_AI_CONFIGURATION_ENABLED", "")
    const closed = await POST(req())
    expect(closed.status).toBe(403)
    expect(await closed.json()).toEqual({ message: "Confirm AI configuration is not switched on." })
    vi.stubEnv("ADMIN_COMMERCIAL_CONFIRM_AI_CONFIGURATION_ENABLED", "true")
    vi.stubEnv("ADMIN_COMMERCIAL_SETUP_QUEUE_ENABLED", "")
    const queueClosed = await POST(req())
    expect(queueClosed.status).toBe(403)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("rejects provider evidence that was not explicitly confirmed by staff", async () => {
    const response = await POST(req({ ...body, provider: { ...body.provider, staffConfirmed: false } }))
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ message: "Check the provider evidence before recording the configuration." })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it.each([
    ["success", undefined, 200, "The AI configuration is recorded for this location. Testing is still required. The receptionist is not live."],
    ["reauth_required", undefined, 403, ADMIN_RECENT_SIGN_IN_MESSAGE],
    ["conflict", "version", 409, "This configuration has changed. Reload the queue before trying again."],
    ["conflict", undefined, 409, "This request was already used with different details. Reload the queue and start again."],
    ["denied", "preferences", 403, "Confirm the business preferences for every selected location before recording an AI configuration."],
    ["denied", "provider", 403, "That provider reference is already recorded for a different location or business."],
    ["denied", "environment", 403, "That provider reference belongs to a different environment."],
    ["denied", "setup", 403, "This location is not ready for an AI configuration record."],
    ["denied", "payment", 403, "This subscription is not a verified paid subscription, so the AI configuration cannot be recorded."],
    ["denied", "inactive", 403, "This subscription is not active, so the AI configuration cannot be recorded."],
    ["denied", "expired", 403, "This subscription period has ended, so the AI configuration cannot be recorded."],
    ["denied", "revoked", 403, "Business authority is not verified, so the AI configuration cannot be recorded."],
    ["denied", "location", 403, "That location is not one of the selected locations for this subscription."],
    ["unauthorized", undefined, 401, "Your session has ended. Please sign in again."],
    ["invalid", undefined, 400, "Check the provider evidence before recording the configuration."],
  ])("maps %s %s to a nontechnical message", async (status, reason, code, message) => {
    mocks.rpc.mockResolvedValue({ status, reason })
    const response = await POST(req())
    expect(response.status).toBe(code)
    expect(await response.json()).toEqual({ message })
    expect(response.headers.get("cache-control")).toContain("no-store")
  })

  it("records production evidence only when the server lane is production", async () => {
    vi.stubEnv("VERCEL_ENV", "production")
    mocks.rpc.mockResolvedValue({ status: "success" })
    const response = await POST(req({ ...body, provider: { ...body.provider, environment: "production" } }))
    expect(response.status).toBe(200)
    expect(mocks.rpc.mock.calls[0][1].p_payload.provider.environment).toBe("production")
  })

  it("keeps recording closed when the server lane is absent", async () => {
    delete process.env.VERCEL_ENV
    expect(commercialProviderLane()).toBeNull()
    const response = await POST(req())
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ message: "The provider lane is not configured for this deployment, so the AI configuration cannot be recorded." })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("records the server lane and ignores a browser choice that matches it", async () => {
    mocks.rpc.mockResolvedValue({ status: "success" })
    await POST(req())
    expect(mocks.rpc.mock.calls[0][1].p_payload.provider.environment).toBe("dev")
  })

  it("rejects a provider revision that is not rev- and four digits", async () => {
    for (const revision of ["fingerprint", "4", "rev-4", "rev-00004", "REV-0004"]) {
      const response = await POST(req({ ...body, provider: { ...body.provider, revision } }))
      expect(response.status).toBe(400)
      expect(await response.json()).toEqual({ message: "Check the provider evidence before recording the configuration." })
    }
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("rejects Production evidence on a DEV deployment before the database", async () => {
    const response = await POST(req({ ...body, provider: { ...body.provider, environment: "production" } }))
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ message: "That provider environment does not match this deployment, so the configuration cannot be recorded." })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("rejects Production evidence on a preview deployment before the database", async () => {
    const previewOrigin = "https://confirm-ai.vercel.app"
    vi.stubEnv("VERCEL_ENV", "preview")
    vi.stubEnv("VERCEL_URL", "confirm-ai.vercel.app")
    const response = await POST(req({ ...body, provider: { ...body.provider, environment: "production" } }, previewOrigin))
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ message: "That provider environment does not match this deployment, so the configuration cannot be recorded." })
    expect(mocks.rpc).not.toHaveBeenCalled()
    mocks.rpc.mockResolvedValue({ status: "success" })
    const allowed = await POST(req(body, previewOrigin))
    expect(allowed.status).toBe(200)
    expect(mocks.rpc.mock.calls[0][1].p_payload.provider.environment).toBe("dev")
  })

  it("rejects DEV evidence on a Production deployment before the database", async () => {
    vi.stubEnv("VERCEL_ENV", "production")
    const response = await POST(req())
    expect(response.status).toBe(400)
    expect(await response.json()).toEqual({ message: "That provider environment does not match this deployment, so the configuration cannot be recorded." })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it.each(["", "staging"])("keeps recording closed when the server lane is %s", async value => {
    vi.stubEnv("VERCEL_ENV", value)
    expect(commercialProviderLane()).toBeNull()
    const response = await POST(req())
    expect(response.status).toBe(403)
    expect(await response.json()).toEqual({ message: "The provider lane is not configured for this deployment, so the AI configuration cannot be recorded." })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("treats preview and development as DEV and production as Production", () => {
    vi.stubEnv("VERCEL_ENV", "development")
    expect(commercialProviderLane()).toBe("dev")
    vi.stubEnv("VERCEL_ENV", "preview")
    expect(commercialProviderLane()).toBe("dev")
    vi.stubEnv("VERCEL_ENV", "production")
    expect(commercialProviderLane()).toBe("production")
  })
})
