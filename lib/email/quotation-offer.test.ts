import { describe, expect, it } from "vitest"
import { customerEmailSecurityNote } from "./customer-message"
import { standardScopeExclusions } from "../commercial/scope-templates"
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
    expect(rendered!.subject).toBe("Your ProfileRelaunch quotation QT-26-ABCDEF — Case PR-26-CASE01")
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

  it("summarises the exact Guided Relaunch standard quote without changing stored terms", () => {
    const canonical = standardScopeExclusions("GUIDED_RELAUNCH")!
    const rendered = offer({
      scope: canonical.scope,
      exclusions: canonical.exclusions,
      taxBehaviour: "NOT_APPLICABLE",
      replyTo: "support@profilerelaunch.com",
    })
    expect(rendered).not.toBeNull()
    for (const content of [rendered!.text, rendered!.html]) {
      expect(content).toContain("inclusive of any applicable taxes")
      expect(content).toContain("No additional taxes or mandatory fees charged by ProfileRelaunch.")
      expect(content).toContain("We organise your evidence and prepare the materials")
      expect(content).toContain("You review and submit the prepared materials to Google yourself.")
      expect(content).toContain("The £99 fee is payable upfront through a separate payment step")
      expect(content).toContain("keep your case reference in the subject")
      expect(content).not.toContain("We prepare it. You submit it.")
      expect(content).not.toContain("Managed success fees are payable")
      expect(content).not.toContain("contact us through the ProfileRelaunch website")
    }
    expect(rendered!.text.match(/inclusive of any applicable taxes/g)).toHaveLength(1)
    expect(rendered!.text.match(/No additional taxes or mandatory fees charged by ProfileRelaunch\./g)).toHaveLength(1)
    expect(rendered!.text).not.toContain("Standard wording version")
    expect(rendered!.subject).toContain("Case PR-26-CASE01")
    expect(rendered!.text).toContain("Acceptance does not charge your card.")
    expect(canonical.scope).toContain("We prepare it. You submit it.")
  })

  it("preserves customised quote terms and avoids a new tax claim for historical exclusive pricing", () => {
    const canonical = standardScopeExclusions("GUIDED_RELAUNCH")!
    const customised = offer({
      scope: canonical.scope + "\nSpecific customer requirement.",
      exclusions: canonical.exclusions,
      taxBehaviour: "NOT_APPLICABLE",
      replyTo: "support@profilerelaunch.com",
    })
    expect(customised?.text).toContain("Specific customer requirement.")
    expect(customised?.text).toContain("We prepare it. You submit it.")
    const historical = offer({
      scope: canonical.scope,
      exclusions: canonical.exclusions,
      taxBehaviour: "EXCLUSIVE",
    })
    expect(historical?.text).toContain("Amount: £99.00 GBP")
    expect(historical?.text).not.toContain("Amount: £99.00 GBP — inclusive")
    const noReplyMailbox = offer({
      scope: canonical.scope,
      exclusions: canonical.exclusions,
      taxBehaviour: "NOT_APPLICABLE",
    })
    expect(noReplyMailbox?.text).toContain("contact us through the ProfileRelaunch website")
    expect(noReplyMailbox?.text).not.toContain("simply reply to this email")
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
