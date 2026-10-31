import { describe, expect, it } from "vitest"
import { customerEmailSecurityNote } from "../../../../lib/email/customer-message"
import {
  guidedCustomerSubmitsSentence,
  packReadyButton,
  paymentConfirmationButton,
  guidedCompletionGuardSentence,
  guidedServiceCompleteSentence,
  renderGuidedCompletion,
  renderPackReady,
  renderPaymentConfirmation,
} from "../../../../lib/email/fulfilment"
import { customerPriceBoundary } from "../../../../lib/pricing"

const origin = "https://customer.example.test"
const relaunch = {
  serviceCode: "GUIDED_RELAUNCH",
  serviceName: "Guided Relaunch",
  caseRef: "PR-26-FULF99",
  amountMinor: 9900,
  currency: "GBP",
  origin,
  replyTo: "cases@profilerelaunch.com",
}

describe("guided fulfilment email", () => {
  it("confirms a £99 payment with one receipt button and no card or token", () => {
    const rendered = renderPaymentConfirmation({ ...relaunch, orderRef: "SO-26-FULF99", receiptRef: "RC-26-FULF99" })
    expect(rendered).not.toBeNull()
    expect(rendered!.subject).toBe("Payment received — Case PR-26-FULF99")
    expect(rendered!.text).toContain("Service order: SO-26-FULF99")
    expect(rendered!.text).toContain("Receipt number: RC-26-FULF99")
    expect(rendered!.subject).not.toContain("SO-26-FULF99")
    expect(rendered!.text).toContain("£99.00 GBP")
    expect(rendered!.text).toContain(customerPriceBoundary)
    expect(rendered!.text).toContain(customerEmailSecurityNote)
    expect(rendered!.text.match(/View your receipt/g)).toHaveLength(1)
    expect(rendered!.pageUrl).toBe(`${origin}/portal/cases/PR-26-FULF99/payments`)
    expect(rendered!.text.match(/\/portal\/cases\//g)).toHaveLength(1)
    expect(rendered!.html.match(/\/portal\/cases\//g)).toHaveLength(1)
    expect(`${rendered!.text}\n${rendered!.html}`).not.toMatch(/pi_|cus_|#t=|\/action\//)
    expect(rendered!.html).toContain(paymentConfirmationButton)
  })

  it("announces a £59 pack with one portal button and says the customer submits it", () => {
    const rendered = renderPackReady({
      serviceCode: "GUIDED_REVIEW",
      serviceName: "Guided Review",
      caseRef: "PR-26-FULF59",
      amountMinor: 5900,
      currency: "GBP",
      origin,
      replyTo: "cases@profilerelaunch.com",
    })
    expect(rendered).not.toBeNull()
    expect(rendered!.subject).toBe("Your document pack is ready — Case PR-26-FULF59")
    expect(rendered!.text).toContain("£59.00 GBP")
    expect(rendered!.text).toContain(guidedCustomerSubmitsSentence)
    expect(rendered!.text).toContain(customerPriceBoundary)
    expect(rendered!.text.match(new RegExp(packReadyButton, "g"))).toHaveLength(1)
    expect(rendered!.pageUrl).toBe(`${origin}/portal/cases/PR-26-FULF59/documents`)
    expect(rendered!.html.match(/\/portal\/cases\//g)).toHaveLength(1)
    expect(rendered!.text).toContain("Reply to this email")
    expect(rendered!.text).not.toContain("contact us through the ProfileRelaunch website")
    expect(rendered!.text).not.toMatch(/ProfileRelaunch submits|we have submitted/i)
    expect(renderPackReady({ ...relaunch, serviceCode: "GUIDED_REVIEW", serviceName: "Guided Review", caseRef: "PR-26-FULF59", amountMinor: 5900, replyTo: null })).toBeNull()
  })

  it("uses the accepted amount, including one that is not the catalogue list price", () => {
    const rendered = renderPaymentConfirmation({ ...relaunch, orderRef: "SO-26-FULF99", receiptRef: "RC-26-FULF99", amountMinor: 7920 })
    expect(rendered).not.toBeNull()
    expect(rendered!.text).toContain("£79.20 GBP")
    expect(rendered!.text).not.toContain("£99.00 GBP")
    expect(renderPackReady({ ...relaunch, amountMinor: 7920 })!.text).toContain("£79.20 GBP")
    expect(renderGuidedCompletion({ ...relaunch, amountMinor: 7920 })!.text).toContain("£79.20 GBP")
    expect(renderPaymentConfirmation({ ...relaunch, orderRef: "SO-26-FULF99", receiptRef: "RC-26-FULF99", amountMinor: 0 })).toBeNull()
  })

  it("summarises a completed £99 preparation with one pack button and optional Guard", () => {
    const rendered = renderGuidedCompletion(relaunch)
    expect(rendered).not.toBeNull()
    expect(rendered!.subject).toBe("Your case has been completed — Case PR-26-FULF99")
    expect(rendered!.text).toContain("£99.00 GBP")
    expect(rendered!.text).toContain(guidedCustomerSubmitsSentence)
    expect(rendered!.text).toContain(guidedCompletionGuardSentence)
    expect(rendered!.text).toContain(guidedServiceCompleteSentence("Guided Relaunch"))
    expect(rendered!.text).not.toMatch(/reinstated|ProfileRelaunch submitted/i)
    expect(rendered!.text).toContain("Reply to this email if you need a correction")
    expect(rendered!.text).not.toContain("contact us through the ProfileRelaunch website")
    expect(rendered!.text).toContain("Google's later decision is separate")
    expect(rendered!.text).not.toMatch(/enrol you in|ProfileRelaunch submits|we have submitted/i)
    expect(renderGuidedCompletion({ ...relaunch, replyTo: null })).toBeNull()
    expect(rendered!.text.match(new RegExp(packReadyButton, "g"))).toHaveLength(1)
    expect(rendered!.pageUrl).toBe(`${origin}/portal/cases/PR-26-FULF99/documents`)
    expect(`${rendered!.text}\n${rendered!.html}`).not.toMatch(/pi_|cus_|#t=|\/action\//)
  })

  it("refuses a Managed service name, a zero amount, and a token", () => {
    expect(renderPackReady({ ...relaunch, serviceName: "Managed Relaunch" })).toBeNull()
    expect(renderPaymentConfirmation({
      ...relaunch,
      orderRef: "SO-26-FULF99",
      receiptRef: "RC-26-FULF99",
      origin: "https://customer.example.test/pay?token=secret#t=1",
    })).toBeNull()
  })
})
