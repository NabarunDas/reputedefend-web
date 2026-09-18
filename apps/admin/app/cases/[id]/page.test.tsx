// @vitest-environment jsdom
import React from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import type { CaseDetail } from "@/lib/cases/model"

const getCase = vi.fn()
vi.mock("@/lib/cases/queries", () => ({ getCase: (...args: unknown[]) => getCase(...args) }))
vi.mock("next/link", () => ({
  default({ href, children, ...props }: { href: string; children: React.ReactNode } & Record<string, unknown>) {
    return <a href={href} {...props}>{children}</a>
  },
}))
vi.mock("../forms", () => ({
  PlanForm: () => null, TransitionForm: () => null, NoteForm: () => null, TaskForm: () => null,
  ResolveTask: () => null, SubmissionForm: () => null, ResolveSubmission: () => null, CloseForm: () => null,
}))

import CasePage from "./page"

afterEach(() => cleanup())
beforeEach(() => getCase.mockReset())

describe("case evidence entry", () => {
  it("links the case to the evidence workspace", async () => {
    getCase.mockResolvedValue({
      id: "55555555-5555-4555-8555-555555555555",
      reference: "PR-1",
      client: "Alex",
      business: "Bakery",
      type: "PROFILE_RECOVERY",
      stage: "EVIDENCE_COLLECTION",
      track: "UNDECIDED",
      status: "OPEN",
      priority: "NORMAL",
      assigned: true,
      nextAction: "",
      due: null,
      firstResponseDue: null,
      issue: "Profile suspended",
      reviewUrl: null,
      customerId: "22222222-2222-4222-8222-222222222222",
      businessId: "33333333-3333-4333-8333-333333333333",
      locationId: "44444444-4444-4444-8444-444444444444",
      version: 1,
      outcome: null,
      summary: "",
      createdAt: "2026-09-18T10:00:00.000Z",
      events: [],
      tasks: [],
      submissions: [],
      transitions: [],
      customerPreview: { reference: "PR-1", type: "PROFILE_RECOVERY", summary: "", notes: [] },
    } as unknown as CaseDetail)
    render(await CasePage({ params: Promise.resolve({ id: "55555555-5555-4555-8555-555555555555" }), searchParams: Promise.resolve({}) }))
    expect(screen.getByRole("heading", { name: "Evidence & Documents" })).toBeTruthy()
    expect(screen.getByRole("link", { name: "Open evidence workspace" })).toHaveAttribute("href", "/cases/55555555-5555-4555-8555-555555555555/evidence")
    expect(screen.queryByRole("link", { name: /customer portal/i })).toBeNull()
    expect(document.body.innerHTML).not.toMatch(/href=["'][^"']*customer[^"']*portal/i)
  })
})
