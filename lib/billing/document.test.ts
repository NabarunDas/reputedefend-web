import { execFileSync } from "node:child_process"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { billingPdfText, buildBillingPdf } from "./document-pdf"
import { BillingDocumentError, billingComparableLines, buildBillingDocument, sellerFromLegalIdentity } from "./document"
import { creditNoteDocument, invoiceDocument, paymentReceiptDocument, quotationDocument } from "./recorded"

const logo = readFileSync(new URL("../../apps/customer/public/brand/profile-relaunch-logo.png", import.meta.url))
const issued = "2026-10-26T18:04:00.000Z"
const period = { periodStart: "2026-10-01T00:00:00.000Z", periodEnd: "2026-11-01T00:00:00.000Z" }

function billTo(overrides: { email?: string | null; countryCode?: string | null; contactName?: string | null; name?: string } = {}) {
  return {
    name: overrides.name ?? "Synthetic Purchasing Business Ltd",
    email: overrides.email === undefined ? "accounts@example.com" : overrides.email,
    countryCode: overrides.countryCode === undefined ? "GB" : overrides.countryCode,
    contactName: overrides.contactName === undefined ? "Alex Customer" : overrides.contactName,
  }
}

function paid(serviceName: string, amountMinor: number, reference: string, extra: Record<string, unknown> = {}) {
  return paymentReceiptDocument({
    state: "PAID",
    reference,
    issuedOn: issued,
    serviceName,
    amountMinor,
    currency: "GBP",
    taxBehaviour: "NOT_APPLICABLE",
    taxAmountMinor: 0,
    paymentMethod: "Card payment through Stripe",
    orderReference: "SO-26-ABCDEF",
    caseReference: "PR-26-ABCDEF",
    billTo: billTo(),
    ...extra,
  })
}

function pdfText(document: NonNullable<ReturnType<typeof paid>>) {
  return billingPdfText(buildBillingPdf(document, logo))
}

describe("shared billing documents", () => {
  it("renders each current service from the recorded amount", () => {
    const cases = [
      ["Guided Relaunch", 9900, "RC-26-GUIDED", "£99.00"],
      ["Guided Review", 5900, "RC-26-REVIEW", "£59.00"],
      ["Managed Profile Recovery", 29900, "RC-26-RECOVR", "£299.00"],
      ["Managed Review Protection", 14900, "RC-26-PROTCT", "£149.00"],
      ["Relaunch Guard", 999, "RG-26-GUARDA", "£9.99"],
    ] as const
    for (const [serviceName, amountMinor, reference, amount] of cases) {
      const document = paid(serviceName, amountMinor, reference, serviceName === "Relaunch Guard"
        ? { paymentModel: "RECURRING_MONTHLY", ...period, coveredLocation: "High Street" }
        : serviceName.startsWith("Managed")
          ? { paymentModel: "SUCCESS_FEE" }
          : { paymentModel: "UPFRONT" })
      expect(document?.title).toBe("Receipt")
      expect(document?.status).toBe("Paid")
      const text = pdfText(document!)
      expect(text).toContain(serviceName)
      expect(text).toContain(amount)
      expect(text).toContain(reference)
      expect(text).toContain("Amount paid")
      expect(text).toContain("ProfileRelaunch Ltd")
      expect(text).toContain("Company number 17520826")
      expect(text).toContain("Not a VAT invoice.")
      expect(text).not.toContain("VAT number")
      expect(text).not.toContain("Save as PDF")
      expect(text).toContain("Page 1 of 1")
    }
    const guard = paid("Relaunch Guard", 999, "RG-26-GUARDA", { paymentModel: "RECURRING_MONTHLY", ...period, coveredLocation: "High Street" })
    expect(pdfText(guard!)).toContain("Billing period")
    expect(pdfText(guard!)).toContain("Covered location: High Street")
    expect(pdfText(guard!)).not.toContain("£99.00")
    const recovery = paid("Managed Profile Recovery", 29900, "RC-26-RECOVR", { paymentModel: "SUCCESS_FEE" })
    expect(pdfText(recovery!)).toContain("Success fee")
  })

  it("keeps the recorded receipt RC-26-NSV9PP at the amount received", () => {
    const document = paid("Guided Relaunch", 9900, "RC-26-NSV9PP", { paymentModel: "UPFRONT" })
    const text = pdfText(document!)
    expect(text).toContain("RC-26-NSV9PP")
    expect(text).toContain("£99.00")
    expect(text).toContain("Guided Relaunch")
    expect(text).not.toContain("£59.00")
    expect(text).not.toContain("£299.00")
  })

  it("shows a recorded discount and does not rebuild it when the receipt amount differs", () => {
    const discounted = paid("Managed Profile Recovery", 23920, "RC-26-DISCNT", {
      paymentModel: "SUCCESS_FEE",
      price: { standardAmountMinor: 29900, discountAmountMinor: 5980, quotedSubtotalMinor: 23920 },
    })
    const text = pdfText(discounted!)
    expect(text).toContain("£299.00")
    expect(text).toContain("£59.80")
    expect(text).toContain("Discount")
    expect(text).toContain("£239.20")
    expect(discounted?.totals.find(row => row.label === "Amount paid")?.value).toBe("£239.20")

    const diverged = paid("Managed Profile Recovery", 20000, "RC-26-DIVERG", {
      paymentModel: "SUCCESS_FEE",
      price: { standardAmountMinor: 29900, discountAmountMinor: 5980, quotedSubtotalMinor: 23920 },
    })
    const plain = pdfText(diverged!)
    expect(plain).toContain("£200.00")
    expect(plain).not.toContain("Discount")
    expect(plain).not.toContain("£299.00")
  })

  it("does not issue a receipt for a payment that is still pending or has failed", () => {
    for (const state of ["DUE", "COLLECTING", "AUTHENTICATION_REQUIRED", "FAILED", "VOID", "ACTION_REQUIRED"]) {
      expect(paymentReceiptDocument({
        state,
        reference: "RC-26-UNPAID",
        issuedOn: issued,
        serviceName: "Guided Relaunch",
        amountMinor: 9900,
        currency: "GBP",
        taxBehaviour: "NOT_APPLICABLE",
        taxAmountMinor: 0,
        billTo: billTo(),
      })).toBeNull()
    }
    expect(invoiceDocument({
      state: "PAID",
      reference: "IN-26-PAID01",
      issuedOn: issued,
      serviceName: "Managed Profile Recovery",
      amountMinor: 29900,
      currency: "GBP",
      taxBehaviour: "NOT_APPLICABLE",
      taxAmountMinor: 0,
      billTo: billTo(),
    })).toBeNull()
  })

  it("requests payment on an issued invoice and does not call the amount received", () => {
    const document = invoiceDocument({
      state: "ISSUED",
      reference: "IN-26-DUE001",
      issuedOn: issued,
      serviceName: "Managed Review Protection",
      amountMinor: 14900,
      currency: "GBP",
      taxBehaviour: "NOT_APPLICABLE",
      taxAmountMinor: 0,
      billTo: billTo(),
      orderReference: "SO-26-ABCDEF",
      caseReference: "PR-26-ABCDEF",
    })
    expect(document?.title).toBe("Invoice")
    expect(document?.status).toBe("Payment due")
    const text = pdfText(document!)
    expect(text).toContain("Payment has not been received.")
    expect(text).toContain("Invoice details")
    expect(text).toContain("Amount paid")
    expect(text).toContain("£0.00")
    expect(text).toContain("Outstanding")
    expect(text).toContain("£149.00")
    expect(document?.totals.find(row => row.label === "Amount paid")?.value).toBe("£0.00")
  })

  it("writes a credit note beside the original receipt", () => {
    const original = paid("Relaunch Guard", 999, "RG-26-ORIGIN", { paymentModel: "RECURRING_MONTHLY", ...period })
    const credit = creditNoteDocument({
      state: "SUCCEEDED",
      reference: "CN-26-CREDIT",
      issuedOn: "2026-10-27T09:00:00.000Z",
      serviceName: "Relaunch Guard",
      amountMinor: 999,
      currency: "GBP",
      billTo: billTo(),
      originalReference: "RG-26-ORIGIN",
    })
    expect(creditNoteDocument({
      state: "PENDING",
      reference: "CN-26-CREDIT",
      issuedOn: issued,
      serviceName: "Relaunch Guard",
      amountMinor: 999,
      currency: "GBP",
      billTo: billTo(),
    })).toBeNull()
    const originalText = pdfText(original!)
    const creditText = pdfText(credit!)
    expect(originalText).toContain("RG-26-ORIGIN")
    expect(originalText).toContain("Amount paid")
    expect(originalText).not.toContain("CN-26-CREDIT")
    expect(creditText).toContain("Credit note")
    expect(creditText).toContain("CN-26-CREDIT")
    expect(creditText).toContain("RG-26-ORIGIN")
    expect(creditText).toContain("Does not change the original receipt.")
    expect(creditText).toContain("Credit details")
    expect(creditText).not.toContain("Amount paid")
  })

  it("omits billing details that were not recorded", () => {
    const document = paid("Guided Review", 5900, "RC-26-NOADDR", {
      paymentModel: "UPFRONT",
      billTo: billTo({ email: null, countryCode: null, contactName: null, name: "Alex" }),
    })
    const text = pdfText(document!)
    expect(text).toContain("Alex")
    expect(text).not.toContain("accounts@example.com")
    expect(text).not.toContain("Country")
    expect(text).not.toContain("High Street")
    expect(text).toContain("71")
  })

  it("keeps two receipts for the same customer distinct", () => {
    const first = paid("Guided Relaunch", 9900, "RC-26-FIRST1", { paymentModel: "UPFRONT" })
    const second = paid("Guided Review", 5900, "RC-26-SECOND", { paymentModel: "UPFRONT", orderReference: "SO-26-SECOND" })
    expect(pdfText(first!)).toContain("RC-26-FIRST1")
    expect(pdfText(first!)).not.toContain("RC-26-SECOND")
    expect(pdfText(second!)).toContain("£59.00")
    expect(pdfText(second!)).toContain("SO-26-SECOND")
  })

  it("quotes the proposed total before payment", () => {
    const document = quotationDocument({
      reference: "QT-26-OFFER1",
      issuedOn: issued,
      serviceName: "Guided Relaunch",
      currency: "GBP",
      taxBehaviour: "NOT_APPLICABLE",
      taxAmountMinor: 0,
      totalMinor: 9900,
      standardAmountMinor: 9900,
      discountAmountMinor: 0,
      quotedSubtotalMinor: 9900,
      billTo: billTo(),
      caseReference: "PR-26-ABCDEF",
      validUntil: "2026-11-26T00:00:00.000Z",
      paymentModel: "UPFRONT",
    })
    expect(document.title).toBe("Quotation")
    expect(document.status).toBe("Proposed")
    const text = pdfText(document)
    expect(text).toContain("£99.00")
    expect(text).toContain("Amount due")
    expect(text).not.toContain("Amount paid")
    expect(text).toContain("Proposed service and agreed total.")
    expect(text).toContain("Quotation details")
  })

  it("prints the same financial lines the screen is given", () => {
    const document = paid("Guided Relaunch", 9900, "RC-26-NSV9PP", { paymentModel: "UPFRONT" })!
    const text = pdfText(document)
    for (const line of billingComparableLines(document)) {
      expect(text, line).toContain(line)
    }
    expect(text).not.toMatch(/pi_|cus_|cs_|ch_/)
    expect(text).toContain("Payment details")
  })

  it("shows included tax as part of the gross and exclusive tax as an addition", () => {
    const seller = sellerFromLegalIdentity()
    const inclusive = buildBillingDocument({
      kind: "receipt",
      reference: "RC-26-INCL01",
      issuedOn: issued,
      currency: "GBP",
      seller,
      billTo: { name: "Inclusive Buyer Ltd" },
      lines: [{ description: "Recorded service", quantity: 1, unitAmountMinor: 12000 }],
      taxBehaviour: "INCLUSIVE",
      taxMinor: 2000,
      totalMinor: 12000,
    })
    expect(inclusive.totals.map(row => `${row.label} ${row.value}`)).toEqual([
      "Net £100.00",
      "Tax included £20.00",
      "Total £120.00",
      "Amount paid £120.00",
      "Outstanding £0.00",
    ])
    const discounted = buildBillingDocument({
      kind: "receipt",
      reference: "RC-26-INCL02",
      issuedOn: issued,
      currency: "GBP",
      seller,
      billTo: { name: "Inclusive Buyer Ltd" },
      lines: [{ description: "Recorded service", quantity: 1, unitAmountMinor: 15000 }],
      discountMinor: 3000,
      taxBehaviour: "INCLUSIVE",
      taxMinor: 2000,
      totalMinor: 12000,
    })
    expect(discounted.totals.map(row => row.label)).toEqual(["Subtotal", "Discount", "Net", "Tax included", "Total", "Amount paid", "Outstanding"])
    expect(discounted.totals.find(row => row.label === "Net")?.value).toBe("£100.00")
    expect(discounted.totals.find(row => row.label === "Total")?.value).toBe("£120.00")
    const exclusive = buildBillingDocument({
      kind: "invoice",
      reference: "IN-26-EXCL01",
      issuedOn: issued,
      currency: "GBP",
      seller: { ...seller, vatRegistered: true, vatNumber: "GB123456789" },
      billTo: { name: "Exclusive Buyer Ltd" },
      lines: [{ description: "Recorded service", quantity: 1, unitAmountMinor: 10000 }],
      taxBehaviour: "EXCLUSIVE",
      taxMinor: 2000,
      totalMinor: 12000,
    })
    expect(exclusive.title).toBe("VAT Invoice")
    expect(exclusive.totals.map(row => `${row.label} ${row.value}`)).toEqual([
      "Subtotal £100.00",
      "VAT £20.00",
      "Total £120.00",
      "Amount paid £0.00",
      "Outstanding £120.00",
    ])
    expect(exclusive.sellerMeta.join(" ")).toContain("GB123456789")
    const plain = paid("Guided Relaunch", 9900, "RC-26-NOTAX1")!
    expect(plain.totals.some(row => row.label.includes("Tax") || row.label.includes("VAT"))).toBe(false)
    expect(() => buildBillingDocument({
      kind: "invoice",
      reference: "IN-26-NOVAT1",
      issuedOn: issued,
      currency: "GBP",
      seller: { ...seller, vatRegistered: true },
      billTo: { name: "Missing VAT Buyer Ltd" },
      lines: [{ description: "Recorded service", quantity: 1, unitAmountMinor: 14900 }],
      taxBehaviour: "NOT_APPLICABLE",
      taxMinor: 0,
      totalMinor: 14900,
    })).toThrow(BillingDocumentError)
  })

  it("labels an unsettled Guard record without calling it the payment date", () => {
    const recorded = paid("Relaunch Guard", 999, "RG-26-UNSET1", { paymentModel: "RECURRING_MONTHLY", ...period, paymentSettled: false })!
    expect(recorded.details.map(row => row.label)).toContain("Recorded")
    expect(recorded.details.map(row => row.label)).not.toContain("Payment date")
    expect(pdfText(recorded)).toContain("Billing period")
    const settled = paid("Relaunch Guard", 999, "RG-26-SETTL1", { paymentModel: "RECURRING_MONTHLY", ...period, paymentSettled: true })!
    expect(settled.details.map(row => row.label)).toContain("Payment date")
  })

  it("draws international names and wraps a long detail onto later pages", () => {
    const document = buildBillingDocument({
      kind: "receipt",
      reference: "RC-26-WORLD1",
      issuedOn: issued,
      currency: "GBP",
      seller: sellerFromLegalIdentity(),
      billTo: {
        name: "নীল রায়",
        lines: ["राज कुमार", "Αθήνα", "王伟", "نور"],
      },
      lines: [{ description: "Guided Relaunch", quantity: 1, unitAmountMinor: 9900 }],
      taxBehaviour: "NOT_APPLICABLE",
      taxMinor: 0,
      totalMinor: 9900,
      details: [{ label: "Buyer", value: "নীল রায়" }],
    })
    const pdf = buildBillingPdf(document, logo)
    const dir = mkdtempSync(join(tmpdir(), "billing-"))
    const file = join(dir, "world.pdf")
    writeFileSync(file, pdf)
    const extracted = execFileSync("pdftotext", ["-layout", file, "-"], { encoding: "utf8" })
    expect(extracted).toContain("নীল রায়")
    expect(extracted).toContain("राज कुमार")
    expect(extracted).toContain("Αθήνα")
    expect(extracted).toContain("王伟")
    const source = Buffer.from(pdf).toString("latin1")
    expect(source).toContain("0646")
    try {
      buildBillingDocument({
        kind: "receipt",
        reference: "RC-26-EMOJI1",
        issuedOn: issued,
        currency: "GBP",
        seller: sellerFromLegalIdentity(),
        billTo: { name: "Alex 😀" },
        lines: [{ description: "Guided Relaunch", quantity: 1, unitAmountMinor: 9900 }],
        taxBehaviour: "NOT_APPLICABLE",
        taxMinor: 0,
        totalMinor: 9900,
      })
      buildBillingPdf(buildBillingDocument({
        kind: "receipt",
        reference: "RC-26-EMOJI1",
        issuedOn: issued,
        currency: "GBP",
        seller: sellerFromLegalIdentity(),
        billTo: { name: "Alex 😀" },
        lines: [{ description: "Guided Relaunch", quantity: 1, unitAmountMinor: 9900 }],
        taxBehaviour: "NOT_APPLICABLE",
        taxMinor: 0,
        totalMinor: 9900,
      }), logo)
      throw new Error("emoji was accepted")
    } catch (error) {
      expect(error).toBeInstanceOf(Error)
      const message = error instanceof Error ? error.message : ""
      expect(message).toBe("This document uses a character the PDF fonts cannot draw.")
      expect(message).not.toContain("😀")
    }
    const long = buildBillingDocument({
      kind: "invoice",
      reference: "IN-26-LONG01",
      issuedOn: issued,
      currency: "GBP",
      seller: sellerFromLegalIdentity(),
      billTo: { name: "Long Detail Purchasing Limited" },
      lines: Array.from({ length: 28 }, (_, index) => ({
        description: `Service line ${index + 1} with a description long enough to wrap inside the table`,
        quantity: 1,
        unitAmountMinor: 100,
      })),
      taxBehaviour: "NOT_APPLICABLE",
      taxMinor: 0,
      totalMinor: 2800,
      details: [{ label: "Narrative", value: "Warehouse ".repeat(40).trim() }],
    })
    const longText = pdfText(long)
    expect(longText).toContain("Page 1 of")
    expect(longText).not.toContain("Page 1 of 1")
    expect(longText).toContain("Warehouse")
    expect(longText).toContain("Invoice details")
  })
})
