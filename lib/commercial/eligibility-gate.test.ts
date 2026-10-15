import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { eligibilityEnquiryMessage } from "./eligibility-message"

const migration = readFileSync(
  new URL("../../supabase/migrations/20261015140000_commercial_eligibility_gate_v1.sql", import.meta.url),
  "utf8",
)

describe("COM-14A eligibility source", () => {
  it("keeps the customer message available while a paid order is refused", () => {
    expect(eligibilityEnquiryMessage).toContain("You can still send an enquiry")
    expect(migration).toContain(eligibilityEnquiryMessage)
  })

  it("seeds a pending backlog and does not approve a country or the paid-service agreement", () => {
    expect(migration).toContain("'PENDING_REVIEW'")
    expect(migration).not.toMatch(/status,\s*'APPROVED'/i)
    expect(migration).not.toContain("operative = true")
    expect(migration).toContain("not_vat_is_not_worldwide_zero")
    expect(migration).toContain("UK_DOMESTIC_NOT_VAT_REGISTERED")
    expect(migration).toContain("NOT IN ('UK', 'EU', 'XX')")
    expect(migration).not.toContain("('EU')")
    expect(migration).toContain("Do not apply this file to DEV or Production")
    expect(migration).toContain("customer_action_receipt_body_v1")
    expect(migration).toContain("A stored checkout receipt is not a new authorisation")
  })
})
