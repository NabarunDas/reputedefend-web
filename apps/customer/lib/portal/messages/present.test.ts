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
  messagesReturnStorageKey,
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
    expect(messageTitle("Payment received — Case PR-26-GHNLB9")).toBe("Payment received")
    expect(messageTitle("Your quotation is ready — Case RV-26-REVW2K")).toBe("Your quotation is ready")
    expect(messageTitle("Relaunch Guard update for High Street — Service order SO-26-GHHRGY"))
      .toBe("Relaunch Guard update for High Street")
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

  it("links only an approved Production or DEV customer action or portal URL", () => {
    const action = "https://customer.profilerelaunch.com/action/550e8400-e29b-41d4-a716-446655440000"
    const payments = "https://customer.profilerelaunch.com/portal/cases/PR-26-ABCDEF/payments"
    const documents = "https://customer.profilerelaunch.com/portal/cases/PR-26-ABCDEF/documents"
    const casePage = "https://customer.profilerelaunch.com/portal/cases/RV-26-ZYXWVU"
    const devAction = "https://profilerelaunch-customer-git-develop-clientcove.vercel.app/action/550e8400-e29b-41d4-a716-446655440000"
    const devPayments = "https://profilerelaunch-customer-git-develop-clientcove.vercel.app/portal/cases/PR-26-ABCDEF/payments"
    const lookalike = "https://customer.profilerelaunch.com.evil.example/action/550e8400-e29b-41d4-a716-446655440000"
    const subdomain = "https://evil.customer.profilerelaunch.com/portal/cases/PR-26-ABCDEF"
    const otherHost = "https://example.com/portal/cases/PR-26-ABCDEF/payments"
    const featurePreview = "https://profilerelaunch-customer-git-feature-clientcove.vercel.app/portal/cases/PR-26-ABCDEF"
    const attacker = "https://profilerelaunch-customer-git-develop-attacker.vercel.app/action/550e8400-e29b-41d4-a716-446655440000"
    const attackerPayments = "https://profilerelaunch-customer-git-develop-attacker.vercel.app/portal/cases/PR-26-ABCDEF/payments"
    const attackerDocuments = "https://profilerelaunch-customer-git-develop-attacker.vercel.app/portal/cases/PR-26-ABCDEF/documents"
    const nearTeam = "https://profilerelaunch-customer-git-develop-clientcove-attacker.vercel.app/portal/cases/PR-26-ABCDEF"
    const devSuffix = "https://profilerelaunch-customer-git-develop-clientcove.vercel.app.evil.example/action/550e8400-e29b-41d4-a716-446655440000"
    const redirect = `${payments}?next=https://evil.example`
    const userinfo = "https://user:secret@customer.profilerelaunch.com/action/550e8400-e29b-41d4-a716-446655440000"
    const atHost = "https://customer.profilerelaunch.com@evil.example/action/550e8400-e29b-41d4-a716-446655440000"
    const malformed = "https://customer.profilerelaunch.com/action/not-a-uuid"
    const http = "http://customer.profilerelaunch.com/portal/cases/PR-26-ABCDEF"
    const text = [
      "Review and accept quotation",
      action,
      "<script>alert(1)</script>",
      redirect,
      lookalike,
      attacker,
      devAction,
    ].join("\n")
    const parts = messageTextParts(text)
    expect(parts.filter(part => part.type === "link")).toEqual([
      { type: "link", href: action },
      { type: "link", href: devAction },
    ])
    const plain = parts.filter(part => part.type === "text").map(part => part.type === "text" ? part.value : "").join("")
    expect(plain).toContain("<script>alert(1)</script>")
    expect(plain).toContain(redirect)
    expect(plain).toContain(lookalike)
    expect(plain).toContain(attacker)
    const devDocuments = "https://profilerelaunch-customer-git-develop-clientcove.vercel.app/portal/cases/RV-26-ZYXWVU/documents"
    const devCase = "https://profilerelaunch-customer-git-develop-clientcove.vercel.app/portal/cases/PR-26-ABCDEF"
    for (const href of [payments, documents, casePage, devPayments, devDocuments, devCase]) {
      expect(messageTextParts(href)).toEqual([{ type: "link", href }])
    }
    for (const href of [subdomain, otherHost, featurePreview, attacker, attackerPayments, attackerDocuments, nearTeam, devSuffix, userinfo, atHost, malformed, http, "javascript:alert(1)", "https://", "https://customer.profilerelaunch.com/login"]) {
      expect(messageTextParts(href)).toEqual([{ type: "text", value: href }])
    }
  })

  it("binds a return path to one message and one portal session", () => {
    const context = "a".repeat(32)
    const other = "b".repeat(32)
    const group = "case-PR-26-ABCDEF"
    const href = messagesReturnHref(`?before=${at}&selector=${selector}`, group)
    expect(messagesReturnStorageKey(context, selector)).toBe(`pr-messages-return:${context}:${selector}`)
    expect(messagesReturnStorageKey(context, selector)).not.toBe(messagesReturnStorageKey(other, selector))
    expect(messagesReturnStorageKey(context, `mc-${"cd".repeat(32)}`)).not.toBe(messagesReturnStorageKey(context, selector))
    expect(messagesReturnStorageKey("", selector)).toBeNull()
    expect(messagesReturnStorageKey(context, "not-a-message")).toBeNull()
    expect(messagesReturnStorageKey("A".repeat(32), selector)).toBeNull()
    expect(href).toBe(`/portal/messages?before=${at}&selector=${selector}#${group}`)
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
