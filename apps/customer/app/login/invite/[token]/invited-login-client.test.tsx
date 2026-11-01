// @vitest-environment jsdom
import React from "react"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { INVITED_LOGIN_MESSAGE, INVITED_LOGIN_UNAVAILABLE } from "@/lib/portal/email"
import { InvitedLoginClient } from "./invited-login-client"

const replaceDocument = vi.hoisted(() => vi.fn())
vi.mock("@/lib/portal/account/document", () => ({
  replaceAuthenticatedDocument: replaceDocument,
}))

const fetchMock = vi.fn()
const token = "ab".repeat(32)

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock)
  fetchMock.mockReset()
  replaceDocument.mockReset()
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function jsonResponse(body: unknown, status = 200) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  })
}

describe("invited login screen", () => {
  it("asks for a code without showing an email, a business, or the invitation secret", () => {
    render(<InvitedLoginClient token={token} />)
    expect(screen.getByRole("heading", { name: "Sign in with your invitation" })).toBeTruthy()
    expect(screen.getByRole("button", { name: "Email me a sign-in code" })).toBeEnabled()
    expect(document.body.textContent).not.toMatch(/alex@example.com|Bakery|Telloya|customerId/i)
    expect(document.body.innerHTML).not.toContain(token)
    expect(document.body.innerHTML).not.toContain("dangerouslySetInnerHTML")
  })

  it("posts only the token, then a code, and enters the existing portal", async () => {
    fetchMock
      .mockImplementationOnce(() => jsonResponse({ message: INVITED_LOGIN_MESSAGE, email: "alex@example.com", business: "Bakery" }))
      .mockImplementationOnce(() => jsonResponse({ status: "ok", email: "alex@example.com" }))
    const replaceState = vi.spyOn(window.history, "replaceState")
    render(<InvitedLoginClient token={token} />)
    fireEvent.click(screen.getByRole("button", { name: "Email me a sign-in code" }))
    expect(await screen.findByRole("heading", { name: "Check your email" })).toBeTruthy()
    expect(screen.getByText(INVITED_LOGIN_MESSAGE)).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/alex@example.com|Bakery/)
    expect(fetchMock).toHaveBeenCalledWith("/api/portal/auth/invite/start", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ token }),
    }))
    expect(replaceState).toHaveBeenCalledWith(null, "", "/login/invite/continue")
    expect(document.body.innerHTML).not.toContain(token)
    fireEvent.change(screen.getByLabelText("Eight-digit code"), { target: { value: "12345678" } })
    fireEvent.click(screen.getByRole("button", { name: "Verify and sign in" }))
    expect(await screen.findByRole("heading", { name: "You're signed in" })).toBeTruthy()
    await waitFor(() => expect(replaceDocument).toHaveBeenCalledWith("portal"))
    expect(fetchMock).toHaveBeenLastCalledWith("/api/portal/auth/invite/verify", expect.objectContaining({
      body: JSON.stringify({ code: "12345678" }),
    }))
    expect(document.body.textContent).not.toMatch(/alex@example.com|Bakery/)
  })

  it("shows the same unavailable message when the invitation cannot be used", async () => {
    fetchMock.mockImplementation(() => jsonResponse({ message: INVITED_LOGIN_UNAVAILABLE, email: "alex@example.com" }, 401))
    render(<InvitedLoginClient token={token} />)
    fireEvent.click(screen.getByRole("button", { name: "Email me a sign-in code" }))
    expect(await screen.findByRole("alert")).toHaveTextContent(INVITED_LOGIN_UNAVAILABLE)
    expect(document.body.textContent).not.toMatch(/alex@example.com/)
    expect(replaceDocument).not.toHaveBeenCalled()
  })

  it("continues from the cookie step without putting an invitation secret back on screen", async () => {
    fetchMock.mockImplementation(() => jsonResponse({ message: INVITED_LOGIN_MESSAGE }))
    render(<InvitedLoginClient token="" initialPhase="code" />)
    expect(screen.getByRole("heading", { name: "Check your email" })).toBeTruthy()
    expect(document.body.innerHTML).not.toMatch(/[a-f0-9]{64}/)
    fireEvent.click(screen.getByRole("button", { name: "Resend code" }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/portal/auth/invite/resend", expect.objectContaining({
      body: JSON.stringify({}),
    })))
  })
})
