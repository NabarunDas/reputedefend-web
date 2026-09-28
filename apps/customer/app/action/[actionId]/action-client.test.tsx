// @vitest-environment jsdom
import React from "react"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { ActionClient } from "./action-client"

const fetchMock = vi.fn()
const actionId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const session = {
  actionId,
  kind: "AGREEMENT_ACCEPTANCE",
  status: "OPEN",
  maskedEmail: "d***@gmail.com",
  caseReference: "PR-26-ABCDEF",
  businessName: "Bakery",
  agreement: {
    title: "Managed recovery service agreement",
    body: "This is the owner-approved service wording for this exact case snapshot.",
    scope: "Restore the listed Google Business Profile for this case only.",
    kind: "SERVICE_AGREEMENT",
  },
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock)
  fetchMock.mockReset()
  window.localStorage.clear()
  window.sessionStorage.clear()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

async function renderAfterExchange(maskedEmail = "d***@gmail.com") {
  window.history.replaceState(null, "", `/action/${actionId}#t=${"b".repeat(64)}`)
  fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ status: "ok", maskedEmail }) })
  render(<ActionClient actionId={actionId} />)
  await waitFor(() => expect(screen.getByRole("button", { name: "Send code" })).toBeTruthy())
}

async function sendCodeSuccessfully() {
  fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ status: "ok", maskedEmail: "d***@gmail.com" }) })
  fireEvent.click(screen.getByRole("button", { name: "Send code" }))
  await waitFor(() => expect(screen.getByRole("button", { name: "Verify code" })).toBeTruthy())
}

describe("customer action page", () => {
  it("exchanges the fragment secret and removes it without using web storage", async () => {
    await renderAfterExchange("a***@example.com")
    expect(window.location.hash).toBe("")
    expect(window.localStorage.length).toBe(0)
    expect(window.sessionStorage.length).toBe(0)
    expect(JSON.stringify(fetchMock.mock.calls[0][1].body)).toContain("b".repeat(64))
    expect(screen.getByText(/a\*\*\*@example.com/)).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/googletagmanager|dashboard|Submit to Google/i)
  })

  it("shows Send code and hides OTP controls until the code is sent", async () => {
    await renderAfterExchange()
    expect(screen.getByRole("button", { name: "Send code" })).toBeTruthy()
    expect(screen.getByText(/d\*\*\*@gmail.com/)).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Verify code" })).toBeNull()
    expect(screen.queryByLabelText("Six-digit code")).toBeNull()
    expect(screen.queryByText(/We sent a six-digit code/)).toBeNull()
  })

  it("hides Send code and shows Verify after a successful send", async () => {
    await renderAfterExchange()
    await sendCodeSuccessfully()
    expect(screen.queryByRole("button", { name: "Send code" })).toBeNull()
    expect(screen.getByRole("button", { name: "Verify code" })).toBeTruthy()
    expect(screen.getByLabelText("Six-digit code")).toBeTruthy()
    expect(screen.getByText(/We sent a six-digit code to d\*\*\*@gmail.com/)).toBeTruthy()
    expect(document.body.textContent).not.toContain("das.nabarun@gmail.com")
    expect(screen.queryByRole("button", { name: "Resend code" })).toBeNull()
  })

  it("removes OTP controls and shows the agreement after verification", async () => {
    await renderAfterExchange()
    await sendCodeSuccessfully()
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ status: "ok", session }) })
    fireEvent.change(screen.getByLabelText("Six-digit code"), { target: { value: "123456" } })
    fireEvent.click(screen.getByRole("button", { name: "Verify code" }))
    await waitFor(() => expect(screen.getByRole("button", { name: "Accept" })).toBeTruthy())
    expect(screen.getByText("Managed recovery service agreement")).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Send code" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Verify code" })).toBeNull()
    expect(screen.queryByLabelText("Six-digit code")).toBeNull()
    expect(screen.queryByText(/We sent a six-digit code/)).toBeNull()
  })

  it("shows only the completed state after acceptance", async () => {
    await renderAfterExchange()
    await sendCodeSuccessfully()
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ status: "ok", session }) })
    fireEvent.change(screen.getByLabelText("Six-digit code"), { target: { value: "123456" } })
    fireEvent.click(screen.getByRole("button", { name: "Verify code" }))
    await waitFor(() => expect(screen.getByRole("button", { name: "Accept" })).toBeTruthy())
    fireEvent.click(screen.getByRole("checkbox"))
    fetchMock.mockResolvedValueOnce({ ok: true, json: async () => ({ status: "ok" }) })
    fireEvent.click(screen.getByRole("button", { name: "Accept" }))
    await waitFor(() => expect(screen.getByText("This action is complete.")).toBeTruthy())
    expect(screen.queryByRole("button", { name: "Send code" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Verify code" })).toBeNull()
    expect(screen.queryByLabelText("Six-digit code")).toBeNull()
    expect(screen.queryByRole("button", { name: "Accept" })).toBeNull()
  })

  it("does not claim a code was sent when the provider fails", async () => {
    await renderAfterExchange()
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({ message: "This secure action is unavailable or has expired. Contact ProfileRelaunch if you need a new link." }) })
    fireEvent.click(screen.getByRole("button", { name: "Send code" }))
    await waitFor(() => expect(screen.getByText(/unavailable or has expired/)).toBeTruthy())
    expect(screen.queryByText(/We sent a six-digit code/)).toBeNull()
    expect(screen.queryByRole("button", { name: "Verify code" })).toBeNull()
    expect(screen.queryByLabelText("Six-digit code")).toBeNull()
  })

  it("keeps the send screen and shows the server message on 429", async () => {
    await renderAfterExchange()
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({ message: "This secure action is unavailable or has expired. Contact ProfileRelaunch if you need a new link." }),
    })
    fireEvent.click(screen.getByRole("button", { name: "Send code" }))
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/unavailable or has expired/))
    expect(screen.getByRole("button", { name: "Send code" })).toBeTruthy()
    expect(screen.queryByText(/We sent a six-digit code/)).toBeNull()
    expect(screen.queryByRole("button", { name: "Verify code" })).toBeNull()
    expect(screen.queryByLabelText("Six-digit code")).toBeNull()
  })
})
