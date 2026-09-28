import { describe, expect, it } from "vitest"
import { leadConversionPayload, sendLeadConversion } from "@/lib/analytics"

describe("lead conversion outside the browser", () => {
  it("sends nothing when there is no window", () => {
    expect(typeof window).toBe("undefined")
    expect(sendLeadConversion({ leadType: "contact" })).toBe(false)
    expect(sendLeadConversion({ leadType: "assessment", serviceType: "profile-recovery" })).toBe(
      false,
    )
  })

  it("still builds a payload without touching browser globals", () => {
    expect(leadConversionPayload({ leadType: "guard_setup" })).toEqual({
      lead_type: "guard_setup",
    })
  })
})
