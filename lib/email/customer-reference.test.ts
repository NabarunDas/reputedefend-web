import { describe, expect, it } from "vitest"
import { renderEvidenceRequest } from "./evidence-request"
import { renderGuidedCompletion, renderPackReady, renderPaymentConfirmation } from "./fulfilment"
import { renderManagedNotice } from "./managed-journey"
import { renderPaymentRequest } from "./payment-request"
import { renderQuotationOffer } from "./quotation-offer"
import { customerCaseSubject } from "./customer-reference"

const origin = "https://customer.example"
const replyTo = "cases@profilerelaunch.com"
const actionUrl = "https://customer.example/action/00000000-0000-4000-8000-000000000001"
const uploadUrl = "https://customer.example/action/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"

function assertCaseLed(subject: string, text: string, html: string, caseRef: string, secondary: string[]) {
  expect(subject).toBe(subject.trim())
  expect(subject).toContain(`Case ${caseRef}`)
  expect(subject.endsWith(caseRef)).toBe(true)
  for (const reference of secondary) {
    expect(subject).not.toContain(reference)
    const labelled = text.includes(`Quotation number: ${reference}`)
      || text.includes(`Service order: ${reference}`)
      || text.includes(`Receipt number: ${reference}`)
    expect(labelled).toBe(true)
    expect(html).toContain(reference)
  }
  expect(text).toContain(`Case reference: ${caseRef}`)
  expect(html).toContain(`Case reference: ${caseRef}`)
  expect(text).toContain(caseRef)
  expect(`${subject}\n${text}\n${html}`).not.toMatch(/pi_|cus_|#t=/)
}

describe("customer reference consistency", () => {
  it.each([
    ["PR-26-CASEAA", "QT-26-QTAAAA", "SO-26-SRVCA2", "RC-26-RCPTA2", "GUIDED_RELAUNCH", "Guided Relaunch", 9900],
    ["RV-26-REVW2K", "QT-26-QTBBBB", "SO-26-SRVCB2", "RC-26-RCPTB2", "GUIDED_REVIEW", "Guided Review", 5900],
  ] as const)("keeps %s primary from quotation through receipt", (caseRef, quoteRef, orderRef, receiptRef, serviceCode, serviceName, amountMinor) => {
    const quotation = renderQuotationOffer({
      publicRef: quoteRef,
      caseRef,
      serviceName,
      amountMinor,
      currency: "GBP",
      paymentModel: "UPFRONT",
      scope: "Prepare the materials for this location.",
      exclusions: "Google decisions stay outside this quotation.",
      validUntil: "2026-11-03T12:00:00.000Z",
      actionUrl,
      replyTo,
    })
    const payment = renderPaymentRequest({
      serviceCode,
      serviceName,
      orderRef,
      caseRef,
      amountMinor,
      currency: "GBP",
      origin,
      replyTo,
    })
    const confirmation = renderPaymentConfirmation({
      serviceCode,
      serviceName,
      orderRef,
      caseRef,
      receiptRef,
      amountMinor,
      currency: "GBP",
      origin,
      replyTo,
    })
    const pack = renderPackReady({ serviceCode, serviceName, caseRef, amountMinor, currency: "GBP", origin, replyTo })
    const completion = renderGuidedCompletion({ serviceCode, serviceName, caseRef, amountMinor, currency: "GBP", origin, replyTo })
    const documents = renderEvidenceRequest({
      caseRef,
      documents: ["Shop licence"],
      uploadUrl,
      replyTo,
    })
    expect(quotation).not.toBeNull()
    expect(payment).not.toBeNull()
    expect(confirmation).not.toBeNull()
    expect(pack).not.toBeNull()
    expect(completion).not.toBeNull()
    expect(documents).not.toBeNull()

    expect(quotation!.subject).toBe(customerCaseSubject("Your quotation is ready", caseRef))
    expect(documents!.subject).toBe(customerCaseSubject("Documents needed", caseRef))
    expect(payment!.subject).toBe(customerCaseSubject("Your secure payment link", caseRef))
    expect(confirmation!.subject).toBe(customerCaseSubject("Payment received", caseRef))
    expect(pack!.subject).toBe(customerCaseSubject("Your document pack is ready", caseRef))
    expect(completion!.subject).toBe(customerCaseSubject("Your case has been completed", caseRef))

    assertCaseLed(quotation!.subject, quotation!.text, quotation!.html, caseRef, [quoteRef])
    assertCaseLed(payment!.subject, payment!.text, payment!.html, caseRef, [orderRef])
    assertCaseLed(confirmation!.subject, confirmation!.text, confirmation!.html, caseRef, [orderRef, receiptRef])
    assertCaseLed(pack!.subject, pack!.text, pack!.html, caseRef, [])
    assertCaseLed(completion!.subject, completion!.text, completion!.html, caseRef, [])
    assertCaseLed(documents!.subject, documents!.text, documents!.html, caseRef, [])

    expect(quotation!.text).toContain(actionUrl)
    expect(quotation!.html).toContain(actionUrl)
    expect(payment!.paymentsUrl).toBe(`${origin}/portal/cases/${caseRef}/payments`)
    expect(confirmation!.pageUrl).toBe(`${origin}/portal/cases/${caseRef}/payments`)
    expect(pack!.pageUrl).toBe(`${origin}/portal/cases/${caseRef}/documents`)
    expect(completion!.pageUrl).toBe(`${origin}/portal/cases/${caseRef}/documents`)
    expect(documents!.text).toContain(uploadUrl)
    expect(quotation!.text).toContain("keep your case reference in the subject")
    expect(payment!.text).toContain("keep the case reference in the subject")
    expect(confirmation!.text).toContain("keep the case reference in the subject")
  })

  it("labels a quotation that has no case, and a managed case the same way", () => {
    const standalone = renderQuotationOffer({
      publicRef: "QT-26-ALONE1",
      serviceName: "Relaunch Guard",
      amountMinor: 999,
      currency: "GBP",
      paymentModel: "RECURRING_MONTHLY",
      scope: "Monitor this location after activation.",
      exclusions: "This quotation does not restore a suspended profile.",
      validUntil: "2026-11-03T12:00:00.000Z",
      actionUrl,
      replyTo,
    })
    expect(standalone?.subject).toBe("Your quotation is ready — Quotation number QT-26-ALONE1")
    expect(standalone?.text).toContain("Quotation number: QT-26-ALONE1")
    expect(standalone?.text).not.toContain("Case reference:")

    const managed = renderManagedNotice({
      variant: "invoice",
      serviceCode: "MANAGED_REVIEW",
      serviceName: "Managed Review Protection",
      caseRef: "RV-26-REVW2K",
      amountMinor: 14900,
      currency: "GBP",
      origin,
      replyTo,
    })
    expect(managed?.subject).toBe("Your success fee invoice is ready — Case RV-26-REVW2K")
    expect(managed?.pageUrl).toBe(`${origin}/portal/cases/RV-26-REVW2K/payments`)
    expect(managed?.text.toLowerCase()).toContain("keep the case reference in the subject")
  })
})
