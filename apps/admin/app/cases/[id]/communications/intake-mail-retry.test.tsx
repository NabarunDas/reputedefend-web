// @vitest-environment jsdom
import React from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import type { IntakeMailRetryDestination } from "@/lib/case-intake-mail/offer"
import { IntakeMailRetryPanel } from "./intake-mail-retry"

const refresh = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }))

const CASE_ID = "11111111-1111-4111-8111-111111111111"
const destinations: [IntakeMailRetryDestination, IntakeMailRetryDestination] = [
  { role: "Customer acknowledgement", recipient: "alex@example.com", willSend: true },
  { role: "Internal notification", recipient: "owner@example.com", willSend: true },
]

afterEach(() => {
  cleanup()
  refresh.mockReset()
  vi.unstubAllGlobals()
})

function show() {
  render(<IntakeMailRetryPanel caseId={CASE_ID} publicRef="PR-26-RZYCE4" destinations={destinations} />)
}

describe("intake mail retry panel", () => {
  it("shows both destinations and waits for confirmation before posting", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({
      message: "The stored messages were accepted by the email provider.",
      receiptEmailStatus: "sent",
    }), { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)
    show()
    expect(screen.getByRole("heading", { name: "Retry unsent intake emails" })).toBeInTheDocument()
    expect(screen.getByText(/Customer acknowledgement: alex@example.com/)).toBeInTheDocument()
    expect(screen.getByText(/Internal notification: owner@example.com/)).toBeInTheDocument()
    expect(screen.getByText(/does not review or send a later message/)).toBeInTheDocument()
    const button = screen.getByRole("button", { name: "Send the unsent intake emails" })
    expect(button).toBeDisabled()
    fireEvent.click(button)
    expect(fetchMock).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole("checkbox", { name: "Send only these stored messages" }))
    expect(button).toBeEnabled()
    fireEvent.click(button)
    await screen.findByText("The stored messages were accepted by the email provider.")
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0] ?? []
    if (!init) throw new Error("missing request")
    expect(url).toBe("/api/cases/intake-mail")
    expect(init.method).toBe("POST")
    const headers = init.headers as Record<string, string>
    expect(headers["content-type"]).toBe("application/json")
    expect(headers["idempotency-key"]).toMatch(/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i)
    expect(JSON.parse(String(init.body))).toEqual({ caseId: CASE_ID, publicRef: "PR-26-RZYCE4" })
    expect(String(init.body)).not.toMatch(/@/)
    expect(button).toBeDisabled()
    fireEvent.click(button)
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it("shows a preview-protection refusal without asking for another sign-in", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      message: "The marketing preview refused the server connection. Your Admin session is still signed in.",
    }), { status: 503 }))
    vi.stubGlobal("fetch", fetchMock)
    show()
    fireEvent.click(screen.getByRole("checkbox", { name: "Send only these stored messages" }))
    fireEvent.click(screen.getByRole("button", { name: "Send the unsent intake emails" }))
    await screen.findByText("The marketing preview refused the server connection. Your Admin session is still signed in.")
    expect(screen.queryByText("Please sign in again.")).not.toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Send the unsent intake emails" })).toBeDisabled()
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it("does not leave the control ready after an acceptance-unknown result", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      message: "The stored messages were not accepted. A second send was not started.",
      receiptEmailStatus: "unavailable",
    }), { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)
    show()
    fireEvent.click(screen.getByRole("checkbox", { name: "Send only these stored messages" }))
    fireEvent.click(screen.getByRole("button", { name: "Send the unsent intake emails" }))
    await screen.findByText("The stored messages were not accepted. A second send was not started.")
    expect(screen.getByRole("button", { name: "Send the unsent intake emails" })).toBeDisabled()
    expect(fetchMock).toHaveBeenCalledOnce()
  })
})
