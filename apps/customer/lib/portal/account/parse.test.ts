import { describe, expect, it } from "vitest"
import { parseAccount } from "./parse"

const account = {
  name: "Alex Customer",
  email: "alex@example.com",
  phone: "+447700900111",
  emailVerified: true,
  phoneVerified: true,
}

describe("account projection parser", () => {
  it("accepts the customer-safe fields and rejects internal keys", () => {
    expect(parseAccount(account)).toEqual(account)
    const withoutPhone = { ...account }
    delete (withoutPhone as { phone?: string }).phone
    expect(parseAccount({ ...withoutPhone, phoneVerified: false })?.phone).toBeNull()
    expect(parseAccount({ ...account, customerId: "22222222-2222-4222-8222-222222222222" })).toBeNull()
    expect(parseAccount({ ...account, authUserId: "66666666-6666-4666-8666-666666666666" })).toBeNull()
    expect(parseAccount({ ...account, evidence: "Verified from a live call." })).toBeNull()
    expect(parseAccount({ ...account, tokenHash: "a".repeat(64) })).toBeNull()
    expect(parseAccount({ ...account, emailVerified: false })).toBeNull()
    expect(parseAccount({ ...account, phoneVerified: "yes" })).toBeNull()
  })
})
