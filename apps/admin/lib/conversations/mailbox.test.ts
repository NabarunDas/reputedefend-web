import { describe, expect, it } from "vitest"
import { parseMailbox, parseMailboxList } from "./mailbox"

describe("mailbox parser", () => {
  it("derives address and display from a formatted mailbox", () => {
    expect(parseMailbox("Alex Smith <alex@example.com>")).toEqual({
      address: "alex@example.com",
      display: "Alex Smith",
    })
    expect(parseMailbox('"Alex Smith" <alex@example.com>')).toEqual({
      address: "alex@example.com",
      display: "Alex Smith",
    })
    expect(parseMailbox("  alex@example.com  ")).toEqual({
      address: "alex@example.com",
      display: null,
    })
  })

  it("fails closed on malformed or ambiguous mailbox strings", () => {
    expect(parseMailbox("Alex Smith <alex@example.com")).toBeNull()
    expect(parseMailbox("Alex Smith <alex@example.com> <other@example.com>")).toBeNull()
    expect(parseMailbox("Not an address <not-an-email>")).toBeNull()
    expect(parseMailbox("alex@example.com, other@example.com")).toBeNull()
    expect(parseMailbox("")).toBeNull()
    expect(parseMailbox(12)).toBeNull()
  })

  it("extracts only parseable addresses from provider lists", () => {
    expect(parseMailboxList([
      "Conversation Desk <reply@reply.profilerelaunch.com>",
      "broken",
      "ops@reputedefend.com",
    ])).toEqual([
      "reply@reply.profilerelaunch.com",
      "ops@reputedefend.com",
    ])
  })
})
