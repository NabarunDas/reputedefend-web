import { describe, expect, it } from "vitest"
import { parseOnboardingCommand } from "./onboarding"

const enquiryId = "11111111-1111-4111-8111-111111111111"
const customerId = "22222222-2222-4222-8222-222222222222"
const reason = "Checked the enquiry with the caller."

describe("onboarding command parsing", () => {
  it("accepts a product choice and rejects a free-typed customer", () => {
    expect(parseOnboardingCommand({ operation: "classify", version: 0, enquiryId, product: "TELLOYA", reason })).toMatchObject({
      operation: "classify",
      payload: { product: "TELLOYA" },
    })
    expect(parseOnboardingCommand({ operation: "classify", version: 1, enquiryId, product: "TELLOYA", reason })).toBeNull()
    expect(parseOnboardingCommand({ operation: "match_customer", version: 1, enquiryId, customerId: "not-a-customer", reason })).toBeNull()
    expect(parseOnboardingCommand({ operation: "match_customer", version: 1, enquiryId, customerId, reason })?.payload).toEqual({
      enquiryId,
      reason,
      customerId,
    })
  })

  it("does not accept a price on an offer", () => {
    const offer = parseOnboardingCommand({ operation: "prepare_offer", version: 4, enquiryId, reason, amount: 4900 })
    expect(offer?.payload).toEqual({ enquiryId, reason })
    expect(offer?.payload).not.toHaveProperty("amount")
  })

  it("keeps a location from another business out of the payload unless it is a real id", () => {
    expect(parseOnboardingCommand({
      operation: "select_locations",
      version: 2,
      enquiryId,
      locationIds: ["other-business"],
      reason,
    })).toBeNull()
  })
})
