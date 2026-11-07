import { describe, expect, it, vi } from "vitest"

import { reconcileInProgressCall } from "./inbound-call-limit"

describe("in-progress call limit", () => {
  it("does not call the provider when the next minute stays inside the cap", async () => {
    const stopCall = vi.fn(async () => "stopped" as const)
    const result = await reconcileInProgressCall({
      projectedPastCap: false,
      providerCallRef: "call_inside",
      stopCall,
    })
    expect(result).toEqual({ stopOutcome: "not_required", capEnforced: false, simulated: true })
    expect(stopCall).not.toHaveBeenCalled()
  })

  it("records a simulated stop without claiming the spending cap is enforced", async () => {
    const stopCall = vi.fn(async () => "stopped" as const)
    const result = await reconcileInProgressCall({
      projectedPastCap: true,
      providerCallRef: "call_stop",
      stopCall,
    })
    expect(stopCall).toHaveBeenCalledWith("call_stop")
    expect(result).toEqual({ stopOutcome: "stopped", capEnforced: false, simulated: true })
  })

  it("records provider stop failure and timeout without claiming the cap is enforced", async () => {
    expect(await reconcileInProgressCall({
      projectedPastCap: true,
      providerCallRef: "call_fail",
      stopCall: async () => "failed",
    })).toEqual({ stopOutcome: "failed", capEnforced: false, simulated: true })
    expect(await reconcileInProgressCall({
      projectedPastCap: true,
      providerCallRef: "call_timeout",
      stopCall: async () => "timeout",
    })).toEqual({ stopOutcome: "timeout", capEnforced: false, simulated: true })
    expect(await reconcileInProgressCall({
      projectedPastCap: true,
      providerCallRef: "call_throw",
      stopCall: async () => {
        throw new Error("provider timeout")
      },
    })).toEqual({ stopOutcome: "failed", capEnforced: false, simulated: true })
  })
})
