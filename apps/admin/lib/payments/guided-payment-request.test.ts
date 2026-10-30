import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock("@/lib/auth/backend", async original => ({
  ...await original<typeof import("@/lib/auth/backend")>(),
  backend: () => mocks,
}))

import { POST } from "@/app/api/cases/journey/payment-request/route"
import { sessionCookie } from "@/lib/auth/config"

const origin = "https://admin-git-develop.vercel.app"
const devUrl = "https://rmzozuiamjcclvtgutgd.supabase.co"
const portal = "https://profilerelaunch-customer-git-develop-clientcove.vercel.app"
const orderId = "66666666-6666-4666-8666-666666666666"
const key = "33333333-3333-4333-8333-333333333333"

function req(body: unknown = { serviceOrderId: orderId, version: 4 }, headers: Record<string, string> = {}) {
  return new NextRequest(`${origin}/api/cases/journey/payment-request`, {
    method: "POST",
    headers: {
      origin,
      "content-type": "application/json",
      "idempotency-key": key,
      cookie: `${sessionCookie}=${"a".repeat(64)}`,
      ...headers,
    },
    body: JSON.stringify(body),
  })
}

function order(overrides: Record<string, unknown> = {}) {
  return {
    id: orderId,
    publicRef: "SO-26-GHHRGY",
    caseReference: "PR-26-GHNLB9",
    businessName: "North Bakery",
    serviceCode: "GUIDED_RELAUNCH",
    amountMinor: 9900,
    currency: "GBP",
    paymentModel: "UPFRONT",
    state: "ACCEPTED_AWAITING_PAYMENT",
    ...overrides,
  }
}

beforeEach(() => {
  vi.stubEnv("ADMIN_AUTH_ENABLED", "true")
  vi.stubEnv("ADMIN_ORIGIN", origin)
  vi.stubEnv("SUPABASE_URL", devUrl)
  vi.stubEnv("SUPABASE_SECRET_KEY", "test")
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "test")
  vi.stubEnv("VERCEL_ENV", "preview")
  vi.stubEnv("VERCEL_GIT_COMMIT_REF", "develop")
  vi.stubEnv("VERCEL_URL", "admin-git-develop.vercel.app")
  vi.stubEnv("VERCEL_BRANCH_URL", "profilerelaunch-admin-git-develop-clientcove.vercel.app")
  vi.stubEnv("CUSTOMER_ORIGIN", portal)
  vi.stubEnv("AWS_EVIDENCE_BUCKET", "profilerelaunch-evidence-dev-01")
  vi.stubEnv("COMMUNICATIONS_SEND_ENABLED", "true")
  vi.stubEnv("JOB_PROVIDER_MODE", "production")
  vi.stubEnv("RESEND_API_KEY", "re_test_key")
  vi.stubEnv("COMMUNICATIONS_FROM_EMAIL", "ops@example.com")
  vi.stubEnv("COMMUNICATIONS_REPLY_TO_EMAIL", "cases@profilerelaunch.com")
  vi.stubEnv("COMMUNICATIONS_REPLY_TO_CONFIRMED", "monitored")
  mocks.rpc.mockReset().mockImplementation(async (name: string) => {
    if (name === "admin_order_detail_v1") return order()
    if (name === "admin_dev_send_email_claim_v1") return { status: "denied", reason: "not_ready" }
    return { status: "success", id: "comm-1", lifecycle: "QUEUED", deliveryStatus: "NONE", reusedAction: true, replay: false }
  })
})

afterEach(() => vi.unstubAllEnvs())

describe("guided payment-request command", () => {
  it("queues the rendered portal email and does not return a bearer link", async () => {
    const response = await POST(req())
    expect(response.status).toBe(503)
    const body = await response.json() as { message?: string; actionUrl?: string; deliveryStatus?: string }
    expect(body.actionUrl).toBeUndefined()
    expect(body.deliveryStatus).toBe("NONE")
    expect(body.message).toMatch(/not submitted to the email provider/)
    expect(body.message).toMatch(/payment stays outstanding/)
    const payload = mocks.rpc.mock.calls.find(call => call[0] === "admin_queue_guided_payment_request_v1")?.[1].p_payload
    expect(payload.serviceOrderId).toBe(orderId)
    expect(payload.version).toBe(4)
    expect(payload.customerOrigin).toBe(portal)
    expect(payload.recipient).toBeUndefined()
    expect(payload.bodyText).toContain("Business: North Bakery")
    expect(payload.bodyText).toContain("Pay £99.00 securely")
    expect(payload.bodyText).toContain(`${portal}/portal/cases/PR-26-GHNLB9/payments`)
    expect(payload.bodyText).not.toContain("#t=")
    expect(payload.bodyText).not.toContain("/action/")
    expect(payload.bodyText).not.toContain("Review and accept quotation")
    expect(payload.bodyHtml).toContain("Pay £99.00 securely")
    expect(JSON.stringify(payload)).not.toContain("other@example.com")
  })

  it("refuses a second link shape, a Managed fee, and a mismatched origin", async () => {
    expect((await POST(req({ serviceOrderId: orderId, version: 4, secretHash: "a".repeat(64) }))).status).toBe(400)
    mocks.rpc.mockImplementation(async (name: string) => name === "admin_order_detail_v1"
      ? order({ serviceCode: "MANAGED_RELAUNCH", paymentModel: "SUCCESS_FEE", amountMinor: 29900 })
      : { status: "success" })
    const managed = await POST(req())
    expect(managed.status).toBe(403)
    expect(await managed.json()).toMatchObject({ message: expect.stringMatching(/not charged an upfront fee/) })
    expect(mocks.rpc.mock.calls.some(call => call[0] === "admin_queue_guided_payment_request_v1")).toBe(false)
    expect((await POST(req(undefined, { origin: "https://admin.example.invalid" }))).status).toBe(403)
  })

  it("does not queue when the monitored Reply-To is missing", async () => {
    vi.stubEnv("COMMUNICATIONS_REPLY_TO_CONFIRMED", "")
    const response = await POST(req())
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ message: expect.stringMatching(/No email was queued/) })
    expect(mocks.rpc.mock.calls.some(call => call[0] === "admin_queue_guided_payment_request_v1")).toBe(false)
  })
})
