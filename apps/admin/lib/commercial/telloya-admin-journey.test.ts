import { describe, expect, it } from "vitest"
import { telloyaJourneyProgress, telloyaPlanInterestLabel } from "./telloya-admin-journey"

describe("Telloya admin journey progress", () => {
  it("uses the same admin flow for a general enquiry and a personalised demonstration", () => {
    const general = telloyaJourneyProgress({ source: "telloya" })
    const demo = telloyaJourneyProgress({ source: "telloya", requestIntent: "personalised-demo", planTier: "growth" })
    expect(general?.planLabel).toBe("Plan to be confirmed")
    expect(general?.requestLabel).toBe("General enquiry")
    expect(general?.current).toBe("demo")
    expect(demo?.requestLabel).toBe("Personalised live demonstration")
    expect(demo?.planLabel).toBe("Growth")
    expect(demo?.current).toBe("demo")
    expect(demo?.stages.find(stage => stage.id === "enquiry")?.state).toBe("complete")
    expect(demo?.stages.find(stage => stage.id === "demo")?.state).toBe("current")
    expect(demo?.stages.find(stage => stage.id === "active")?.state).toBe("upcoming")
  })

  it("does not invent a journey for another ProfileRelaunch enquiry", () => {
    expect(telloyaJourneyProgress({ source: "contact", planTier: "growth" })).toBeNull()
  })

  it("keeps later stages closed until the earlier record exists", () => {
    const progress = telloyaJourneyProgress({
      source: "telloya",
      demoStatus: "COMPLETED",
      offerStatus: "accepted",
      agreementAccepted: false,
    })
    expect(progress?.current).toBe("agreement")
    expect(progress?.next).toMatch(/Legal approval is still required/)
  })

  it("moves from the demonstration through quote, sent, and response", () => {
    const completed = telloyaJourneyProgress({ source: "telloya", demoStatus: "COMPLETED" })
    expect(completed?.current).toBe("quote")
    expect(completed?.next).toMatch(/Save or review the personalised quote/)
    const prepared = telloyaJourneyProgress({ source: "telloya", demoStatus: "COMPLETED", offerStatus: "prepared" })
    expect(prepared?.current).toBe("quote")
    expect(prepared?.next).toMatch(/Approve & Send Offer/)
    const sent = telloyaJourneyProgress({ source: "telloya", demoStatus: "COMPLETED", offerStatus: "sent" })
    expect(sent?.current).toBe("sent")
    expect(sent?.next).toMatch(/Wait for the customer to review/)
    const amendment = telloyaJourneyProgress({ source: "telloya", demoStatus: "COMPLETED", offerStatus: "amendment" })
    expect(amendment?.current).toBe("response")
    expect(amendment?.next).toMatch(/Review the amendment request/)
    const paid = telloyaJourneyProgress({
      source: "telloya",
      demoStatus: "COMPLETED",
      offerStatus: "accepted",
      agreementAccepted: true,
      paymentStatus: "paid",
      setupStatus: "preparing",
    })
    expect(paid?.current).toBe("setup")
    expect(paid?.next).toMatch(/Going live stays blocked/)
  })
})

describe("Telloya plan interest label", () => {
  it("does not call a missing plan a required plan", () => {
    expect(telloyaPlanInterestLabel("")).toBe("Plan to be confirmed")
    expect(telloyaPlanInterestLabel(undefined)).toBe("Plan to be confirmed")
  })
})
