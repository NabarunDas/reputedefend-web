import { describe, expect, it } from "vitest"
import { customerEmailSecurityNote } from "../../../../lib/email/customer-message"
import {
  guidedCustomerSubmitsSentence,
  packReadyButton,
  paymentConfirmationButton,
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
}

describe("guided fulfilment email", () => {
  it("confirms a £99 payment with one receipt button and no card or token", () => {
    const rendered = renderPaymentConfirmation({ ...relaunch, orderRef: "SO-26-FULF99" })
    expect(rendered).not.toBeNull()
    expect(rendered!.subject).toBe("Payment received for your ProfileRelaunch Guided Relaunch — PR-26-FULF99 — SO-26-FULF99")
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
    })
    expect(rendered).not.toBeNull()
    expect(rendered!.subject).toBe("Your Guided Review submission pack is ready — PR-26-FULF59")
    expect(rendered!.text).toContain("£59.00 GBP")
    expect(rendered!.text).toContain(guidedCustomerSubmitsSentence)
    expect(rendered!.text).toContain(customerPriceBoundary)
    expect(rendered!.text.match(new RegExp(packReadyButton, "g"))).toHaveLength(1)
    expect(rendered!.pageUrl).toBe(`${origin}/portal/cases/PR-26-FULF59/documents`)
    expect(rendered!.html.match(/\/portal\/cases\//g)).toHaveLength(1)
    expect(rendered!.text).not.toMatch(/ProfileRelaunch submits|we have submitted/i)
  })

  it("uses the accepted amount, including one that is not the catalogue list price", () => {
    const rendered = renderPaymentConfirmation({ ...relaunch, orderRef: "SO-26-FULF99", amountMinor: 7920 })
    expect(rendered).not.toBeNull()
    expect(rendered!.text).toContain("£79.20 GBP")
    expect(rendered!.text).not.toContain("£99.00 GBP")
    expect(renderPackReady({ ...relaunch, amountMinor: 7920 })!.text).toContain("£79.20 GBP")
    expect(renderPaymentConfirmation({ ...relaunch, orderRef: "SO-26-FULF99", amountMinor: 0 })).toBeNull()
    expect(renderPackReady({ ...relaunch, serviceName: "Managed Relaunch" })).toBeNull()
    expect(renderPaymentConfirmation({
      ...relaunch,
      orderRef: "SO-26-FULF99",
      origin: "https://customer.example.test/pay?token=secret#t=1",
    })).toBeNull()
  })
})
