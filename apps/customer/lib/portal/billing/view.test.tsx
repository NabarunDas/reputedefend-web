import { readFileSync, writeFileSync } from "node:fs"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"
import { billingComparableLines } from "../../../../../lib/billing/document"
import { billingPdfText, buildBillingPdf } from "../../../../../lib/billing/document-pdf"
import { paymentReceiptDocument } from "../../../../../lib/billing/recorded"
import { BillingDocumentView } from "./view"

const logo = readFileSync(new URL("../../../public/brand/profile-relaunch-logo.png", import.meta.url))

describe("on-screen billing document", () => {
  it("shows the same financial lines as the PDF", () => {
    const document = paymentReceiptDocument({
      state: "PAID",
      reference: "RC-26-NSV9PP",
      issuedOn: "2026-10-26T18:04:00.000Z",
      serviceName: "Guided Relaunch",
      amountMinor: 9900,
      currency: "GBP",
      taxBehaviour: "NOT_APPLICABLE",
      taxAmountMinor: 0,
      paymentModel: "UPFRONT",
      orderReference: "SO-26-ABCDEF",
      caseReference: "PR-26-ABCDEF",
      paymentMethod: "Card payment through Stripe",
      billTo: { name: "Synthetic Purchasing Business Ltd", email: "accounts@example.com", countryCode: "GB", contactName: "Alex Customer" },
    })
    expect(document).not.toBeNull()
    const html = renderToStaticMarkup(<BillingDocumentView document={document!} />)
    const pdf = billingPdfText(buildBillingPdf(document!, logo))
    for (const line of billingComparableLines(document!)) {
      expect(html).toContain(line)
      expect(pdf).toContain(line)
    }
    expect(html).not.toContain("Save as PDF")
    expect(html).not.toContain("<button")
    expect(html).not.toContain("Harbour Bakery")
    expect(pdf).toContain("£99.00")
    expect(pdf).toContain("Amount paid")
    if (process.env.WRITE_BILLING_PREVIEW === "1") {
      const css = readFileSync(new URL("../../../app/globals.css", import.meta.url), "utf8")
      const logoPath = new URL("../../../public/brand/profile-relaunch-logo.png", import.meta.url).pathname
      const body = html.replace('src="/brand/profile-relaunch-logo.png"', `src="file://${logoPath}"`)
      const page = `<!DOCTYPE html><html lang="en-GB"><head><meta charset="utf-8"><title>Receipt RC-26-NSV9PP</title><style>:root{--ink:#10261f;--green:#0a6e3c;--paper:#f7f8f3}body{margin:0;background:var(--paper);font:16px/1.5 Georgia,serif;color:var(--ink)}${css}</style></head><body><div class="billing-page"><p class="billing-page-tools"><a href="/portal/payments">Back to payments</a><a href="/api/portal/payments/receipt">Download RC-26-NSV9PP PDF</a></p>${body}</div></body></html>`
      writeFileSync("/tmp/billing-guided-relaunch-screen.html", page)
    }
  })
})
