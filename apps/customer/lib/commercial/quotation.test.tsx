// @vitest-environment jsdom
import React from "react"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import { preservedPaymentTiming, preservedSuccessDefinition, publishedGuidedCopy, publishedGuidedLine, standardScopeExclusions } from "../../../../lib/commercial/scope-templates"
import { CustomerQuotation } from "./quotation"

const hash = "0a8da28dfddcbab53daf037ba952b2f55c5cbf1d4122bebfbcdc285e36c43bc4"

afterEach(cleanup)

function count(text: string, needle: string) {
  return text.split(needle).length - 1
}

function renderGuided(overrides: Partial<React.ComponentProps<typeof CustomerQuotation>> = {}) {
  const template = standardScopeExclusions("GUIDED_RELAUNCH")
  if (!template) throw new Error("missing Guided Relaunch wording")
  return render(
    <CustomerQuotation
      businessName="Harbour Bakery"
      locationName="High Street"
      caseReference="PR-26-RZYCE4"
      quoteReference="QT-26-H6JSMB"
      serviceCode="GUIDED_RELAUNCH"
      serviceName="Guided Relaunch"
      paymentModel="UPFRONT"
      scope={template.scope}
      exclusions={template.exclusions}
      successDefinition={preservedSuccessDefinition.GUIDED_RELAUNCH}
      paymentTiming={preservedPaymentTiming.UPFRONT}
      termsReference={`The service terms sent with this quote apply. Agreement PS-2026-10-14.2 SHA-256 ${hash}.`}
      standardAmountMinor={9900}
      discountAmountMinor={0}
      taxBehaviour="NOT_APPLICABLE"
      taxAmountMinor={0}
      totalAmountMinor={9900}
      currency="GBP"
      validUntilLabel="1 November 2026"
      validUntilIso="2026-11-01T12:00:00.000Z"
      sectionHeading="h3"
      {...overrides}
    />,
  )
}

describe("rendered customer quotation", () => {
  it("shows the offered Guided Relaunch quotation without a repeated explanation", () => {
    renderGuided()
    const summary = document.querySelector(".quotation-summary")
    const text = summary?.textContent ?? ""
    expect(screen.getByText("Harbour Bakery")).toBeTruthy()
    expect(screen.getByText("High Street")).toBeTruthy()
    expect(screen.getByText("PR-26-RZYCE4")).toBeTruthy()
    expect(screen.getByText("QT-26-H6JSMB")).toBeTruthy()
    expect(screen.getByText("Guided Relaunch")).toBeTruthy()
    expect(document.querySelector(".quotation-price")?.textContent).toBe("£99.00")
    expect(screen.getByText("Payment basis: Payable after acceptance, before work starts")).toBeTruthy()
    expect(screen.getByRole("heading", { name: "What ProfileRelaunch will do" })).toBeTruthy()
    expect(screen.getByRole("heading", { name: "What you need to do" })).toBeTruthy()
    expect(screen.getByRole("heading", { name: "What is not included" })).toBeTruthy()
    expect(screen.getByRole("heading", { name: "Quotation wording" })).toBeTruthy()
    expect(screen.getByRole("heading", { name: "Scope" })).toBeTruthy()
    expect(screen.getAllByRole("heading", { name: "When you pay" })).toHaveLength(1)
    expect(screen.queryByRole("heading", { name: "Overview" })).toBeNull()
    expect(screen.queryByRole("heading", { name: "Your part" })).toBeNull()
    expect(screen.queryByRole("heading", { name: "Payment wording on this quotation" })).toBeNull()
    expect(screen.queryByRole("heading", { name: "What counts as success" })).toBeNull()
    expect(count(text, publishedGuidedLine)).toBe(1)
    expect(count(text, publishedGuidedCopy)).toBe(1)
    const records = [...document.querySelectorAll(".quotation-record")].map(node => node.textContent ?? "")
    expect(records.filter(record => record.includes(preservedPaymentTiming.UPFRONT))).toHaveLength(2)
    expect(records.some(record => record.includes("The final customer price is £99 upfront."))).toBe(true)
    expect(records.some(record => record.includes("This quote does not include Managed case work, a success fee, or Relaunch Guard monitoring."))).toBe(true)
    expect(text).not.toContain("£99.00 is due after you accept")
    expect(text).not.toContain("SHA-256")
    expect(text).not.toContain("£9.99")
    expect(text).not.toContain("£299")
    expect(text).not.toContain("£149")
    expect(text).not.toContain("£59")
    expect(text).not.toContain("Standard wording version")
    expect(text).not.toContain("No discount")
  })

  it("renders a negotiated amount in the stored scope and exclusion once", () => {
    const scope = "Includes specialist preparation budget capped at £50. Ask Mr. Smith — clause 4(a)."
    const exclusions = "Does not include related appeal work charged at £75."
    renderGuided({
      scope,
      exclusions,
      paymentTiming: "Pay £99.00 before work. A holding amount of £25 is not collected.",
      successDefinition: "Success means the profile is submitted for reinstatement.",
    })
    const text = document.querySelector(".quotation-summary")?.textContent ?? ""
    expect(screen.getByText(scope)).toBeTruthy()
    expect(screen.getByText(exclusions)).toBeTruthy()
    expect(count(text, "£50")).toBe(1)
    expect(count(text, "£75")).toBe(1)
    expect(count(text, "£25")).toBe(1)
    expect(screen.queryByText(/Payment basis:/)).toBeNull()
    expect(screen.getAllByRole("heading", { name: "When you pay" })).toHaveLength(1)
    expect(screen.queryByRole("heading", { name: "Overview" })).toBeNull()
    expect(screen.queryByRole("heading", { name: "Your part" })).toBeNull()
  })

  it("keeps the rendered quotation on the mobile and print rules", () => {
    renderGuided()
    expect(document.querySelector(".quotation")).toBeTruthy()
    expect(document.querySelector(".quotation-price")).toBeTruthy()
    expect(document.querySelector(".quotation-note")).toBeTruthy()
    expect(document.querySelector(".quotation-prose")).toBeTruthy()
    expect(document.querySelector(".quotation-record")).toBeTruthy()
    const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8")
    const mobileStart = css.indexOf("@media (max-width: 800px)")
    const printStart = css.indexOf("@media print")
    const mobile = css.slice(mobileStart, printStart)
    expect(mobile).toContain(".quotation,")
    expect(mobile).toContain(".quotation-price")
    expect(mobile).toContain(".quotation-actions button")
    expect(mobile).toContain(".quotation-actions { display: grid; }")
    expect(mobile).toContain("width: 100%")
    const printCss = css.slice(printStart)
    expect(printCss).toContain(".quotation-prose")
    expect(printCss).toContain(".quotation-actions,")
    expect(printCss).toContain("display: none !important")
    expect(printCss).toContain(".quotation-record")
    expect(printCss).toContain("break-after: avoid")
    expect(document.querySelector(".quotation-price")?.textContent).toBe("£99.00")
  })
})
