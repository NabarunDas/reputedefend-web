import { describe, expect, it } from "vitest"
import { requestTelloyaCancellation, telloyaServiceView, telloyaVoiceAllowed } from "./telloya-operations"
import type { TelloyaOfferVersion } from "./telloya-offer"

const offer = {
  planCode: "growth",
  includedMinutes: 300,
  guardLocations: 2,
} as TelloyaOfferVersion

describe("Telloya subscription operations", () => {
  it("shows the agreed plan without presenting simulated usage as real", () => {
    const view = telloyaServiceView({ offer, billing: "initial_paid", renewalDate: "2026-12-12" })
    expect(view.planLabel).toBe("growth")
    expect(view.includedMinutes).toBe("300 minutes each month")
    expect(view.guardLocations).toBe("2 agreed locations")
    expect(view.invoice).toBe("Paid")
    expect(view.usage).toBe("Call usage is not available in this preview.")
    expect(view.service).toBe("Preparing your receptionist")
    expect(telloyaVoiceAllowed("initial_paid")).toBe(false)
    expect(telloyaVoiceAllowed("cancelled")).toBe(false)
  })

  it("records cancellation at period end and does not promise a refund", () => {
    expect(requestTelloyaCancellation("initial_paid")).toEqual({ result: "recorded", billing: "cancel_at_period_end" })
    expect(requestTelloyaCancellation("cancelled").result).toBe("closed")
    expect(telloyaServiceView({ offer, billing: "failed", renewalDate: null }).refund).toMatch(/does not promise a pro-rata refund/)
    expect(telloyaServiceView({ offer: null, billing: "none", renewalDate: null }).planLabel).toBe("Plan to be confirmed")
  })
})
