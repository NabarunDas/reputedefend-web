import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import { ADMIN_RECENT_SIGN_IN_MESSAGE } from "../admin/reauth-copy"
import { sessionCookie } from "../auth/config"

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock("@/lib/auth/backend", async original => ({ ...await original<typeof import("@/lib/auth/backend")>(), backend: () => mocks }))
import { POST } from "@/app/api/commercial/confirm-preferences/route"

const origin = "https://admin.profilerelaunch.com"
const key = "33333333-3333-4333-8333-333333333333"
const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
const body = {
  subscriptionId: "a033a000-0000-4000-8000-000000000031",
  version: 4,
  customerId: "a033a000-0000-4000-8000-0000000000a1",
  businessId: "a033a000-0000-4000-8000-000000000011",
  onboardingRequestId: "a033a000-0000-4000-8000-000000000041",
  onboardingVersion: 2,
  locationId: "a033a000-0000-4000-8000-000000000021",
  preferenceVersion: 0,
  preferences: {
    timezone: "Europe/London",
    openingHours: days.map(day => day === "sunday"
      ? { day, closed: true, opens: null, closes: null, breaks: [] }
      : { day, closed: false, opens: "09:00", closes: "17:00", breaks: [] }),
    exceptionalHours: "No exceptional hours are agreed.",
    outOfHours: "Take a message and say the business is closed.",
    greeting: "Thank you for calling Harbour Bakery.",
    enquiryDetails: ["Caller name"],
    callbackInstructions: "Offer a callback only inside the stated windows.",
    callbackWindows: [],
    urgentRules: "There is no emergency cover. Take a message for the next day.",
    directContactRules: "Pass the caller to the business only when they ask.",
    specialInstructions: null,
    voicePresentation: "no_preference",
    accent: "British",
    spokenLanguage: "en-GB",
    additionalLanguages: [],
    pronunciationNotes: null,
  },
  confirmation: {
    source: "telephone",
    communicationId: null,
    messageId: null,
    attestation: "The customer confirmed these preferences by telephone.",
    customerConfirmedAt: "2026-11-04T15:00:00.000Z",
  },
}

function req(payload: unknown = body) {
  return new NextRequest(`${origin}/api/commercial/confirm-preferences`, {
    method: "POST",
    headers: {
      origin,
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
  vi.stubEnv("ADMIN_COMMERCIAL_CONFIRM_PREFERENCES_ENABLED", "true")
  mocks.rpc.mockReset()
})
afterEach(() => vi.unstubAllEnvs())

describe("confirm preferences command messages", () => {
  it("stays closed while either flag is off and does not call the database", async () => {
    vi.stubEnv("ADMIN_COMMERCIAL_CONFIRM_PREFERENCES_ENABLED", "")
    const closed = await POST(req())
    expect(closed.status).toBe(403)
    expect(await closed.json()).toEqual({ message: "Confirm business preferences is not switched on." })
    vi.stubEnv("ADMIN_COMMERCIAL_CONFIRM_PREFERENCES_ENABLED", "true")
    vi.stubEnv("ADMIN_COMMERCIAL_SETUP_QUEUE_ENABLED", "")
    const queueClosed = await POST(req())
    expect(queueClosed.status).toBe(403)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it.each([
    ["success", undefined, 200, "Business preferences are recorded for this location. The queue shows what is still needed."],
    ["reauth_required", undefined, 403, ADMIN_RECENT_SIGN_IN_MESSAGE],
    ["conflict", "version", 409, "These preferences have changed. Reload the queue before trying again."],
    ["conflict", undefined, 409, "This request was already used with different details. Reload the queue and start again."],
    ["denied", "setup", 403, "Setup has not started for this subscription, so preferences cannot be confirmed."],
    ["denied", "payment", 403, "This subscription is not a verified paid subscription, so preferences cannot be confirmed."],
    ["denied", "inactive", 403, "This subscription is not active, so preferences cannot be confirmed."],
    ["denied", "expired", 403, "This subscription period has ended, so preferences cannot be confirmed."],
    ["denied", "revoked", 403, "Business authority is not verified, so preferences cannot be confirmed."],
    ["denied", "provenance", 403, "The confirmation needs a recorded customer message or an explicit telephone attestation."],
    ["denied", "location", 403, "That location is not one of the selected locations for this subscription."],
    ["unauthorized", undefined, 401, "Your session has ended. Please sign in again."],
    ["invalid", undefined, 400, "Check the preferences before confirming them."],
  ])("maps %s %s to a nontechnical message", async (status, reason, code, message) => {
    mocks.rpc.mockResolvedValue({ status, reason })
    const response = await POST(req())
    expect(response.status).toBe(code)
    expect(await response.json()).toEqual({ message })
  })
})
