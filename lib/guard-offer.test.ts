import { describe, expect, it } from "vitest"
import { pricingGroups } from "@/lib/pricing"
import {
  alertChannel,
  checksPerDay,
  deliveryMethod,
  guardHeroDisclaimer,
  guardOffer,
  guardPrice,
  guardPrimaryAction,
  includedRecoveryDays,
  includesBankHolidays,
  includesWeekends,
  managedDiscountPercent,
  timezone,
} from "./guard-offer"

const pricingPrice = pricingGroups.find((group) => group.id === "relaunch-guard")?.items[0]?.price

describe("guard offer data", () => {
  it("takes the Guard price from the existing pricing group", () => {
    expect(pricingPrice).toBeDefined()
    expect(guardPrice).toBe(pricingPrice)
    expect(guardPrice).toBe("£9.99")
  })

  it("exports the published monitoring facts without a billing engine", () => {
    expect(checksPerDay).toBe(2)
    expect(timezone).toBe("Europe/London")
    expect(includesWeekends).toBe(true)
    expect(includesBankHolidays).toBe(true)
    expect(deliveryMethod).toBe("manual")
    expect(alertChannel).toBe("email")
    expect(managedDiscountPercent).toBe(20)
    expect(includedRecoveryDays).toBe(30)
    expect(guardOffer).toEqual({
      checksPerDay,
      timezone,
      includesWeekends,
      includesBankHolidays,
      deliveryMethod,
      alertChannel,
      managedDiscountPercent,
      includedRecoveryDays,
    })
  })

  it("points both primary CTAs at setup or contact from the same helper", () => {
    expect(guardPrimaryAction(true)).toEqual({ href: "/start-monitoring", label: "Start monitoring setup" })
    expect(guardPrimaryAction(false)).toEqual({ href: "/contact", label: "Ask about monitoring" })
    expect(guardHeroDisclaimer(true)).toBe("Requesting setup does not start monitoring or take payment.")
    expect(guardHeroDisclaimer(false)).toBe("Online setup is currently unavailable. Contact us to discuss monitoring.")
  })
})
