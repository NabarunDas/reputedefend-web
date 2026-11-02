import { describe, expect, it } from "vitest"
import { composeCustomerInvitationEmail } from "./customer-invitation"

const origin = "https://profilerelaunch-customer-git-develop-preview.vercel.app"

describe("customer invitation email", () => {
  it("uses the shared customer design and keeps the token out of the stored message", () => {
    const message = composeCustomerInvitationEmail({ origin })
    expect(message?.subject).toBe("Your ProfileRelaunch Customer Portal invitation")
    const body = `${message?.text}\n${message?.html}`
    expect(body).toContain("Telloya — a ProfileRelaunch company")
    expect(body).toContain("ProfileRelaunch Ltd")
    expect(body).toContain("Customer Portal")
    expect(body).toContain("verification code")
    expect(body).toContain("does not start a subscription")
    expect(body.match(/\/login\/invite\/ready/g)).toHaveLength(2)
    expect(body).not.toMatch(/\/login\/invite\/[a-f0-9]{64}/)
    expect(body).not.toContain("#t=")
    expect(body.toLowerCase()).not.toContain("entitlement")
    expect(body).not.toContain("Reference:")
  })

  it("includes a reference only when one was persisted", () => {
    expect(composeCustomerInvitationEmail({ origin, reference: "PR-26-AB2CDE" })?.text).toContain("Reference: PR-26-AB2CDE")
    expect(composeCustomerInvitationEmail({ origin, reference: "CASE-1" })).toBeNull()
    expect(composeCustomerInvitationEmail({ origin: "http://example.com" })).toBeNull()
  })
})
