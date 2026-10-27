import { readFileSync } from "node:fs"
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
  })
})
