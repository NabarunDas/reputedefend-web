// @vitest-environment jsdom
import React from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import PortalLayout from "../layout"
import { MessagesUnavailable, MessagesView, MessageView } from "./messages-view"
import { MESSAGES_RETURN_KEY } from "@/lib/portal/messages/present"
import type { CustomerMessageDetail, CustomerMessagePage, CustomerMessageThread } from "@/lib/portal/messages/parse"

const nav = vi.hoisted(() => ({ pathname: "/portal/messages" }))
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname, useRouter: () => ({ push: vi.fn() }) }))

const selector = `mc-${"ab".repeat(32)}`
const secondSelector = `mc-${"cd".repeat(32)}`
const at = "2026-09-04T12:00:00Z"
const longSubject = `Subject${"A".repeat(80)}`

function thread(overrides: Partial<CustomerMessageThread> = {}): CustomerMessageThread {
  return {
    selector,
    subject: longSubject,
    caseReference: "PR-26-ABCDEF",
    businessName: "Harbour Bakery",
    locationName: "High Street",
    activityAt: at,
    state: "Open conversation",
    preview: "Plain update for you.",
    ...overrides,
  }
}

function page(threads: CustomerMessageThread[], next: CustomerMessagePage["nextCursor"] = null): CustomerMessagePage {
  return { threads, complete: next === null, nextCursor: next }
}

afterEach(() => {
  cleanup()
  nav.pathname = "/portal/messages"
  sessionStorage.clear()
  window.location.hash = ""
})

describe("messages page", () => {
  it("lists one expanded case without repeating the case on the message row", () => {
    render(<PortalLayout><MessagesView page={page([thread()])} earlier={false} /></PortalLayout>)
    expect(screen.getByRole("heading", { level: 1, name: "Messages" })).toBeTruthy()
    const group = screen.getByRole("button", { name: /Case PR-26-ABCDEF/ })
    expect(group).toHaveAttribute("aria-expanded", "true")
    expect(group).toHaveAttribute("type", "button")
    expect(group).toHaveTextContent("Harbour Bakery")
    expect(group).toHaveTextContent("1 message")
    expect(group).not.toHaveTextContent("on this page")
    expect(group).toHaveTextContent("4 Sept 2026, 13:00")
    const row = screen.getByRole("link", { name: new RegExp(longSubject) })
    expect(row).toHaveAttribute("href", `/portal/messages/${selector}`)
    expect(row).toHaveTextContent("View message")
    expect(row.querySelector(".message-chevron")).toBeTruthy()
    expect(row.querySelector("a, button")).toBeNull()
    expect(row).not.toHaveTextContent("Open conversation")
    expect(row).not.toHaveTextContent("Case PR-26-ABCDEF")
    expect(row).not.toHaveTextContent("Harbour Bakery")
    expect(row).not.toHaveTextContent("Plain update for you.")
    expect(row).toHaveTextContent("4 Sept 2026, 13:00")
    expect(screen.queryByText("Plain update for you.")).toBeNull()
    expect(screen.getByRole("link", { name: "Messages" })).toHaveAttribute("aria-current", "page")
    expect(screen.queryByText(/email you sent/i)).toBeNull()
    expect(screen.queryByText(/This page does not send messages/)).toBeNull()
    expect(screen.queryByRole("textbox")).toBeNull()
    expect(screen.queryByRole("button", { name: /reply|send/i })).toBeNull()
    expect(document.body.innerHTML).not.toContain("dangerouslySetInnerHTML")
    group.focus()
    expect(group).toHaveFocus()
    fireEvent.click(group)
    expect(group).toHaveAttribute("aria-expanded", "false")
    expect(screen.queryByRole("link", { name: new RegExp(longSubject) })).toBeNull()
    fireEvent.click(group)
    expect(screen.getByRole("link", { name: new RegExp(longSubject) })).toBeTruthy()
  })

  it("opens the latest case and keeps another case collapsed until it is chosen", () => {
    render(<MessagesView page={page([
      thread({ activityAt: "2026-09-06T12:00:00Z", caseReference: "PR-26-ABCDEF", subject: "Latest update" }),
      thread({
        selector: secondSelector,
        activityAt: "2026-09-01T12:00:00Z",
        caseReference: "RV-26-ZYXWVU",
        businessName: "North Cafe",
        subject: "Older case update",
        preview: "Do not show this excerpt.",
      }),
    ])} earlier={false} />)
    const latest = screen.getByRole("button", { name: /Case PR-26-ABCDEF/ })
    const older = screen.getByRole("button", { name: /Case RV-26-ZYXWVU/ })
    expect(latest.compareDocumentPosition(older) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(latest).toHaveAttribute("aria-expanded", "true")
    expect(older).toHaveAttribute("aria-expanded", "false")
    expect(older).toHaveTextContent("North Cafe")
    expect(older).toHaveTextContent("1 message")
    expect(screen.getByRole("link", { name: /Latest update/ })).toBeTruthy()
    expect(screen.queryByRole("link", { name: /Older case update/ })).toBeNull()
    expect(screen.queryByText("Do not show this excerpt.")).toBeNull()
    fireEvent.click(older)
    expect(older).toHaveAttribute("aria-expanded", "true")
    expect(latest).toHaveAttribute("aria-expanded", "true")
    const olderRow = screen.getByRole("link", { name: /Older case update/ })
    expect(olderRow).toHaveAttribute("href", `/portal/messages/${secondSelector}`)
    expect(olderRow).not.toHaveTextContent("North Cafe")
    expect(olderRow).not.toHaveTextContent("RV-26-ZYXWVU")
  })

  it("opens the case named in the return hash and leaves the latest case collapsed", () => {
    window.location.hash = "#case-RV-26-ZYXWVU"
    render(<MessagesView page={page([
      thread({ activityAt: "2026-09-06T12:00:00Z", subject: "Latest update" }),
      thread({
        selector: secondSelector,
        activityAt: "2026-09-01T12:00:00Z",
        caseReference: "RV-26-ZYXWVU",
        businessName: "North Cafe",
        subject: "Older case update",
      }),
    ])} earlier={false} />)
    expect(screen.getByRole("button", { name: /Case RV-26-ZYXWVU/ })).toHaveAttribute("aria-expanded", "true")
    expect(screen.getByRole("button", { name: /Case PR-26-ABCDEF/ })).toHaveAttribute("aria-expanded", "false")
    expect(screen.getByRole("link", { name: /Older case update/ })).toBeTruthy()
    expect(screen.queryByRole("link", { name: /Latest update/ })).toBeNull()
  })

  it("keeps messages without a case in a separate group and omits a missing business name", () => {
    render(<MessagesView page={page([
      thread({
        selector: `mm-${"ef".repeat(32)}`,
        activityAt: "2026-09-06T12:00:00Z",
        caseReference: null,
        businessName: null,
        locationName: null,
        subject: "Account note",
      }),
      thread({ businessName: null, subject: "Case note" }),
    ])} earlier={false} />)
    expect(screen.getByRole("button", { name: /Other messages/ })).toHaveAttribute("aria-expanded", "true")
    const caseGroup = screen.getByRole("button", { name: /Case PR-26-ABCDEF/ })
    expect(caseGroup).not.toHaveTextContent("Harbour Bakery")
    expect(caseGroup).toHaveTextContent("1 message")
    expect(screen.getByRole("link", { name: /Account note/ })).not.toHaveTextContent("ProfileRelaunch")
  })

  it("uses the empty state only when the read succeeded and there is nothing to show", () => {
    render(<MessagesView page={page([])} earlier={false} />)
    expect(screen.getByText("You don't have any messages yet.")).toBeTruthy()
    expect(screen.queryByText("We couldn't load your messages")).toBeNull()
  })

  it("says when an earlier page is empty and when the current page is not the whole history", () => {
    const { rerender } = render(<MessagesView page={page([])} earlier />)
    expect(screen.getByText("No earlier messages.")).toBeTruthy()
    expect(screen.getByRole("link", { name: "Back to messages" })).toHaveAttribute("href", "/portal/messages")
    const next = { activityAt: at, selector }
    rerender(<MessagesView page={{ threads: [thread(), thread({ selector: secondSelector, subject: "Second update" })], complete: false, nextCursor: next }} earlier={false} />)
    expect(screen.getByRole("button", { name: /Case PR-26-ABCDEF/ })).toHaveTextContent("2 messages on this page")
    expect(screen.getByText("Older messages are not shown on this page.")).toBeTruthy()
    expect(screen.getByText("Counts are for the messages on this page.")).toBeTruthy()
    expect(screen.getByRole("link", { name: "Earlier messages" }).getAttribute("href")).toContain(`selector=${selector}`)
  })

  it("shows a read failure instead of an empty inbox", () => {
    render(<MessagesUnavailable />)
    expect(screen.getByRole("heading", { name: "We couldn't load your messages" })).toBeTruthy()
    expect(screen.queryByText("You don't have any messages yet.")).toBeNull()
  })

  it("remembers the list page when a message row is opened", () => {
    render(<MessagesView page={page([thread()])} earlier={false} />)
    const row = screen.getByRole("link", { name: new RegExp(longSubject) })
    row.addEventListener("click", event => event.preventDefault())
    fireEvent.click(row)
    expect(sessionStorage.getItem(MESSAGES_RETURN_KEY)).toBe("/portal/messages#case-PR-26-ABCDEF")
  })

  it("renders message text as text, including markup, and does not claim the thread was read", () => {
    const detail: CustomerMessageDetail = {
      ...thread({ state: "Previous conversation" }),
      complete: false,
      entries: [
        {
          role: "ProfileRelaunch",
          at,
          subject: "About your case",
          body: "Hello <strong>there</strong>",
          delivery: "Accepted by the email provider. Delivery is not confirmed.",
        },
        {
          role: "From your verified email address",
          at: "2026-09-05T12:00:00Z",
          subject: null,
          body: "Thanks, this is my reply.",
          delivery: null,
        },
      ],
    }
    render(<MessageView thread={detail} />)
    expect(screen.getByRole("heading", { level: 1, name: longSubject })).toBeTruthy()
    expect(screen.getByRole("link", { name: "Back to messages" })).toHaveAttribute("href", "/portal/messages#case-PR-26-ABCDEF")
    expect(screen.getByText("Previous conversation")).toBeTruthy()
    expect(screen.getByText("Hello <strong>there</strong>")).toBeTruthy()
    expect(document.querySelector("strong")).toBeNull()
    expect(screen.getByText("Accepted by the email provider. Delivery is not confirmed.")).toBeTruthy()
    expect(screen.queryByText("Delivered by email")).toBeNull()
    expect(screen.getByRole("heading", { level: 2, name: "From your verified email address" })).toBeTruthy()
    expect(screen.queryByRole("heading", { name: "You" })).toBeNull()
    expect(screen.getByText("Thanks, this is my reply.")).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/authenticated sender|confirmed sender|confirmed customer|verified sender|sent by you|MATCHES_VERIFIED_CONTACT/i)
    expect(screen.getByText("To reply, use the email ProfileRelaunch sent you.")).toBeTruthy()
    expect(screen.getByText("Earlier messages in this conversation are not shown here.")).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/\b(read|seen|opened)\b/i)
  })

  it("keeps the stored subject and body on the message page", () => {
    const stored = "Payment received for your ProfileRelaunch Guided Relaunch — PR-26-GHNLB9 — SO-26-GHHRGY"
    const requested = "Payment requested for your ProfileRelaunch Guided Relaunch — PR-26-GHNLB9 — SO-26-GHHRGY"
    const payments = "https://customer.profilerelaunch.com/portal/cases/PR-26-GHNLB9/payments"
    render(<MessageView thread={{
      ...thread({ subject: stored, state: "Message from ProfileRelaunch" }),
      complete: true,
      entries: [{
        role: "ProfileRelaunch",
        at,
        subject: stored,
        body: `We recorded your payment of £99.00.\n\nThis message is the full stored text.\n\n${payments}`,
        delivery: "Delivered by email",
      }],
    }} />)
    expect(screen.getByRole("heading", { level: 1, name: "Payment received" })).toBeTruthy()
    expect(screen.getByText(stored)).toBeTruthy()
    expect(screen.getByText(/We recorded your payment of £99\.00/)).toBeTruthy()
    expect(screen.getByText("This message is the full stored text.")).toBeTruthy()
    expect(screen.getByRole("link", { name: payments })).toHaveAttribute("href", payments)
    expect(screen.getByText("Delivered by email")).toBeTruthy()
    expect(screen.getByText("4 Sept 2026, 13:00")).toBeTruthy()
    expect(screen.queryByRole("textbox")).toBeNull()
    cleanup()
    render(<MessageView thread={{
      ...thread({ subject: requested, state: "Message from ProfileRelaunch" }),
      complete: true,
      entries: [{ role: "ProfileRelaunch", at, subject: requested, body: "A payment is requested.", delivery: null }],
    }} />)
    expect(screen.getByRole("heading", { level: 1, name: "Your payment link" })).toBeTruthy()
    expect(screen.getByText(requested)).toBeTruthy()
    expect(screen.queryByText(stored)).toBeNull()
    expect(screen.queryByText("Delivered by email")).toBeNull()
    expect(screen.queryByRole("textbox")).toBeNull()
  })

  it("returns to the list page that opened the message", () => {
    const stored = `/portal/messages?before=${at}&selector=${selector}#case-PR-26-ABCDEF`
    sessionStorage.setItem(MESSAGES_RETURN_KEY, stored)
    render(<MessageView thread={{
      ...thread(),
      complete: true,
      entries: [{ role: "ProfileRelaunch", at, subject: null, body: "Hello.", delivery: null }],
    }} />)
    expect(screen.getByRole("link", { name: "Back to messages" })).toHaveAttribute("href", stored)
  })

  function messageThread(body: string, role: CustomerMessageDetail["entries"][number]["role"] = "ProfileRelaunch") {
    return {
      ...thread({ subject: "A longer update", state: "Message from ProfileRelaunch" }),
      complete: true,
      entries: [{ role, at, subject: null, body, delivery: null }],
    }
  }

  it("keeps a short message fully visible, including markup-like text", () => {
    render(<MessageView thread={messageThread("Hello <strong>there</strong><script>alert(1)</script>")} />)
    expect(screen.getByText("Hello <strong>there</strong><script>alert(1)</script>")).toBeTruthy()
    expect(document.querySelector(".messages-page strong, .messages-page script")).toBeNull()
    expect(screen.queryByRole("button", { name: /expand message|collapse message/i })).toBeNull()
    expect(document.body.innerHTML).not.toContain("dangerouslySetInnerHTML")
  })

  it("shows a long message in full, including every paragraph and line break", () => {
    const first = `Alpha ${"word ".repeat(90)}`.trim()
    const second = `Beta ${"word ".repeat(90)}end.`.trim()
    const body = `${first}\n\n${second}\nStill in the second.`
    render(<MessageView thread={messageThread(body)} />)
    expect(screen.queryByRole("button", { name: /expand message|collapse message/i })).toBeNull()
    const text = document.querySelector(".message-body")?.textContent ?? ""
    expect(text).toContain(first)
    expect(text).toContain("end.")
    expect(text).toContain("Still in the second.")
    expect(document.querySelector(".message-entry-team")).toBeTruthy()
    expect(screen.getByText("To reply, use the email ProfileRelaunch sent you.")).toBeTruthy()
  })

  it("shows one long entry and a short neighbour together, and keeps hostile text as text", () => {
    const hostile = `<script>alert("xss")</script> ${"paragraph ".repeat(80)} <img src=x onerror=alert(1)>`
    const shortReply = "Thanks, this is my reply."
    const action = "https://customer.profilerelaunch.com/action/550e8400-e29b-41d4-a716-446655440000"
    render(<MessageView thread={{
      ...thread({ subject: "A longer update", state: "Open conversation" }),
      complete: true,
      entries: [
        { role: "ProfileRelaunch", at, subject: null, body: `${hostile}\n\n${action}`, delivery: null },
        { role: "From your verified email address", at: "2026-09-05T12:00:00Z", subject: null, body: shortReply, delivery: null },
      ],
    }} />)
    expect(screen.getByText(shortReply)).toBeTruthy()
    expect(document.querySelector(".message-body")?.textContent).toContain(hostile)
    expect(screen.getByRole("link", { name: action })).toHaveAttribute("href", action)
    expect(screen.queryByRole("button", { name: /expand message|collapse message/i })).toBeNull()
    expect(document.querySelector(".messages-page script, .messages-page img")).toBeNull()
    expect(document.querySelector(".messages-page script, .messages-page img, .messages-page strong")).toBeNull()
    expect(document.body.textContent).not.toMatch(/\b(read|seen|opened)\b/i)
    expect(document.body.innerHTML).not.toContain("dangerouslySetInnerHTML")
  })
})
