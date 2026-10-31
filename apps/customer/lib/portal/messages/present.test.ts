import { describe, expect, it } from "vitest"
import type { CustomerMessageThread } from "./parse"
import {
  groupCustomerMessages,
  messageCountLabel,
  messageParagraphs,
  messageTextParts,
  messageTitle,
  messagesArePartial,
  messagesReturnHref,
} from "./present"

const at = "2026-09-04T12:00:00Z"
const selector = `mc-${"ab".repeat(32)}`

function thread(overrides: Partial<CustomerMessageThread> = {}): CustomerMessageThread {
  return {
    selector,
    subject: "About your case",
    caseReference: "PR-26-ABCDEF",
    businessName: "Harbour Bakery",
    locationName: "High Street",
    activityAt: at,
    state: "Open conversation",
    preview: "Plain update for you.",
    ...overrides,
  }
}

describe("message presentation", () => {
  it("uses a customer title and leaves an unmatched subject readable", () => {
    expect(messageTitle("Payment received for your ProfileRelaunch Guided Relaunch — PR-26-GHNLB9 — SO-26-GHHRGY"))
      .toBe("Payment received")
    expect(messageTitle("Payment requested for your ProfileRelaunch Guided Relaunch — PR-26-GHNLB9 — SO-26-GHHRGY"))
      .toBe("Your payment link")
    expect(messageTitle("Pay for your ProfileRelaunch Guided Relaunch — SO-26-GHHRGY"))
      .toBe("Your payment link")
    expect(messageTitle("Your Guided Relaunch submission pack is ready — PR-26-GHNLB9"))
      .toBe("Your submission pack is ready")
    expect(messageTitle("Your ProfileRelaunch quotation QT-26-ABCDEF — Case PR-26-GHNLB9"))
      .toBe("Your quotation is ready")
    expect(messageTitle("Supporting documents for your ProfileRelaunch enquiry — PR-26-GHNLB9"))
      .toBe("Supporting documents requested")
    expect(messageTitle("Supporting information for your enquiry — PR-1042"))
      .toBe("Supporting documents requested")
    expect(messageTitle(`Subject${"A".repeat(80)}`)).toBe(`Subject${"A".repeat(80)}`)
  })

  it("keeps paragraph breaks and does not treat markup as HTML", () => {
    expect(messageParagraphs("Hello\n\nThis is a second paragraph.\nStill the second.")).toEqual([
      "Hello",
      "This is a second paragraph.\nStill the second.",
    ])
    expect(messageParagraphs("Hello <strong>there</strong>")).toEqual(["Hello <strong>there</strong>"])
  })

  it("links only a trusted action or case page", () => {
    const action = "https://customer.profilerelaunch.com/action/550e8400-e29b-41d4-a716-446655440000"
    const payments = "https://customer.profilerelaunch.com/portal/cases/PR-26-ABCDEF/payments"
    const text = `Review and accept quotation\n\n${action}\n\n<script>alert(1)</script>\n${payments}?token=secret`
    const parts = messageTextParts(text)
    expect(parts.filter(part => part.type === "link")).toEqual([{ type: "link", href: action }])
    expect(parts.filter(part => part.type === "text").map(part => part.type === "text" ? part.value : "").join("")).toContain("<script>alert(1)</script>")
    expect(parts.filter(part => part.type === "text").map(part => part.type === "text" ? part.value : "").join("")).toContain(`${payments}?token=secret`)
    expect(messageTextParts(payments)).toEqual([{ type: "link", href: payments }])
    expect(messageTextParts("javascript:alert(1)")).toEqual([{ type: "text", value: "javascript:alert(1)" }])
  })

  it("groups by case, keeps other messages separate, and orders by latest activity", () => {
    const older = "2026-09-01T12:00:00Z"
    const newer = "2026-09-06T12:00:00Z"
    const groups = groupCustomerMessages([
      thread({ selector: `mm-${"cd".repeat(32)}`, activityAt: newer, caseReference: null, businessName: null, subject: "A note" }),
      thread({ activityAt: at, caseReference: "PR-26-ABCDEF", businessName: null }),
      thread({
        selector: `mc-${"ef".repeat(32)}`,
        activityAt: older,
        caseReference: "PR-26-ABCDEF",
        businessName: "Harbour Bakery",
        subject: "Earlier note",
      }),
      thread({
        selector: `mc-${"11".repeat(32)}`,
        activityAt: "2026-09-02T12:00:00Z",
        caseReference: "RV-26-ZYXWVU",
        businessName: "North Cafe",
        subject: "Another case",
      }),
    ])
    expect(groups.map(group => group.label)).toEqual(["Other messages", "Case PR-26-ABCDEF", "Case RV-26-ZYXWVU"])
    expect(groups[0].id).toBe("other-messages")
    expect(groups[0].businessName).toBeNull()
    expect(groups[1].id).toBe("case-PR-26-ABCDEF")
    expect(groups[1].businessName).toBe("Harbour Bakery")
    expect(groups[1].threads.map(item => item.activityAt)).toEqual([at, older])
    expect(groups[1].latestActivityAt).toBe(at)
  })

  it("labels a partial page without calling that count the whole case", () => {
    expect(messageCountLabel(1, false)).toBe("1 message")
    expect(messageCountLabel(2, false)).toBe("2 messages")
    expect(messageCountLabel(2, true)).toBe("2 messages on this page")
    expect(messagesArePartial({ earlier: false, complete: true })).toBe(false)
    expect(messagesArePartial({ earlier: true, complete: true })).toBe(true)
    expect(messagesArePartial({ earlier: false, complete: false })).toBe(true)
  })

  it("accepts only a messages return path for the current list page", () => {
    const group = "case-PR-26-ABCDEF"
    expect(messagesReturnHref("", group)).toBe(`/portal/messages#${group}`)
    expect(messagesReturnHref(`?before=${at}&selector=${selector}`, group))
      .toBe(`/portal/messages?before=${at}&selector=${selector}#${group}`)
    expect(messagesReturnHref("?token=secret", group)).toBeNull()
    expect(messagesReturnHref("", "case-PR-26-ABCDEF/../account")).toBeNull()
    expect(messagesReturnHref("", "other-messages")).toBe("/portal/messages#other-messages")
  })
})
