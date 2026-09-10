import { describe, expect, it } from "vitest"
import { checkEnquiryRateLimit, resetEnquiryRateLimit } from "@/lib/enquiry-rate-limit"

describe("checkEnquiryRateLimit", () => {
  it("allows a small burst then rejects further requests in the window", () => {
    const store = new Map<string, number[]>()
    const now = 1_000_000
    for (let index = 0; index < 8; index += 1) {
      expect(checkEnquiryRateLimit("1.1.1.1", now + index, store).ok).toBe(true)
    }
    expect(checkEnquiryRateLimit("1.1.1.1", now + 8, store).ok).toBe(false)
    expect(checkEnquiryRateLimit("2.2.2.2", now + 8, store).ok).toBe(true)
    resetEnquiryRateLimit(store)
    expect(checkEnquiryRateLimit("1.1.1.1", now + 9, store).ok).toBe(true)
  })
})
