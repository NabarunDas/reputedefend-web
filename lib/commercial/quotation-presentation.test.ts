import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { presentCustomerQuotation, QUOTATION_ACCEPTANCE, QUOTATION_OVERVIEW_NOTE } from "./quotation-presentation"
import { customerFacingScope, preservedPaymentTiming, preservedSuccessDefinition, standardScopeExclusions } from "./scope-templates"

const hash = "0a8da28dfddcbab53daf037ba952b2f55c5cbf1d4122bebfbcdc285e36c43bc4"

function quote(serviceCode: string, total: number, paymentModel: string) {
  const template = standardScopeExclusions(serviceCode)
  if (!template) throw new Error(serviceCode)
  return presentCustomerQuotation({
    serviceCode,
    serviceName: serviceCode,
    paymentModel,
    scope: template.scope,
    exclusions: template.exclusions,
    successDefinition: preservedSuccessDefinition[serviceCode as keyof typeof preservedSuccessDefinition],
    paymentTiming: paymentModel === "SUCCESS_FEE"
      ? preservedPaymentTiming.SUCCESS_FEE
      : paymentModel === "RECURRING_MONTHLY"
        ? preservedPaymentTiming.RECURRING_MONTHLY
        : preservedPaymentTiming.UPFRONT,
    termsReference: `The service terms sent with this quote apply. Agreement PS-2026-10-14.2 SHA-256 ${hash}.`,
    standardAmountMinor: total,
    discountAmountMinor: 0,
    taxBehaviour: "NOT_APPLICABLE",
    taxAmountMinor: 0,
    totalAmountMinor: total,
    currency: "GBP",
  })
}

describe("customer quotation presentation", () => {
  it("shows one Guided Relaunch price and does not show other services", () => {
    const guided = quote("GUIDED_RELAUNCH", 9900, "UPFRONT")
    const text = JSON.stringify(guided)
    expect(guided.total).toBe("£99.00")
    expect(guided.priceRows).toEqual([])
    expect(guided.successDefinition).toBeNull()
    expect(guided.paymentSummary).toBe("£99.00 is due after you accept this quotation and before work begins. Accepting this quotation does not take payment.")
    expect(guided.paymentWording).toBe(preservedPaymentTiming.UPFRONT)
    expect(guided.scope).toContain("The final customer price is £99 upfront.")
    expect(guided.exclusions).toContain("This quote does not include Managed case work, a success fee, or Relaunch Guard monitoring.")
    expect(guided.overviewNote).toBe(QUOTATION_OVERVIEW_NOTE)
    expect(guided.responsibilities).toContain("We prepare it. You submit it.")
    expect(guided.responsibilities).not.toContain("Manager")
    expect(guided.terms).toBe("The service terms sent with this quote apply.")
    expect(text).not.toContain("No discount")
    expect(text).not.toContain("£9.99")
    expect(text).not.toContain("£299")
    expect(text).not.toContain("£149")
    expect(text).not.toContain("£59")
    expect(text).not.toContain("48 hours")
    expect(text).not.toContain("30 days")
    expect(text).not.toContain("SHA-256")
    expect(text).not.toContain("Standard wording version")
    expect(QUOTATION_ACCEPTANCE).not.toMatch(/SHA-256|PS-/)
  })

  it("keeps each service's own price, payment and success rule", () => {
    const review = quote("GUIDED_REVIEW", 5900, "UPFRONT")
    expect(review.total).toBe("£59.00")
    expect(review.successDefinition).toBeNull()
    expect(JSON.stringify(review)).not.toContain("£99")
    expect(JSON.stringify(review)).not.toContain("£9.99")

    const managed = quote("MANAGED_RELAUNCH", 29900, "SUCCESS_FEE")
    expect(managed.total).toBe("£299.00")
    expect(managed.successDefinition).toContain("successful restoration outcome")
    expect(managed.scope).toContain("48 hours")
    expect(managed.paymentWording).toBe(preservedPaymentTiming.SUCCESS_FEE)
    expect(managed.assurance).toContain("does not create an invoice")
    expect(JSON.stringify(managed)).not.toContain("£9.99")
    expect(JSON.stringify(managed)).not.toContain("£149")

    const removal = quote("MANAGED_REVIEW", 14900, "SUCCESS_FEE")
    expect(removal.total).toBe("£149.00")
    expect(removal.successDefinition).toContain("successful removal outcome")
    expect(removal.scope).toContain("48 hours")
    expect(JSON.stringify(removal)).not.toContain("£299")
    expect(JSON.stringify(removal)).not.toContain("£9.99")

    const guard = quote("RELAUNCH_GUARD", 999, "RECURRING_MONTHLY")
    expect(guard.total).toBe("£9.99")
    expect(guard.successDefinition).toBeNull()
    expect(guard.paymentSummary).toContain("does not start monitoring and does not take payment")
    expect(guard.paymentWording).toBe(preservedPaymentTiming.RECURRING_MONTHLY)
    expect(guard.responsibilities).toContain("Manager")
    expect(JSON.stringify(guard)).not.toContain("£99")
    expect(JSON.stringify(guard)).not.toContain("£299")
  })

  it("shows a discount and recorded tax once, and keeps a custom stored payment line", () => {
    const discounted = presentCustomerQuotation({
      serviceCode: "GUIDED_RELAUNCH",
      serviceName: "Guided Relaunch",
      paymentModel: "UPFRONT",
      scope: "We prepare the profile relaunch for this location.",
      exclusions: "Directory listings outside this location are excluded.",
      successDefinition: "Success means the profile is submitted for reinstatement.",
      paymentTiming: "You pay the quoted amount before work starts.",
      termsReference: "The service terms sent with this quote apply.",
      standardAmountMinor: 29900,
      discountAmountMinor: 5980,
      quotedAmountMinor: 23920,
      taxBehaviour: "EXCLUSIVE",
      taxAmountMinor: 4784,
      totalAmountMinor: 28704,
      currency: "GBP",
    })
    expect(discounted.priceRows.map(row => row.amount)).toEqual(["£299.00", "£59.80", "£239.20", "£47.84"])
    expect(discounted.priceRows.map(row => row.label)).toContain("Recorded tax")
    expect(discounted.total).toBe("£287.04")
    expect(discounted.successDefinition).toBeNull()
    expect(discounted.paymentSummary).toBeNull()
    expect(discounted.paymentWording).toBe("You pay the quoted amount before work starts.")
    expect(discounted.scope).toBe("We prepare the profile relaunch for this location.")
    expect(discounted.exclusions).toBe("Directory listings outside this location are excluded.")
  })

  it("keeps negotiated amounts, punctuation and the stored scope verbatim", () => {
    const scope = "Includes specialist preparation budget capped at £50. Ask Mr. Smith — clause 4(a).\n\nSecond paragraph keeps the £75.00 figure."
    const exclusions = "Does not include related appeal work charged at £75.\n\nThe cap stays £50; it is not redrawn."
    const storedScope = `${scope}\n\nStandard wording version SCOPE-2026-10-21.3.`
    const presented = presentCustomerQuotation({
      serviceCode: "GUIDED_RELAUNCH",
      serviceName: "Guided Relaunch",
      paymentModel: "UPFRONT",
      scope: storedScope,
      exclusions: `  ${exclusions}  `,
      successDefinition: "Success means the profile is submitted for reinstatement.",
      paymentTiming: "Pay £99.00 before work. A separate holding amount of £25 is not collected.",
      termsReference: "The service terms sent with this quote apply.",
      standardAmountMinor: 9900,
      discountAmountMinor: 0,
      taxBehaviour: "NOT_APPLICABLE",
      taxAmountMinor: 0,
      totalAmountMinor: 9900,
      currency: "GBP",
    })
    expect(presented.scope).toBe(customerFacingScope(storedScope))
    expect(presented.scope).toBe(scope)
    expect(presented.scope).toContain("£50")
    expect(presented.scope).toContain("£75.00")
    expect(presented.scope).toContain("Mr. Smith")
    expect(presented.exclusions).toBe(exclusions)
    expect(presented.exclusions).toContain("£75")
    expect(presented.paymentWording).toContain("£25")
    expect(presented.successDefinition).toBeNull()
    expect(presented.scope).not.toContain("ProfileRelaunch prepares the profile relaunch work")
    const embedded = presentCustomerQuotation({
      serviceCode: "GUIDED_RELAUNCH",
      serviceName: "Guided Relaunch",
      paymentModel: "UPFRONT",
      scope: "Before.\n\nStandard wording version SCOPE-2026-10-21.3.\n\nAfter, capped at £50.",
      exclusions: "None beyond the £50 cap.",
      successDefinition: "",
      paymentTiming: "Pay later.",
      termsReference: "",
      standardAmountMinor: 9900,
      discountAmountMinor: 0,
      taxBehaviour: "NOT_APPLICABLE",
      taxAmountMinor: 0,
      totalAmountMinor: 9900,
      currency: "GBP",
    })
    expect(embedded.scope).toContain("Standard wording version SCOPE-2026-10-21.3.")
    expect(embedded.scope).toContain("capped at £50")
  })

  it("styles the quotation for a narrow screen and for print", () => {
    const css = readFileSync(new URL("../../apps/customer/app/globals.css", import.meta.url), "utf8")
    expect(css).toContain("@media (max-width: 800px)")
    expect(css).toContain(".quotation-price")
    expect(css).toContain(".quotation-note")
    expect(css).toContain(".quotation-record")
    expect(css).toContain("white-space: pre-wrap")
    expect(css).toContain("@media print")
    expect(css).toContain(".agreement-document")
  })
})
