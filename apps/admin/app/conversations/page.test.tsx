// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"

const loadConversations = vi.fn()
const loadConversation = vi.fn()
vi.mock("@/lib/conversations/queries", () => ({
  loadConversations: (...args: unknown[]) => loadConversations(...args),
  loadConversation: (...args: unknown[]) => loadConversation(...args),
}))

import ConversationsPage from "./page"

afterEach(() => cleanup())
beforeEach(() => {
  loadConversations.mockReset()
  loadConversation.mockReset()
})

describe("conversations page", () => {
  it("shows unmatched triage without treating a sender match as authentication", async () => {
    loadConversations.mockResolvedValue({
      conversations: [{
        id: "77777777-7777-4777-8777-777777777777",
        state: "UNMATCHED",
        subject: "Help with a listing",
        sender: "alex@example.com",
        receivedAt: "2026-09-29T12:00:00.000Z",
        caseId: null,
        caseReference: null,
        senderMatch: "MATCHES_VERIFIED_CONTACT",
        hasAttachment: true,
        assignedAdminId: null,
        needsAttention: true,
        version: 1,
      }],
    })
    loadConversation.mockResolvedValue(null)
    render(await ConversationsPage({ searchParams: Promise.resolve({}) }))
    expect(screen.getByRole("heading", { name: "Conversations" })).toBeTruthy()
    expect(screen.getByText("Matches a verified contact — not authentication")).toBeTruthy()
    expect(screen.getByText("Has attachment")).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/RESEND_API_KEY|webhook secret|#t=/i)
    expect(document.body.textContent).toMatch(/Google Workspace inbox/)
  })

  it("links a case-linked conversation to the case communications workspace", async () => {
    loadConversations.mockResolvedValue({
      conversations: [{
        id: "77777777-7777-4777-8777-777777777777",
        state: "OPEN",
        subject: "Reply about the listing",
        sender: "alex@example.com",
        receivedAt: "2026-09-29T12:00:00.000Z",
        caseId: "55555555-5555-4555-8555-555555555555",
        caseReference: "PR-26-6CKR5M",
        senderMatch: "NONE",
        hasAttachment: false,
        assignedAdminId: null,
        needsAttention: false,
        version: 2,
      }],
    })
    loadConversation.mockResolvedValue(null)
    render(await ConversationsPage({ searchParams: Promise.resolve({}) }))
    expect(screen.getByRole("link", { name: "Open the case communications workspace" })).toHaveAttribute(
      "href",
      "/cases/55555555-5555-4555-8555-555555555555/communications",
    )
  })
})
