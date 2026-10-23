// @vitest-environment jsdom
import React from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { SendApprovedEvidenceEmail } from "./send-approved-email"

const refresh = vi.fn()
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }))

const caseId = "55555555-5555-4555-8555-555555555555"
const communicationId = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
const base = {
  caseId,
  communicationId,
  recipient: "alex@example.com",
  version: 4,
  state: "reviewed" as const,
  devSendManually: true,
}
function answer(status: number, message: string) {
  return { ok: status >= 200 && status < 300, status, json: async () => ({ message }) }
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  refresh.mockClear()
})

describe("Step 3 send approved evidence email", () => {
  it("requires one explicit click, queues the locked version, then processes only that DEV email", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(answer(200, "Queued for durable sending."))
      .mockResolvedValueOnce(answer(200, "The queued email was submitted to the email provider."))
    vi.stubGlobal("fetch", fetchMock)
    render(<SendApprovedEvidenceEmail {...base} />)
    expect(screen.getByRole("button", { name: "Send approved email" })).toBeEnabled()
    expect(fetchMock).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole("button", { name: "Send approved email" }))
    await screen.findByText(/The approved email has been processed/)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock.mock.calls.map(call => call[0])).toEqual([
      "/api/operations/communications",
      "/api/operations/dev-send-email",
    ])
    const queued = JSON.parse(String(fetchMock.mock.calls[0][1].body))
    const sent = JSON.parse(String(fetchMock.mock.calls[1][1].body))
    expect(queued).toEqual({ operation: "queue", communicationId, version: 4 })
    expect(sent).toEqual({ communicationId, confirmed: true })
    const queueKey = fetchMock.mock.calls[0][1].headers["idempotency-key"]
    const sendKey = fetchMock.mock.calls[1][1].headers["idempotency-key"]
    expect(queueKey).toMatch(/^[0-9a-f-]{36}$/i)
    expect(sendKey).toMatch(/^[0-9a-f-]{36}$/i)
    expect(sendKey).not.toEqual(queueKey)
    expect(refresh).toHaveBeenCalledTimes(1)
    fireEvent.click(screen.getByRole("button", { name: "Send approved email" }))
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("never invokes the provider after a queue rejection or uncertain queue outcome", async () => {
    const fetchMock = vi.fn().mockResolvedValue(answer(409, "The communication changed. Reload first."))
    vi.stubGlobal("fetch", fetchMock)
    render(<SendApprovedEvidenceEmail {...base} />)
    fireEvent.click(screen.getByRole("button", { name: "Send approved email" }))
    await screen.findByText(/The communication changed/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(screen.getByRole("button", { name: "Reload email status" })).toBeInTheDocument()
    fireEvent.click(screen.getByRole("button", { name: "Send approved email" }))
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it("reports a queued but unconfirmed DEV provider result and never retries implicitly", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(answer(200, "Queued"))
      .mockResolvedValueOnce(answer(403, "Sign out and sign in with a new email code."))
    vi.stubGlobal("fetch", fetchMock)
    render(<SendApprovedEvidenceEmail {...base} />)
    fireEvent.click(screen.getByRole("button", { name: "Send approved email" }))
    await screen.findByText(/The email is queued, but provider acceptance is not confirmed/)
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(screen.getByRole("link", { name: "View communication history" })).toHaveAttribute("href", `/cases/${caseId}/communications`)
    expect(refresh).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: "Send approved email" })).toBeDisabled()
  })

  it("processes an already queued DEV email without queueing it again", async () => {
    const fetchMock = vi.fn().mockResolvedValue(answer(200, "The queued email was submitted to the email provider."))
    vi.stubGlobal("fetch", fetchMock)
    render(<SendApprovedEvidenceEmail {...base} state="queued" />)
    expect(screen.getByRole("button", { name: "Send queued email" })).toBeEnabled()
    fireEvent.click(screen.getByRole("button", { name: "Send queued email" }))
    await screen.findByText(/The approved email has been processed/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe("/api/operations/dev-send-email")
  })

  it("queues only when the environment uses an automatic worker", async () => {
    const fetchMock = vi.fn().mockResolvedValue(answer(200, "Queued"))
    vi.stubGlobal("fetch", fetchMock)
    render(<SendApprovedEvidenceEmail {...base} devSendManually={false} />)
    fireEvent.click(screen.getByRole("button", { name: "Send approved email" }))
    await screen.findByText(/queued for sending/)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock.mock.calls[0][0]).toBe("/api/operations/communications")
  })

  it("disables repeated submission while queueing", async () => {
    let resolveQueue: (value: ReturnType<typeof answer>) => void = () => undefined
    const fetchMock = vi.fn()
      .mockImplementationOnce(() => new Promise(resolve => { resolveQueue = resolve }))
      .mockResolvedValueOnce(answer(200, "Provider accepted"))
    vi.stubGlobal("fetch", fetchMock)
    render(<SendApprovedEvidenceEmail {...base} />)
    const button = screen.getByRole("button", { name: "Send approved email" })
    fireEvent.click(button)
    fireEvent.click(button)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    resolveQueue(answer(200, "Queued"))
    await screen.findByText(/The approved email has been processed/)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
