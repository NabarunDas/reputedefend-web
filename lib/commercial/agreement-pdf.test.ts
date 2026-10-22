import { describe, expect, it } from "vitest"
import { agreementBlocks } from "./agreement-render"
import { buildAgreementPdf, pdfPlainText } from "./agreement-pdf"
import { paidServiceAgreementBody, paidServiceAgreementContentHash } from "./paid-service-agreement"
import { proposedServiceAgreement } from "./service-agreements"

function compact(text: string) {
  return text.replace(/\s+/g, " ").trim()
}

describe("branded agreement PDF", () => {
  it("contains the exact frozen wording, including pounds, dashes and the version line", () => {
    const pdf = buildAgreementPdf(paidServiceAgreementBody)
    const source = Buffer.from(pdf).toString("latin1")
    expect(source.startsWith("%PDF-1.4\n")).toBe(true)
    const start = source.match(/startxref\n(\d+)\n%%EOF\n$/)
    expect(start).not.toBeNull()
    expect(source.slice(Number(start?.[1]), Number(start?.[1]) + 4)).toBe("xref")
    const text = compact(pdfPlainText(pdf))
    expect(text).toContain("ProfileRelaunch Ltd — Paid-service agreement")
    expect(text).toContain("Version PS-2026-10-14.2")
    expect(text).toContain("71–75 Shelton Street")
    expect(text).toContain("greater of £1,000 or twice the fee")
    expect(text).toContain("We’ll remind you before the period ends.")
    expect(text).not.toContain("## ")
    expect(text).not.toContain("SHA-256")
    expect(text).not.toContain(paidServiceAgreementContentHash)
    for (const block of agreementBlocks(paidServiceAgreementBody)) {
      expect(text).toContain(compact(block.text))
    }
  })

  it("uses the proposed Guided wording without the other service prices", () => {
    const guided = proposedServiceAgreement("GUIDED_RELAUNCH")
    expect(guided).not.toBeNull()
    const text = compact(pdfPlainText(buildAgreementPdf(guided!.body)))
    expect(text).toContain("The price is £99 unless the accepted quotation states a different price.")
    expect(text).toContain("does not require you to add us as a Manager")
    expect(text).not.toContain("£9.99")
    expect(text).not.toContain("£299")
    expect(text).not.toContain("£59")
    expect(text).not.toContain("£149")
    expect(text).not.toContain("SHA-256")
  })
})
