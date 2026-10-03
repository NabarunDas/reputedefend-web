import { describe, expect, it } from "vitest"
import { presentAttention, presentCase, customerCaseState, caseTypeLabel, serviceLabel, formatPortalDate, attentionIntro, calmActiveCopy, statusLabel } from "./model"
import type { CustomerCaseRow } from "./parse"

const base: CustomerCaseRow = {
  reference: "PR-26-ABCDEF",
  caseType: "PROFILE_RECOVERY",
  serviceTrack: "UNDECIDED",
  businessName: "Harbour Bakery",
  locationName: "High Street",
  status: "UNDER_REVIEW",
  workStage: "EVIDENCE_COLLECTION",
  submittedAt: "2026-10-08T12:00:00.000Z",
  closedAt: null,
  attentionItems: [],
}

describe("customer case presentation", () => {
  it("maps case type and service labels and hides an undecided track", () => {
    expect(caseTypeLabel("PROFILE_RECOVERY")).toBe("Profile Recovery")
    expect(caseTypeLabel("REVIEW_PROTECTION")).toBe("Review Protection")
    expect(serviceLabel("GUIDED")).toBe("Guided service")
    expect(serviceLabel("MANAGED")).toBe("Managed service")
    expect(serviceLabel("UNDECIDED")).toBeNull()
  })

  it("formats dates in UK form", () => {
    expect(formatPortalDate("2026-10-08T12:00:00.000Z")).toBe("8 October 2026")
  })

  it("resolves coarse state in the required order", () => {
    const attention = [{ code: "QUOTE_ACCEPTANCE" as const, expiresAt: "2026-10-08T12:00:00.000Z" }]
    expect(customerCaseState("CANCELLED", "FINISHED", 1)).toBe("CANCELLED")
    expect(customerCaseState("CLOSED", "FINISHED", 1)).toBe("COMPLETE")
    expect(customerCaseState("AWAITING_CUSTOMER", "EVIDENCE_COLLECTION", 1)).toBe("ACTION_NEEDED")
    expect(customerCaseState("UNDER_REVIEW", "WAITING_GOOGLE", 0)).toBe("WAITING_GOOGLE")
    expect(customerCaseState("UNDER_REVIEW", "SUBMITTED", 0)).toBe("SUBMITTED")
    expect(customerCaseState("RECEIVED", "INITIAL_REVIEW", 0)).toBe("RECEIVED")
    expect(customerCaseState("RECEIVED", "EVIDENCE_COLLECTION", 0)).toBe("IN_PROGRESS")
    expect(customerCaseState("UNDER_REVIEW", "INITIAL_REVIEW", 0)).toBe("IN_PROGRESS")
    expect(customerCaseState("AWAITING_CUSTOMER", "PAYMENT_REQUIRED", 0)).toBe("IN_PROGRESS")
    expect(customerCaseState("RECOMMENDATION_READY", "ASSESSMENT_READY", 0)).toBe("IN_PROGRESS")
    expect(statusLabel("ACTION_NEEDED")).toBe("Action needed")
    expect(statusLabel(customerCaseState("UNDER_REVIEW", "WAITING_GOOGLE", 0))).toBe("Waiting for Google")
    expect(presentCase({ ...base, status: "CLOSED", workStage: "FINISHED", closedAt: "2026-10-09T12:00:00.000Z", attentionItems: attention }).statusLabel).toBe("Complete")
    expect(presentCase({ ...base, status: "CANCELLED", workStage: "FINISHED", attentionItems: attention }).statusLabel).toBe("Cancelled")
  })

  it("uses the eight attention sentences and does not hand raw enums to the presented case", () => {
    const due = "2026-10-08T12:00:00.000Z"
    expect(presentAttention({ code: "EVIDENCE_REQUIRED", dueAt: due }, "PR-26-ABCDEF")).toEqual({
      label: "Upload evidence",
      timing: "Requested by 8 October 2026",
      support: "Upload the requested evidence in your customer portal.",
      href: "/portal/cases/PR-26-ABCDEF/documents",
      actionLabel: "Upload evidence for PR-26-ABCDEF",
    })
    expect(presentAttention({ code: "EVIDENCE_REQUIRED", dueAt: null }).timing).toBeNull()
    expect(presentAttention({ code: "EVIDENCE_REQUIRED", dueAt: null }).href).toBeNull()
    const portalActions = [
      ["QUOTE_ACCEPTANCE", "Review your quote", "Review your quote in the customer portal."],
      ["SERVICE_AGREEMENT", "Accept your service agreement", "Review your Service Agreement in the customer portal."],
      ["CASE_PERMISSION", "Confirm case-management permission", "Review your case management permission in the customer portal."],
    ] as const
    for (const [code, label, support] of portalActions) {
      expect(presentAttention({ code, expiresAt: due }, "PR-26-ABCDEF")).toEqual({
        label,
        timing: "Available until 8 October 2026",
        support,
        href: "/portal/cases/PR-26-ABCDEF/service",
        actionLabel: "Review your service for PR-26-ABCDEF",
      })
      expect(presentAttention({ code, expiresAt: due }).href).toBeNull()
    }
    const paymentActions = [
      ["GUIDED_PAYMENT", "Complete your payment"],
      ["MANAGED_PAYMENT_SETUP", "Save your payment method"],
      ["PAYMENT_RECOVERY", "Complete payment authentication"],
      ["INVOICE_PAYMENT", "Pay your invoice"],
    ] as const
    for (const [code, label] of paymentActions) {
      expect(presentAttention({ code, expiresAt: due }, "PR-26-ABCDEF")).toEqual({
        label,
        timing: "Secure link expires 8 October 2026",
        support: "Use the secure link in the ProfileRelaunch email for this step.",
        href: null,
        actionLabel: null,
      })
    }
    const presented = presentCase({ ...base, serviceTrack: "MANAGED", attentionItems: [{ code: "QUOTE_ACCEPTANCE", expiresAt: due }] })
    expect(presented).toMatchObject({
      caseTypeLabel: "Profile Recovery",
      serviceLabel: "Managed service",
      statusLabel: "Action needed",
      startedLabel: "Started 8 October 2026",
    })
    expect(JSON.stringify(presented)).not.toMatch(/PROFILE_RECOVERY|UNDER_REVIEW|EVIDENCE_COLLECTION|QUOTE_ACCEPTANCE|UNDECIDED/)
  })

  it("pluralises the dashboard sentences", () => {
    expect(attentionIntro(1)).toBe("One of your cases has a step for you.")
    expect(attentionIntro(2)).toBe("Some of your cases have steps for you.")
    expect(calmActiveCopy(1)).toBe("We're working on your active case. We'll let you know when you need to do something.")
    expect(calmActiveCopy(2)).toBe("We're working on your active cases. We'll let you know when you need to do something.")
  })
})
