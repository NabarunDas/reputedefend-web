import { describe, expect, it } from "vitest"
import { customerEmailSecurityNote } from "./customer-message"
import {
  publishedCustomerPriceLabels,
  quotationButtonLabel,
  quotationIndependenceSentence,
  quotationLinkExpirySentence,
  quotationWordingMarker,
  renderQuotationOffer,
} from "./quotation-offer"

const actionUrl = "https://customer.example/action/00000000-0000-4000-8000-000000000001"
const validUntil = "2026-11-03T12:00:00.000Z"

function offer(overrides: Partial<Parameters<typeof renderQuotationOffer>[0]> = {}) {
  return renderQuotationOffer({
    publicRef: "QT-26-ABCDEF",
    caseRef: "PR-26-CASE01",
    serviceName: "Guided Relaunch",
    amountMinor: 9900,
    currency: "GBP",
    paymentModel: "UPFRONT",
    scope: "Recover the suspended profile for this location.",
    exclusions: "Google decisions stay outside this quotation.",
    validUntil,
    actionUrl,
    ...overrides,
  })
}

describe("quotation offer email", () => {
  it("renders the service amount, scope, button and security wording without a bearer", () => {
    const rendered = offer()
    expect(rendered).not.toBeNull()
    expect(rendered!.subject).toBe("Your ProfileRelaunch quotation QT-26-ABCDEF")
    expect(rendered!.text).toContain("Amount: £99.00 GBP")
    expect(rendered!.text).toContain("Payment: Upfront")
    expect(rendered!.text).toContain("Service: Guided Relaunch")
    expect(rendered!.text).toContain("Included in this quotation")
    expect(rendered!.text).toContain("Recover the suspended profile for this location.")
    expect(rendered!.text).toContain("Not included")
    expect(rendered!.text).toContain("Google decisions stay outside this quotation.")
    expect(rendered!.text).toContain("This quotation is valid until 3 November 2026.")
    expect(rendered!.text).toContain(quotationLinkExpirySentence)
    expect(rendered!.text).toContain(quotationButtonLabel)
    expect(rendered!.html).toContain(quotationButtonLabel)
    expect(rendered!.text).toContain(actionUrl)
    expect(rendered!.html).toContain(actionUrl)
    expect(rendered!.text).not.toContain("#t=")
    expect(rendered!.html).not.toContain("#t=")
    expect(rendered!.text).toContain(quotationIndependenceSentence)
    expect(rendered!.text).toContain(customerEmailSecurityNote)
    expect(rendered!.html).toContain(customerEmailSecurityNote)
    expect(rendered!.text).toContain("https://profilerelaunch.com")
    for (const label of publishedCustomerPriceLabels) {
      if (label !== "£99.00") expect(rendered!.text).not.toContain(label)
    }
  })

  it("uses each service price without borrowing another service's amount", () => {
    const cases = [
      ["Guided Review", 5900, "UPFRONT", "£59.00"],
      ["Managed Relaunch", 29900, "SUCCESS_FEE", "£299.00"],
      ["Managed Review", 14900, "SUCCESS_FEE", "£149.00"],
      ["Relaunch Guard", 999, "RECURRING_MONTHLY", "£9.99"],
    ] as const
    for (const [serviceName, amountMinor, paymentModel, own] of cases) {
      const rendered = offer({ serviceName, amountMinor, paymentModel, publicRef: "QT-26-OTHER01" })
      expect(rendered?.text).toContain(`Amount: ${own} GBP`)
      expect(rendered?.text).toContain(`Service: ${serviceName}`)
      for (const label of publishedCustomerPriceLabels) {
        if (label !== own) expect(rendered?.text).not.toContain(label)
      }
    }
  })

  it("drops the wording-version line and refuses a preserved quotation or an unsafe introduction", () => {
    const rendered = offer({
      scope: "Recover the suspended profile for this location.\nStandard wording version SCOPE-2026-10-21.3.",
    })
    expect(rendered?.text).toContain("Recover the suspended profile for this location.")
    expect(rendered?.text).not.toContain(quotationWordingMarker)
    expect(offer({ introduction: "Please open https://example.com before you accept." })).toBeNull()
    expect(offer({ subject: "A quotation without the reference" })).toBeNull()
    expect(offer({ scope: "This quote also costs £59.00." })).toBeNull()
  })
})
