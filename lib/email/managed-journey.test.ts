import { describe, expect, it } from "vitest"
import { customerEmailSecurityNote } from "./customer-message"
import { customerPriceBoundary } from "../pricing"
import {
  managedCaseButton,
  managedGuardSentence,
  managedInvoiceButton,
  managedInvoiceSentence,
  managedOpenCaseSentence,
  managedPaidSentence,
  managedProfileCheckedSentence,
  managedReviewCheckedSentence,
  managedFollowUpSentence,
  managedSubmittedSentence,
  renderManagedNotice,
} from "./managed-journey"

const origin = "https://customer.example.test"
const shared = {
  serviceCode: "MANAGED_RELAUNCH",
  serviceName: "Managed Profile Recovery",
  caseRef: "PR-26-MANAGE",
  origin,
  replyTo: "cases@profilerelaunch.com",
}

describe("managed customer email", () => {
  it("records a submission without saying Google has decided", () => {
    const rendered = renderManagedNotice({ ...shared, variant: "submitted" })
    expect(rendered).not.toBeNull()
    expect(rendered!.subject).toBe("We have submitted your Managed Profile Recovery — Case PR-26-MANAGE")
    expect(rendered!.text).toContain(managedSubmittedSentence)
    expect(rendered!.text).toContain(managedOpenCaseSentence)
    expect(rendered!.text).toContain(managedCaseButton)
    expect(rendered!.text).toContain(customerEmailSecurityNote)
    expect(rendered!.html).toContain("profilerelaunch.com")
    expect(rendered!.pageUrl).toBe(`${origin}/portal/cases/PR-26-MANAGE`)
    expect(rendered!.text.match(/\/portal\/cases\//g)).toHaveLength(1)
    expect(rendered!.html.match(/\/portal\/cases\//g)).toHaveLength(1)
    expect(`${rendered!.text}\n${rendered!.html}`).not.toMatch(/pi_|cus_|#t=|\/action\/|SUCCESS_FEE|ABSENT/)
    expect(rendered!.text).not.toMatch(/Google has restored|we have removed the review/i)
  })

  it("describes a later submission as a further update without claiming Google asked for it", () => {
    const rendered = renderManagedNotice({ ...shared, variant: "follow_up" })
    expect(rendered).not.toBeNull()
    expect(rendered!.subject).toBe("We have sent Google a further update — Case PR-26-MANAGE")
    expect(rendered!.text).toContain(managedFollowUpSentence)
    expect(rendered!.text).not.toMatch(/they asked|requested more information/i)
    expect(rendered!.text).toContain(managedOpenCaseSentence)
  })

  it("sends the invoice through the signed-in payments page", () => {
    const rendered = renderManagedNotice({ ...shared, variant: "invoice", amountMinor: 29900, currency: "GBP" })
    expect(rendered).not.toBeNull()
    expect(rendered!.text).toContain(managedInvoiceSentence)
    expect(rendered!.text).toContain("£299.00 GBP")
    expect(rendered!.text).toContain(customerPriceBoundary)
    expect(rendered!.text).toContain(managedInvoiceButton)
    expect(rendered!.pageUrl).toBe(`${origin}/portal/cases/PR-26-MANAGE/payments`)
    expect(rendered!.text).not.toContain("invoice.stripe")
    expect(renderManagedNotice({ ...shared, variant: "invoice", amountMinor: 0, currency: "GBP" })).toBeNull()
  })

  it("uses the review contract for a paid review completion and keeps Guard optional", () => {
    const rendered = renderManagedNotice({
      ...shared,
      serviceCode: "MANAGED_REVIEW",
      serviceName: "Managed Review Protection",
      caseRef: "RV-26-REVW2K",
      variant: "complete_paid",
      amountMinor: 14900,
      currency: "GBP",
    })
    expect(rendered).not.toBeNull()
    expect(rendered!.text).toContain(managedReviewCheckedSentence)
    expect(rendered!.text).not.toContain(managedProfileCheckedSentence)
    expect(rendered!.text).toContain(managedPaidSentence)
    expect(rendered!.text).toContain("£149.00 GBP")
    expect(rendered!.text).toContain(managedGuardSentence)
    expect(rendered!.text).not.toMatch(/enrol you in|charge a saved card automatically/i)
    expect(renderManagedNotice({ ...shared, variant: "complete_paid", amountMinor: 29900, currency: "GBP" })!.text).toContain(managedProfileCheckedSentence)
  })

  it("refuses a Guided name, a token, and a missing reply mailbox", () => {
    expect(renderManagedNotice({ ...shared, variant: "withdrawn", serviceName: "Guided Relaunch" })).toBeNull()
    expect(renderManagedNotice({ ...shared, variant: "complete_no_fee", replyTo: null })).toBeNull()
    expect(renderManagedNotice({
      ...shared,
      variant: "submitted",
      origin: "https://customer.example.test/portal?token=secret#t=1",
    })).toBeNull()
  })
})
