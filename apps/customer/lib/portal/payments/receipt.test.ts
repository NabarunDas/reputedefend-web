import { execFileSync } from "node:child_process"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock("@/lib/backend", async original => ({
  ...await original<typeof import("@/lib/backend")>(),
  backend: () => ({ rpc: mocks.rpc }),
  tokenHash: (value: string) => `hash-${value.slice(0, 8)}`,
}))

import { billingPdfText } from "../../../../../lib/billing/document-pdf"
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
      receiptRef: "RC-26-ABCDEF",
      reference: "PR-26-ABCDEF",
      orderRef: "SO-26-ABCDEF",
      serviceName: "Guided Relaunch",
      amountMinor: 9900,
      currency: "GBP",
      taxBehaviour: "NOT_APPLICABLE",
      taxAmountMinor: 0,
      paidAt: "2026-10-04T12:00:00.000Z",
      paymentStatus: "Paid",
      providerLabel: "Card payment through Stripe",
      billToName: "Synthetic Purchasing Business Ltd",
      billToEmail: "alex@example.com",
      billToCountry: "GB",
      contactName: "Alex",
      paymentModel: "UPFRONT",
      standardAmountMinor: null,
      discountAmountMinor: null,
      quotedSubtotalMinor: null,
      sellerVatRegistered: false,
      sellerVatNumber: null,
      sellerLegalName: "ProfileRelaunch Ltd",
      sellerTradingName: "ProfileRelaunch",
      sellerAddress: "71–75 Shelton Street\nCovent Garden\nLondon\nWC2H 9JQ\nUnited Kingdom",
      sellerEmail: "contact@profilerelaunch.com",
      sellerRegistrationNumber: "17520826",
      sellerPlaceOfRegistration: "England and Wales",
      billToCaptured: true,
    })
    const response = await portalReceiptDownload(receiptRequest(`?selector=${selector}`))
    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toContain("application/pdf")
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="receipt-RC-26-ABCDEF.pdf"')
    expect(response.headers.get("cache-control")).toContain("no-store")
    const bytes = new Uint8Array(await response.arrayBuffer())
    expect(Buffer.from(bytes.subarray(0, 5)).toString()).toBe("%PDF-")
    const text = billingPdfText(bytes)
    expect(text).toContain("£99.00")
    expect(text).toContain("RC-26-ABCDEF")
    expect(text).toContain("PR-26-ABCDEF")
    expect(text).toContain("SO-26-ABCDEF")
    expect(text).toContain("Guided Relaunch")
    expect(text).toContain("Paid")
    expect(text).toContain("Card payment through Stripe")
    expect(text).toContain("Not a VAT invoice.")
    expect(text).toContain("Synthetic Purchasing Business Ltd")
    expect(text).toContain("Page 1 of 1")
    expect(text).not.toContain("Save as PDF")
    expect(text).not.toContain(selector)
    expect(text).not.toContain("Harbour Bakery")
    expect(text.replaceAll("Card payment through Stripe", "")).not.toMatch(/pi_|cus_|cs_|pm_|sk_|whsec_|stripe|storage|secret|receipts\//i)
  })

  it("returns a readable PDF for a non-Latin buyer name", async () => {
    mocks.rpc.mockResolvedValue({
      status: "ok",
      receiptRef: "RC-26-NTLAAA",
      reference: "PR-26-NTLAAA",
      orderRef: "SO-26-NTLAAA",
      serviceName: "Guided Relaunch",
      amountMinor: 9900,
      currency: "GBP",
      taxBehaviour: "NOT_APPLICABLE",
      taxAmountMinor: 0,
      paidAt: "2026-10-04T12:00:00.000Z",
      paymentStatus: "Paid",
      providerLabel: "Card payment through Stripe",
      billToName: "নীল রায়",
      billToEmail: "alex@example.com",
      billToCountry: "GB",
      contactName: "राज कुमार",
      paymentModel: "UPFRONT",
      standardAmountMinor: null,
      discountAmountMinor: null,
      quotedSubtotalMinor: null,
      sellerVatRegistered: false,
      sellerVatNumber: null,
      sellerLegalName: "ProfileRelaunch Ltd",
      sellerTradingName: "ProfileRelaunch",
      sellerAddress: "71–75 Shelton Street\nCovent Garden\nLondon\nWC2H 9JQ\nUnited Kingdom",
      sellerEmail: "contact@profilerelaunch.com",
      sellerRegistrationNumber: "17520826",
      sellerPlaceOfRegistration: "England and Wales",
      billToCaptured: true,
    })
    const response = await portalReceiptDownload(receiptRequest(`?selector=${selector}`))
    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toContain("application/pdf")
    const bytes = Buffer.from(await response.arrayBuffer())
    const file = join(mkdtempSync(join(tmpdir(), "billing-route-")), "intl.pdf")
    writeFileSync(file, bytes)
    const extracted = execFileSync("pdftotext", ["-layout", file, "-"], { encoding: "utf8" })
    expect(extracted).toContain("নীল রায়")
    expect(extracted).toContain("राज कुमार")
    expect(extracted).toContain("£99.00")
    expect(response.status).not.toBe(503)
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

  it("withholds the hosted invoice while collection is paused", async () => {
    mocks.rpc.mockResolvedValue({ status: "collection_paused", hostedInvoiceUrl: hosted })
    const response = await portalInvoiceOpen(new NextRequest(
      `${origin}/api/portal/payments/invoice?reference=PR-26-ABCDEF&selector=${actionSelector}`,
      { headers: { cookie: `${portalSessionCookieName()}=${token}` } },
    ))
    expect(response.status).toBe(409)
    expect(response.headers.get("location")).toBeNull()
    const text = await response.text()
    expect(text).toContain("payment link is withheld")
    expect(text).toContain("does not say the payment provider has cancelled")
    expect(text).not.toContain(hosted)
  })

  it("does not redirect a hosted invoice to an untrusted address", async () => {
    const rejected = [
      "https://invoice.stripe.com.evil.example/i/x",
      "https://invoice.stripe.com@evil.example/i/x",
      "https://evil.example/invoice.stripe.com",
      "javascript:alert(1)",
      "//evil.example",
      "https://invoice.stripe.com:444/i/x",
      "https://user:pass@invoice.stripe.com/i/x",
      "https://invoice.stripe.com/i/%00secret",
      "https://invoice.stripe.com/i/%ZZ",
    ]
    for (const hostedInvoiceUrl of rejected) {
      mocks.rpc.mockResolvedValue({ status: "redirect", hostedInvoiceUrl })
      const response = await portalInvoiceOpen(new NextRequest(
        `${origin}/api/portal/payments/invoice?reference=PR-26-ABCDEF&selector=${actionSelector}`,
        { headers: { cookie: `${portalSessionCookieName()}=${token}` } },
      ))
      expect(response.status, hostedInvoiceUrl).not.toBe(307)
      expect(response.headers.get("location")).toBeNull()
      const text = await response.text()
      expect(text).not.toContain("evil.example")
      expect(text).not.toContain("javascript:")
      expect(text).not.toContain(hostedInvoiceUrl)
    }
  })
})
