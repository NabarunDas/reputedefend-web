// @vitest-environment jsdom
import React from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import PortalLayout from "../layout"
import { MessagesUnavailable, MessagesView, MessageView } from "./messages-view"
import type { CustomerMessageDetail, CustomerMessagePage, CustomerMessageThread } from "@/lib/portal/messages/parse"

const nav = vi.hoisted(() => ({ pathname: "/portal/messages" }))
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname, useRouter: () => ({ push: vi.fn() }) }))

const selector = `mc-${"ab".repeat(32)}`
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
})

describe("messages page", () => {
  it("lists a customer-safe conversation and marks Messages in the navigation", () => {
    render(<PortalLayout><MessagesView page={page([thread()])} earlier={false} /></PortalLayout>)
    expect(screen.getByRole("heading", { level: 1, name: "Messages" })).toBeTruthy()
    const row = screen.getByRole("link", { name: new RegExp(longSubject) })
    expect(row).toHaveAttribute("href", `/portal/messages/${selector}`)
    expect(row).toHaveTextContent("View message")
    expect(row.querySelector(".message-chevron")).toBeTruthy()
    expect(row).not.toHaveTextContent("Open conversation")
    expect(row).toHaveTextContent("Case PR-26-ABCDEF")
    expect(row).toHaveTextContent("Harbour Bakery, High Street")
    expect(row).toHaveTextContent("4 Sept 2026, 13:00")
    expect(screen.queryByText("Plain update for you.")).toBeNull()
    expect(screen.getByRole("link", { name: "Messages" })).toHaveAttribute("aria-current", "page")
    expect(screen.queryByText(/email you sent/i)).toBeNull()
    expect(screen.queryByText(/This page does not send messages/)).toBeNull()
    expect(screen.queryByRole("textbox")).toBeNull()
    expect(screen.queryByRole("button", { name: /reply|send/i })).toBeNull()
    expect(document.body.innerHTML).not.toContain("dangerouslySetInnerHTML")
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
    rerender(<MessagesView page={{ threads: [thread()], complete: false, nextCursor: next }} earlier={false} />)
    expect(screen.getByText("Older messages are not shown on this page.")).toBeTruthy()
    expect(screen.getByRole("link", { name: "Earlier messages" }).getAttribute("href")).toContain(`selector=${selector}`)
  })

  it("shows a read failure instead of an empty inbox", () => {
    render(<MessagesUnavailable />)
    expect(screen.getByRole("heading", { name: "We couldn't load your messages" })).toBeTruthy()
    expect(screen.queryByText("You don't have any messages yet.")).toBeNull()
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
    expect(screen.getByText("Previous conversation")).toBeTruthy()
    expect(screen.getByText("Hello <strong>there</strong>")).toBeTruthy()
    expect(document.querySelector("strong")).toBeNull()
    expect(screen.getByText("Accepted by the email provider. Delivery is not confirmed.")).toBeTruthy()
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
    render(<MessageView thread={{
      ...thread({ subject: stored, state: "Message from ProfileRelaunch" }),
      complete: true,
      entries: [{ role: "ProfileRelaunch", at, subject: stored, body: "We recorded your payment of £99.00.\n\nThis message is the full stored text.", delivery: null }],
    }} />)
    expect(screen.getByRole("heading", { level: 1, name: "Payment received for your Guided Relaunch" })).toBeTruthy()
    expect(screen.getByText(stored)).toBeTruthy()
    expect(screen.getByText(/We recorded your payment of £99\.00/)).toBeTruthy()
    expect(screen.getByText("This message is the full stored text.")).toBeTruthy()
    expect(screen.getByText("4 Sept 2026, 13:00")).toBeTruthy()
    expect(screen.queryByRole("textbox")).toBeNull()
    cleanup()
    render(<MessageView thread={{
      ...thread({ subject: requested, state: "Message from ProfileRelaunch" }),
      complete: true,
      entries: [{ role: "ProfileRelaunch", at, subject: requested, body: "A payment is requested.", delivery: null }],
    }} />)
    expect(screen.getByRole("heading", { level: 1, name: "Payment requested for your Guided Relaunch" })).toBeTruthy()
    expect(screen.getByText(requested)).toBeTruthy()
    expect(screen.queryByText(stored)).toBeNull()
    expect(screen.queryByRole("textbox")).toBeNull()
  })
})
