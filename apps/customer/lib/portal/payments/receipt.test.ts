import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock("@/lib/backend", async original => ({
  ...await original<typeof import("@/lib/backend")>(),
  backend: () => ({ rpc: mocks.rpc }),
  tokenHash: (value: string) => `hash-${value.slice(0, 8)}`,
}))

import { portalReceiptDownload } from "./receipt"
import { portalInvoiceOpen } from "./invoice"
import { portalSessionCookieName } from "@/lib/portal/config"

const origin = "https://customer.profilerelaunch.com"
const token = "c".repeat(64)
const selector = `rc-${"ab".repeat(32)}`
const actionSelector = `ca-${"cd".repeat(32)}`
const hosted = "https://invoice.stripe.com/i/secret-hosted"

function receiptRequest(query: string, cookie = `${portalSessionCookieName()}=${token}`) {
  return new NextRequest(`${origin}/api/portal/payments/receipt${query}`, {
    headers: { cookie },
  })
}

beforeEach(() => {
  vi.stubEnv("CUSTOMER_PORTAL_ENABLED", "true")
  vi.stubEnv("CUSTOMER_ORIGIN", origin)
  vi.stubEnv("SUPABASE_URL", "https://example.supabase.co")
  vi.stubEnv("SUPABASE_SECRET_KEY", "test")
  vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "test")
  mocks.rpc.mockReset()
})
afterEach(() => vi.unstubAllEnvs())

describe("portal receipt download", () => {
  it("denies a missing or revoked session and a forged customer id", async () => {
    expect((await portalReceiptDownload(receiptRequest(`?selector=${selector}`, ""))).status).toBe(401)
    const forged = await portalReceiptDownload(receiptRequest(`?selector=${selector}&customerId=11111111-1111-4111-8111-111111111111`))
    expect(forged.status).toBe(404)
    expect(mocks.rpc).not.toHaveBeenCalled()
    vi.stubEnv("CUSTOMER_PORTAL_ENABLED", "")
    expect((await portalReceiptDownload(receiptRequest(`?selector=${selector}`))).status).toBe(404)
  })

  it("returns only customer-safe receipt facts", async () => {
    mocks.rpc.mockResolvedValue({
      status: "ok",
      reference: "PR-26-ABCDEF",
      orderRef: "SO-26-ABCDEF",
      amountMinor: 9900,
      currency: "GBP",
      taxBehaviour: "NOT_APPLICABLE",
      taxAmountMinor: 0,
      paidAt: "2026-10-04T12:00:00.000Z",
      stripePaymentIntentId: "pi_secret",
      providerReceiptUrl: "https://pay.stripe.com/receipts/secret",
      storageKey: "receipts/secret.pdf",
    })
    const response = await portalReceiptDownload(receiptRequest(`?selector=${selector}`))
    expect(response.status).toBe(404)
  })

  it("downloads an owned receipt without provider references", async () => {
    mocks.rpc.mockResolvedValue({
      status: "ok",
      reference: "PR-26-ABCDEF",
      orderRef: "SO-26-ABCDEF",
      amountMinor: 9900,
      currency: "GBP",
      taxBehaviour: "NOT_APPLICABLE",
      taxAmountMinor: 0,
      paidAt: "2026-10-04T12:00:00.000Z",
    })
    const response = await portalReceiptDownload(receiptRequest(`?selector=${selector}`))
    expect(response.status).toBe(200)
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="receipt-SO-26-ABCDEF.txt"')
    expect(response.headers.get("cache-control")).toContain("no-store")
    const text = await response.text()
    expect(text).toContain("£99.00")
    expect(text).toContain("PR-26-ABCDEF")
    expect(text).toContain("SO-26-ABCDEF")
    expect(text).not.toMatch(/pi_|cus_|cs_|pm_|stripe|storage|secret|receipts\//i)
  })

  it("does not redirect an invoice page at a provider address stored in HTML", async () => {
    mocks.rpc.mockResolvedValue({ status: "redirect", hostedInvoiceUrl: hosted })
    const response = await portalInvoiceOpen(new NextRequest(
      `${origin}/api/portal/payments/invoice?reference=PR-26-ABCDEF&selector=${actionSelector}`,
      { headers: { cookie: `${portalSessionCookieName()}=${token}` } },
    ))
    expect(response.status).toBe(307)
    expect(response.headers.get("location")).toBe(hosted)
    expect(await response.text()).not.toContain(hosted)
    mocks.rpc.mockResolvedValue({ status: "unavailable" })
    const missing = await portalInvoiceOpen(new NextRequest(
      `${origin}/api/portal/payments/invoice?reference=PR-26-ABCDEF&selector=${actionSelector}&customerId=nope`,
      { headers: { cookie: `${portalSessionCookieName()}=${token}` } },
    ))
    expect(missing.status).toBe(404)
    expect(mocks.rpc).toHaveBeenCalledTimes(1)
  })
})
