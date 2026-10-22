import { describe, expect, it } from "vitest"
import { paidServiceAgreementBody } from "./paid-service-agreement"
import { agreementBlocks, agreementPlainText, customerFacingTerms } from "./agreement-render"

describe("agreement rendering", () => {
  it("turns the frozen agreement into headings and paragraphs without dropping wording", () => {
    const blocks = agreementBlocks(paidServiceAgreementBody)
    const headings = blocks.filter(block => block.kind === "heading").map(block => block.text)
    expect(headings).toContain("1. Formation")
    expect(headings).toContain("8. Your obligations")
    expect(headings).toContain("13. Relaunch Guard")
    expect(headings).toContain("16. Liability")
    expect(headings).toContain("19. Governing law and disputes")
    expect(agreementPlainText(blocks)).not.toContain("## ")
    for (const block of blocks) expect(paidServiceAgreementBody).toContain(block.text)
    expect(blocks.some(block => block.kind === "paragraph" && block.text.includes("greater of £1,000 or twice the fee"))).toBe(true)
    expect(blocks.some(block => block.kind === "paragraph" && block.text.includes("Relaunch Guard is £9.99 per month per location."))).toBe(true)
    expect(blocks.some(block => block.kind === "paragraph" && block.text.startsWith("Version PS-2026-10-14.2"))).toBe(true)
  })

  it("hides only the technical terms suffix and a version-only terms line", () => {
    const hash = "0a8da28dfddcbab53daf037ba952b2f55c5cbf1d4122bebfbcdc285e36c43bc4"
    expect(customerFacingTerms(`Service terms as published at quote time. Agreement PS-2026-10-14.2 SHA-256 ${hash}.`)).toBe("Service terms as published at quote time.")
    expect(customerFacingTerms("Agreement PS-2026-10-14.2.")).toBeNull()
    expect(customerFacingTerms("The service terms sent with this quote apply.")).toBe("The service terms sent with this quote apply.")
    expect(customerFacingTerms(`Agreement PS-2026-10-21.GR SHA-256 ${"ab".repeat(32)}.`)).toBeNull()
    expect(customerFacingTerms(`Agreement PS-2026-10-22.GR SHA-256 ${"ab".repeat(32)}.`)).toBeNull()
  })
})
