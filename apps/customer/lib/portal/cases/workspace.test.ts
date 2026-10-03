import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import type { CustomerCaseDetail, WorkStage } from "./parse"
import {
  customerProgressStep,
  presentDetailRows,
  presentNextStep,
  presentProgress,
  presentTimeline,
  timelineMessage,
} from "./workspace"

const submittedAt = "2026-10-03T12:00:00.000Z"
const closedAt = "2026-10-08T12:00:00.000Z"

function detail(overrides: Partial<CustomerCaseDetail["case"]> = {}, timeline: CustomerCaseDetail["timeline"] = [{ code: "CASE_RECEIVED", occurredAt: submittedAt }]): CustomerCaseDetail {
  return {
    found: true,
    case: {
      reference: "PR-26-ABCDEF",
      caseType: "PROFILE_RECOVERY",
      serviceTrack: "MANAGED",
      businessName: "Harbour Bakery",
      locationName: "High Street",
      status: "UNDER_REVIEW",
      workStage: "INITIAL_REVIEW",
      submittedAt,
      closedAt: null,
      attentionItems: [],
      outcomeCode: null,
      ...overrides,
    },
    timeline,
    timelineTruncated: false,
  }
}

describe("customer progress presentation", () => {
  const mapping: Record<string, WorkStage[]> = {
    RECEIVED: ["INITIAL_REVIEW"],
    INFORMATION: ["EVIDENCE_COLLECTION", "ASSESSMENT_READY"],
    SERVICE_SETUP: ["SERVICE_SELECTION", "PAYMENT_REQUIRED", "AUTHORIZATION_REQUIRED"],
    PREPARATION: ["PREPARATION", "READY_TO_SUBMIT"],
    SUBMITTED: ["SUBMITTED", "WAITING_GOOGLE", "OWNER_ACTION", "FURTHER_REVIEW"],
    DECISION: ["OUTCOME_REVIEW", "FINISHED"],
  }

  it("maps each work stage to the current customer step and writes nothing", () => {
    for (const [step, stages] of Object.entries(mapping)) {
      for (const stage of stages) {
        expect(customerProgressStep("UNDER_REVIEW", stage)).toBe(step)
      }
    }
    expect(customerProgressStep("CLOSED", "INITIAL_REVIEW")).toBe("DECISION")
    expect(customerProgressStep("CANCELLED", "FINISHED")).toBeNull()
    expect(presentProgress("CANCELLED", "FINISHED")).toBeNull()
    const progress = presentProgress("UNDER_REVIEW", "SERVICE_SELECTION")
    expect(progress?.map(step => step.text)).toEqual([
      "Case received — earlier step",
      "Information — earlier step",
      "Service setup — current step",
      "Preparing your case — upcoming step",
      "Submitted to Google — upcoming step",
      "Decision — upcoming step",
    ])
    expect(progress?.find(step => step.position === "current")?.code).toBe("SERVICE_SETUP")
    const source = readFileSync(new URL("./workspace.ts", import.meta.url), "utf8")
    expect(source).toContain("current-position presentation")
    expect(source).toContain("If the authoritative case moves backward")
    expect(source).not.toMatch(/\.rpc\(|insert into|update public/i)
    expect(customerProgressStep("UNDER_REVIEW", "INITIAL_REVIEW")).toBe(customerProgressStep("UNDER_REVIEW", "INITIAL_REVIEW"))
  })
})

describe("what happens next", () => {
  it("uses the first UX-10C attention label and lists the rest", () => {
    const next = presentNextStep({
      status: "AWAITING_CUSTOMER",
      workStage: "EVIDENCE_COLLECTION",
      caseType: "PROFILE_RECOVERY",
      outcomeCode: null,
      attentionItems: [
        { code: "EVIDENCE_REQUIRED", dueAt: "2026-10-08T12:00:00.000Z" },
        { code: "QUOTE_ACCEPTANCE", expiresAt: "2026-10-20T12:00:00.000Z" },
        { code: "GUIDED_PAYMENT", expiresAt: "2026-10-21T12:00:00.000Z" },
      ],
    })
    expect(next.title).toBe("Upload evidence")
    expect(next.support).toBe("Use the secure case link in the ProfileRelaunch email to provide the requested evidence.")
    expect(next.alsoWaiting).toBe("You also have 2 other steps waiting for you.")
    expect(next.remaining).toEqual(["Review your quote", "Complete your payment"])
    expect(next.body).toBeNull()

    const oneMore = presentNextStep({
      status: "AWAITING_CUSTOMER",
      workStage: "PAYMENT_REQUIRED",
      caseType: "PROFILE_RECOVERY",
      outcomeCode: null,
      attentionItems: [
        { code: "SERVICE_AGREEMENT", expiresAt: "2026-10-20T12:00:00.000Z" },
        { code: "CASE_PERMISSION", expiresAt: "2026-10-21T12:00:00.000Z" },
      ],
    })
    expect(oneMore.title).toBe("Accept your service agreement")
    expect(oneMore.support).toBe("Use the secure link in the ProfileRelaunch email for this step.")
    expect(oneMore.alsoWaiting).toBe("You also have 1 other step waiting for you.")
    expect(oneMore.remaining).toEqual(["Confirm case-management permission"])
  })

  it("uses the calm wording for each customer state, including a recognised outcome", () => {
    const base = { caseType: "PROFILE_RECOVERY" as const, outcomeCode: null, attentionItems: [] }
    expect(presentNextStep({ ...base, status: "RECEIVED", workStage: "INITIAL_REVIEW" })).toMatchObject({
      title: "We're reviewing your case",
      body: "We've received your request and are reviewing the information you provided.",
    })
    expect(presentNextStep({ ...base, status: "UNDER_REVIEW", workStage: "PREPARATION" })).toMatchObject({
      title: "We're working on your case",
      body: "Nothing is needed from you right now. We'll let you know when that changes.",
    })
    expect(presentNextStep({ ...base, status: "UNDER_REVIEW", workStage: "SUBMITTED" })).toMatchObject({
      title: "Your case has been submitted",
      body: "We've recorded the submission to Google. Nothing is needed from you right now.",
    })
    expect(presentNextStep({ ...base, status: "UNDER_REVIEW", workStage: "WAITING_GOOGLE" })).toMatchObject({
      title: "We're waiting for Google",
      body: "Your case is with Google. We'll update you when a decision or further action is recorded.",
    })
    expect(presentNextStep({ ...base, status: "CLOSED", workStage: "FINISHED", outcomeCode: "RESTORED" })).toMatchObject({
      title: "Your profile was restored",
      body: "This case is complete.",
    })
    expect(presentNextStep({
      ...base,
      caseType: "REVIEW_PROTECTION",
      status: "CLOSED",
      workStage: "FINISHED",
      outcomeCode: "REMOVED",
    })).toMatchObject({
      title: "The review was removed",
      body: "This case is complete.",
    })
    expect(presentNextStep({ ...base, status: "CLOSED", workStage: "FINISHED" })).toMatchObject({
      title: "Your case is complete",
      body: "No further action is currently needed for this case.",
    })
    expect(presentNextStep({ ...base, status: "CANCELLED", workStage: "FINISHED" })).toMatchObject({
      title: "This case was cancelled",
      body: "No further action is currently available for this case.",
    })
    expect(presentNextStep({ ...base, status: "AWAITING_CUSTOMER", workStage: "EVIDENCE_COLLECTION" }).title).not.toBe("Nothing needed from you")
  })
})

describe("timeline wording", () => {
  it("uses the exact customer sentence for every code and never the raw code", () => {
    expect(timelineMessage("CASE_RECEIVED", null)).toBe("We received your ProfileRelaunch case.")
    expect(timelineMessage("EVIDENCE_SUBMITTED", null)).toBe("You submitted evidence.")
    expect(timelineMessage("EVIDENCE_ACCEPTED", null)).toBe("Your evidence was accepted.")
    expect(timelineMessage("QUOTE_ACCEPTED", null)).toBe("You accepted your ProfileRelaunch quote.")
    expect(timelineMessage("SERVICE_AGREEMENT_ACCEPTED", null)).toBe("You accepted the service agreement.")
    expect(timelineMessage("CASE_PERMISSION_CONFIRMED", null)).toBe("You confirmed case-management permission.")
    expect(timelineMessage("SERVICE_AGREEMENT_WITHDRAWN", null)).toBe("The service agreement authorisation was withdrawn.")
    expect(timelineMessage("CASE_PERMISSION_WITHDRAWN", null)).toBe("Case-management permission was withdrawn.")
    expect(timelineMessage("PAYMENT_RECEIVED", null)).toBe("We received a payment for this case.")
    expect(timelineMessage("SUBMITTED_TO_GOOGLE", null)).toBe("Your case was submitted to Google.")
    expect(timelineMessage("GOOGLE_DECISION_RECORDED", null)).toBe("A Google decision was recorded for your case.")
    expect(timelineMessage("CASE_COMPLETED", null)).toBe("This ProfileRelaunch case was completed.")
    expect(timelineMessage("CASE_COMPLETED", "RESTORED")).toBe("Your profile was restored and the case was completed.")
    expect(timelineMessage("CASE_COMPLETED", "REMOVED")).toBe("The review was removed and the case was completed.")
    expect(timelineMessage("CASE_CANCELLED", null)).toBe("This ProfileRelaunch case was cancelled.")
    const presented = presentTimeline(detail({ outcomeCode: "RESTORED" }, [
      { code: "CASE_COMPLETED", occurredAt: closedAt },
      { code: "CASE_RECEIVED", occurredAt: submittedAt },
    ]))
    expect(presented.map(item => item.message).join(" ")).not.toMatch(/CASE_|actor|review_note|_/)
    expect(presented[1].dateLabel).toBe("3 October 2026")
  })
})

describe("case detail rows", () => {
  it("omits an empty location, an undecided service, and a missing closed date", () => {
    const rows = presentDetailRows(detail({ locationName: null, serviceTrack: "UNDECIDED", closedAt: null }))
    expect(rows.map(row => row.term)).toEqual(["Reference", "Service", "Business", "Started"])
    const closed = presentDetailRows(detail({ closedAt, locationName: "High Street" }))
    expect(closed.map(row => row.term)).toEqual(["Reference", "Service", "Business", "Location", "Service type", "Started", "Closed"])
    expect(closed.find(row => row.term === "Closed")?.value).toBe("8 October 2026")
    expect(closed.find(row => row.term === "Service type")?.value).toBe("Managed service")
  })
})
