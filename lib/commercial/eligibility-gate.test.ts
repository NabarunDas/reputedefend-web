import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import { eligibilityEnquiryMessage } from "./eligibility-message"

const migration = readFileSync(
  new URL("../../supabase/migrations/20261015140000_commercial_eligibility_gate_v1.sql", import.meta.url),
  "utf8",
)

describe("COM-14A eligibility source", () => {
  it("uses the short customer sentence and does not authorise the sale", () => {
    expect(eligibilityEnquiryMessage).toBe("Thanks — we'll confirm your quote and payment details shortly.")
    expect(migration).toContain(eligibilityEnquiryMessage)
    expect(migration).not.toContain("You can still send an enquiry")
  })

  it("does not seed a country backlog or approve the paid-service agreement", () => {
    expect(migration).not.toMatch(/status,\s*'APPROVED'/i)
    expect(migration).not.toContain("operative = true")
    expect(migration).not.toContain("('AT'")
    expect(migration).not.toContain("CROSS JOIN")
    expect(migration).not.toContain("customer_actions_commercial_eligibility")
    expect(migration).toContain("NOT_VAT_REGISTERED")
    expect(migration).toContain("not_vat_is_not_worldwide_zero")
    expect(migration).toContain("UK_DOMESTIC_NOT_VAT_REGISTERED")
    expect(migration).toContain("sanctions_blocked")
    expect(migration).toContain("vat_threshold")
    expect(migration).toContain("awaiting_confirmation")
    expect(migration).toContain("NOT IN ('UK', 'EU', 'XX')")
    expect(migration).not.toContain("('EU')")
    expect(migration).toContain("Do not apply this file to DEV or Production")
    expect(migration).toContain("customer_action_receipt_body_v1")
    expect(migration).toContain("A stored checkout receipt is not a new authorisation")
    expect(migration).toContain("next-30-days test is a manual review")
  })
})
