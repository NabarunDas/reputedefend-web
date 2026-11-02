import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), laneOpen: false }))
vi.mock("@/lib/auth/backend", async original => ({ ...await original<typeof import("@/lib/auth/backend")>(), backend: () => mocks }))
vi.mock("../communications/central-dispatch", () => ({ centralDispatchLaneOpen: () => mocks.laneOpen }))
import { POST } from "@/app/api/enquiries/invitation/route"
import { sessionCookie } from "@/lib/auth/config"

const origin = "https://admin.profilerelaunch.com"
const enquiryId = "22222222-2222-4222-8222-222222222222"
const requestId = "55555555-5555-4555-8555-555555555555"
const key = "33333333-3333-4333-8333-333333333333"

function req(body: Record<string, unknown> = {
  operation: "issue_invitation",
  version: 4,
  enquiryId,
  reason: "The customer asked for portal access.",
}, requestOrigin = origin) {
  return new NextRequest(`${requestOrigin}/api/enquiries/invitation`, {
    method: "POST",
    headers: {
      origin: requestOrigin,
      "content-type": "application/json",
      "idempotency-key": key,
      cookie: `${sessionCookie}=${"a".repeat(64)}`,
    },
    body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.stubEnv("ADMIN_AUTH_ENABLED", "true")
  vi.stubEnv("ADMIN_ORIGIN", origin)
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co")
  vi.stubEnv("SUPABASE_SECRET_KEY", "test")
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "test")
  mocks.rpc.mockReset()
  mocks.laneOpen = false
})
afterEach(() => vi.unstubAllEnvs())

describe("customer invitation command", () => {
  it("does not call the database when the flag is off", async () => {
    const response = await POST(req())
    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({ message: "Invitation sending is switched off." })
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("does not queue when the flag is on but the sender is not configured", async () => {
    vi.stubEnv("CUSTOMER_INVITATION_DISPATCH_ENABLED", "true")
    const response = await POST(req())
    expect(response.status).toBe(503)
    expect(mocks.rpc).not.toHaveBeenCalled()
  })

  it("queues one invitation and returns no token, hash, or address", async () => {
    vi.stubEnv("CUSTOMER_INVITATION_DISPATCH_ENABLED", "true")
    vi.stubEnv("COMMUNICATIONS_LINK_SECRET", "invitation-link-secret-at-least-32")
    vi.stubEnv("COMMUNICATIONS_FROM_EMAIL", "ops@example.com")
    vi.stubEnv("VERCEL_ENV", "preview")
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "develop")
    vi.stubEnv("VERCEL_BRANCH_URL", "profilerelaunch-admin-git-develop-preview.vercel.app")
    vi.stubEnv("SUPABASE_URL", "https://rmzozuiamjcclvtgutgd.supabase.co")
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "admin_enquiry_detail_v1") return { caseRef: null }
      if (name === "admin_commercial_onboarding_v1") return { supported: true, request: { id: requestId } }
      if (name === "admin_customer_invitation_command_v1") return { status: "success", operation: "issue_invitation", lifecycle: "QUEUED", deliveryStatus: "NONE" }
      throw new Error(name)
    })
    const response = await POST(req({
      operation: "issue_invitation",
      version: 4,
      enquiryId,
      reason: "The customer asked for portal access.",
    }, "https://profilerelaunch-admin-git-develop-preview.vercel.app"))
    expect(response.status).toBe(200)
    const payload = await response.json()
    expect(payload).toEqual({ message: "The customer invitation is queued. Queued is not delivered." })
    expect(JSON.stringify(payload)).not.toMatch(/[a-f0-9]{64}/)
    expect(JSON.stringify(payload)).not.toContain("@")
    expect(JSON.stringify(payload)).not.toContain("/login/invite")
    const command = mocks.rpc.mock.calls.find(call => call[0] === "admin_customer_invitation_command_v1")
    expect(command?.[1].p_body_text).toContain("/login/invite/ready")
    expect(command?.[1].p_body_text).not.toMatch(/\/login\/invite\/[a-f0-9]{64}/)
    expect(command?.[1].p_hashes).toHaveLength(3)
    expect(mocks.rpc.mock.calls.some(call => call[0] === "dev_mail_dispatch_claim_invitation_v1")).toBe(false)
  })

  it("processes the original queued invitation and does not compose another email", async () => {
    vi.stubEnv("CUSTOMER_INVITATION_DISPATCH_ENABLED", "true")
    vi.stubEnv("COMMUNICATIONS_LINK_SECRET", "invitation-link-secret-at-least-32")
    vi.stubEnv("COMMUNICATIONS_FROM_EMAIL", "ops@example.com")
    vi.stubEnv("VERCEL_ENV", "preview")
    vi.stubEnv("VERCEL_GIT_COMMIT_REF", "develop")
    vi.stubEnv("VERCEL_BRANCH_URL", "profilerelaunch-admin-git-develop-preview.vercel.app")
    vi.stubEnv("SUPABASE_URL", "https://rmzozuiamjcclvtgutgd.supabase.co")
    mocks.laneOpen = true
    const original = "66666666-6666-4666-8666-666666666666"
    mocks.rpc.mockImplementation(async (name: string) => {
      if (name === "admin_enquiry_detail_v1") return { caseRef: null }
      if (name === "admin_commercial_onboarding_v1") return { supported: true, request: { id: requestId } }
      if (name === "admin_customer_invitation_command_v1") return { status: "success", operation: "process_invitation", originalRequest: original }
      if (name === "dev_mail_dispatch_claim_invitation_v1") return { status: "denied", reason: "already_processed" }
      throw new Error(name)
    })
    const response = await POST(req({
      operation: "process_invitation",
      version: 4,
      enquiryId,
      reason: "The queued invitation is still waiting.",
    }, "https://profilerelaunch-admin-git-develop-preview.vercel.app"))
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ message: "The email provider already accepted this invitation. It was not sent again." })
    const command = mocks.rpc.mock.calls.find(call => call[0] === "admin_customer_invitation_command_v1")
    expect(command?.[1].p_operation).toBe("process_invitation")
    expect(command?.[1].p_hashes).toBeNull()
    expect(command?.[1].p_body_text).toBeNull()
    const claim = mocks.rpc.mock.calls.find(call => call[0] === "dev_mail_dispatch_claim_invitation_v1")
    expect(claim?.[1].p_request).toBe(original)
    expect(claim?.[1].p_request).not.toBe(key)
  })
})
