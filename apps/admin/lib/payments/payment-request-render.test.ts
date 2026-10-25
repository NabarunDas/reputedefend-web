import { describe, expect, it } from "vitest"
import { customerEmailSecurityNote } from "../../../../lib/email/customer-message"
import { customerPriceBoundary } from "../../../../lib/pricing"
import {
  paymentRequestOpeningSentence,
  renderPaymentRequest,
} from "../../../../lib/email/payment-request"

const origin = "https://customer.example"
const guided = {
  serviceCode: "GUIDED_RELAUNCH",
  serviceName: "Guided Relaunch",
  orderRef: "SO-26-GHHRGY",
  caseRef: "PR-26-GHNLB9",
  amountMinor: 9900,
  currency: "GBP",
  origin,
  replyTo: "cases@profilerelaunch.com",
}

describe("guided payment-request email", () => {
  it("links Pay £99 securely to the case payments page and does not repeat a quotation", () => {
    const rendered = renderPaymentRequest(guided)
    expect(rendered?.buttonLabel).toBe("Pay £99 securely")
    expect(rendered?.paymentsUrl).toBe(`${origin}/portal/cases/PR-26-GHNLB9/payments`)
    expect(rendered?.subject).toContain("SO-26-GHHRGY")
    expect(rendered?.text).toContain("Guided Relaunch")
    expect(rendered?.text).toContain("Amount: £99.00 GBP")
    expect(rendered?.text).toContain(customerPriceBoundary)
    expect(rendered?.text).toContain(paymentRequestOpeningSentence)
    expect(rendered?.text).toContain(customerEmailSecurityNote)
    expect(rendered?.text).toContain("simply reply to this email")
    expect(rendered?.html).toContain(`href="${origin}/portal/cases/PR-26-GHNLB9/payments"`)
    expect(rendered?.text).not.toContain("#t=")
    expect(rendered?.html).not.toContain("#t=")
    expect(rendered?.text).not.toContain("/action/")
    expect(rendered?.html).not.toContain("/action/")
    expect(rendered?.text).not.toContain("Review and accept quotation")
    expect(rendered?.text).not.toContain("Quotation:")
    expect(renderPaymentRequest(guided)).toEqual(rendered)
  })

  it("uses Pay £59 securely for Guided Review and refuses Managed and Guard", () => {
    const review = renderPaymentRequest({
      ...guided,
      serviceCode: "GUIDED_REVIEW",
      serviceName: "Guided Review",
      amountMinor: 5900,
      replyTo: null,
    })
    expect(review?.buttonLabel).toBe("Pay £59 securely")
    expect(review?.text).toContain("Amount: £59.00 GBP")
    expect(review?.text).toContain("contact us through the ProfileRelaunch website")
    expect(renderPaymentRequest({ ...guided, serviceCode: "MANAGED_RELAUNCH", serviceName: "Managed Relaunch", amountMinor: 29900 })).toBeNull()
    expect(renderPaymentRequest({ ...guided, serviceCode: "MANAGED_REVIEW", serviceName: "Managed Review", amountMinor: 14900 })).toBeNull()
    expect(renderPaymentRequest({ ...guided, serviceCode: "RELAUNCH_GUARD", serviceName: "Relaunch Guard", amountMinor: 999 })).toBeNull()
    expect(renderPaymentRequest({ ...guided, amountMinor: 5900 })).toBeNull()
    expect(renderPaymentRequest({ ...guided, origin: "https://customer.example/portal" })).toBeNull()
    expect(renderPaymentRequest({ ...guided, caseRef: "PR-1" })).toBeNull()
  })
})
