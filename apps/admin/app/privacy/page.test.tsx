// @vitest-environment jsdom
import React from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const loadPrivacy = vi.fn()
vi.mock("@/lib/require-staff", () => ({ requireStaff: vi.fn() }))
vi.mock("@/lib/settings/queries", () => ({
  loadPrivacy: (...args: unknown[]) => loadPrivacy(...args),
}))
vi.mock("next/link", () => ({
  default({ href, children, ...props }: { href: string; children: React.ReactNode } & Record<string, unknown>) {
    return <a href={href} {...props}>{children}</a>
  },
}))

import PrivacyPage from "./page"
import "@testing-library/jest-dom/vitest"

afterEach(() => cleanup())
beforeEach(() => loadPrivacy.mockReset())

describe("Privacy page", () => {
  it("shows holds and retained financial preview without dumping secrets", async () => {
    loadPrivacy.mockResolvedValue({
      holds: [{
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        category: "FINANCIAL",
        customerId: "22222222-2222-4222-8222-222222222222",
        reason: "Open payment dispute remains under review.",
        status: "ACTIVE",
        createdAt: "2026-03-29T12:00:00Z",
        recordVersion: 1,
      }],
      requests: [{
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
        kind: "DELETION",
        customerId: "22222222-2222-4222-8222-222222222222",
        status: "IN_REVIEW",
        requestedAt: "2026-03-29T12:00:00Z",
        scopeNote: "Customer asked for deletion of unused enquiry data.",
        recordVersion: 2,
        preview: { blockedByHold: true, automatedDeletion: false, retained: { paymentReceipts: 1, paymentObligations: 1 } },
      }],
    })
    render(await PrivacyPage())
    expect(screen.getByRole("heading", { name: "Privacy operations" })).toBeTruthy()
    expect(screen.getByText(/Legal holds block deletion/)).toBeTruthy()
    expect(screen.getByText(/Blocked by hold: yes/)).toBeTruthy()
    expect(screen.getByText(/Automated deletion: no/)).toBeTruthy()
    expect(screen.getByRole("button", { name: "Release hold" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Complete review" })).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/sk_live|whsec_|otp/i)
  })
})
