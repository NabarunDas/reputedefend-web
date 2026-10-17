import { describe, expect, it } from "vitest"
import { confirmedReplyMailbox, monitoredReplyMailbox, replyMailboxConfirmation } from "@/lib/email/reply-mailbox"

describe("monitored reply mailbox", () => {
  it("requires an explicit confirmation and ignores a mailbox setting on its own", () => {
    expect(confirmedReplyMailbox({})).toBeNull()
    expect(monitoredReplyMailbox()).toBe(confirmedReplyMailbox())
    expect(confirmedReplyMailbox({
      COMMUNICATIONS_FROM_EMAIL: "ops@profilerelaunch.com",
      ENQUIRY_FROM_EMAIL: "enquiries@reputedefend.com",
      COMMUNICATIONS_REPLY_TO_EMAIL: "cases@profilerelaunch.com",
    })).toBeNull()
    expect(confirmedReplyMailbox({
      COMMUNICATIONS_REPLY_TO_EMAIL: "cases@profilerelaunch.com",
      COMMUNICATIONS_REPLY_TO_CONFIRMED: "yes",
    })).toBeNull()
    expect(confirmedReplyMailbox({ COMMUNICATIONS_REPLY_TO_EMAIL: "not-an-email", COMMUNICATIONS_REPLY_TO_CONFIRMED: replyMailboxConfirmation })).toBeNull()
    expect(confirmedReplyMailbox({
      COMMUNICATIONS_REPLY_TO_EMAIL: "Cases@ProfileRelaunch.com",
      COMMUNICATIONS_REPLY_TO_CONFIRMED: replyMailboxConfirmation,
    })).toBe("cases@profilerelaunch.com")
  })
})
