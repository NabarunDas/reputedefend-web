import { describe, expect, it } from "vitest"
import { monitoredReplyMailbox } from "@/lib/email/reply-mailbox"

describe("monitored reply mailbox", () => {
  it("accepts only a configured mailbox and ignores the sender and admin sign-in", () => {
    expect(monitoredReplyMailbox({})).toBeNull()
    expect(monitoredReplyMailbox({
      COMMUNICATIONS_FROM_EMAIL: "ops@profilerelaunch.com",
      ENQUIRY_FROM_EMAIL: "enquiries@reputedefend.com",
    })).toBeNull()
    expect(monitoredReplyMailbox({ COMMUNICATIONS_REPLY_TO_EMAIL: "not-an-email" })).toBeNull()
    expect(monitoredReplyMailbox({ COMMUNICATIONS_REPLY_TO_EMAIL: "Cases@ProfileRelaunch.com" })).toBe("cases@profilerelaunch.com")
  })
})
