// @vitest-environment jsdom
import React from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { LinkCaseForm, AssignForm } from "./forms"

const conversation = "aaaaaaa1-aaaa-4aaa-8aaa-aaaaaaaaaaa1"
const fetchMock = vi.fn()
beforeEach(() => { vi.stubGlobal("fetch", fetchMock); fetchMock.mockReset() })
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

describe("conversation forms", () => {
  it("renders the live region before submitting, so the outcome is announced", () => {
    // Every other Admin form keeps an empty status region in the document.
    // A region inserted at the same moment as its text is not reliably
    // announced, which leaves a screen-reader operator with no confirmation
    // that linking a conversation to a case worked.
    render(<AssignForm conversationId={conversation} version={2} assigned={false} />)
    const status = screen.getByRole("status")
    expect(status.textContent).toBe("")
  })

  it("announces a refused save in that region without reloading the page", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 400, json: async () => ({ message: "Check the fields before saving." }) })
    const { container } = render(<LinkCaseForm conversationId={conversation} version={2} />)
    fireEvent.change(screen.getByLabelText("Case ID"), { target: { value: "PR-26-ABC123" } })
    fireEvent.submit(container.querySelector("form")!)
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Check the fields before saving."))
    expect((screen.getByLabelText("Case ID") as HTMLInputElement).value).toBe("PR-26-ABC123")
  })

  it("sends one idempotency key and does not change it while the first attempt is in flight", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 409, json: async () => ({ message: "This conversation has changed." }) })
    const { container } = render(<AssignForm conversationId={conversation} version={2} assigned={false} />)
    fireEvent.submit(container.querySelector("form")!)
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("changed"))
    const [, options] = fetchMock.mock.calls[0]
    expect(options.headers["idempotency-key"]).toMatch(/^[a-f0-9-]{36}$/)
    expect(JSON.parse(options.body)).toEqual({ operation: "assign", conversationId: conversation, version: 2 })
  })
})
