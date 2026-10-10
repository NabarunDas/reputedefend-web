// @vitest-environment jsdom
import React from "react"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { LoginClient } from "./login-client"

const router = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => router }))

const fetchMock = vi.fn()

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock)
  fetchMock.mockReset()
  router.push.mockReset()
  window.localStorage.clear()
  window.sessionStorage.clear()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("portal login screen", () => {
  it("shows the branded sign-in copy without sales or portal data", () => {
    render(<LoginClient />)
    expect(screen.getByText("CUSTOMER PORTAL")).toBeTruthy()
    expect(screen.getByRole("heading", { name: "Sign in to your ProfileRelaunch account" })).toBeTruthy()
    expect(screen.getByText(/Use the email address verified with ProfileRelaunch/)).toBeTruthy()
    expect(screen.getByText("Secure passwordless sign-in.")).toBeTruthy()
    expect(screen.getByLabelText("Email address")).toHaveAttribute("type", "email")
    expect(screen.getByLabelText("Email address")).toHaveAttribute("autocomplete", "email")
    expect(screen.getByRole("button", { name: "Send code" })).toBeEnabled()
    expect(document.body.textContent).not.toMatch(/cases|documents|Guard|dashboard|Customer Login|Get Help/i)
    expect(window.localStorage.length).toBe(0)
    expect(window.sessionStorage.length).toBe(0)
  })

  it("shows sending copy and blocks a second submit while the code request is in progress", async () => {
    let resolveFetch: (value: unknown) => void = () => {}
    fetchMock.mockReturnValue(new Promise(resolve => { resolveFetch = resolve }))
    render(<LoginClient />)
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "alex@example.com" } })
    fireEvent.click(screen.getByRole("button", { name: "Send code" }))
    const sending = await screen.findByRole("button", { name: "Sending code…" })
    expect(sending).toBeDisabled()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    resolveFetch({ ok: true, status: 200, json: async () => ({ message: "If this email is linked to a ProfileRelaunch account, we've sent an eight-digit code." }) })
    await waitFor(() => expect(screen.getByRole("heading", { name: "Check your email" })).toBeTruthy())
  })

  it("moves to the code screen with the enumeration-safe sentence and the typed email", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ message: "If this email is linked to a ProfileRelaunch account, we've sent an eight-digit code." }) })
    render(<LoginClient />)
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "Alex@Example.com" } })
    fireEvent.click(screen.getByRole("button", { name: "Send code" }))
    await waitFor(() => expect(screen.getByRole("heading", { name: "Check your email" })).toBeTruthy())
    expect(screen.getByRole("status").textContent).toBe("If Alex@Example.com is linked to a ProfileRelaunch account, we've sent an eight-digit code.")
    const code = screen.getByLabelText("Eight-digit code")
    expect(document.querySelectorAll("input")).toHaveLength(1)
    expect(code).toHaveAttribute("inputmode", "numeric")
    expect(code).toHaveAttribute("autocomplete", "one-time-code")
    expect(code).toHaveAttribute("maxlength", "8")
    expect(code).toHaveClass("otp-input")
    const verify = screen.getByRole("button", { name: "Verify and sign in" })
    expect(verify).toBeDisabled()
    expect(verify).not.toHaveClass("secondary")
    const resend = screen.getByRole("button", { name: /Resend code \(\d+\)/ })
    expect(resend).toBeDisabled()
    expect(resend).toHaveClass("secondary")
    expect(screen.getByRole("button", { name: "Use a different email" })).toHaveClass("secondary")
    expect(screen.getByRole("status").getAttribute("role")).toBe("status")
    expect(document.body.textContent).not.toMatch(/Code sent|not found|not verified/)
    expect(window.localStorage.length).toBe(0)
  })

  it("shows verifying copy until the request finishes", async () => {
    let resolveVerify: (value: unknown) => void = () => {}
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ message: "If this email is linked to a ProfileRelaunch account, we've sent an eight-digit code." }) })
      .mockReturnValueOnce(new Promise(resolve => { resolveVerify = resolve }))
    render(<LoginClient />)
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "alex@example.com" } })
    fireEvent.click(screen.getByRole("button", { name: "Send code" }))
    await waitFor(() => expect(screen.getByLabelText("Eight-digit code")).toBeTruthy())
    fireEvent.change(screen.getByLabelText("Eight-digit code"), { target: { value: "12345678" } })
    fireEvent.click(screen.getByRole("button", { name: "Verify and sign in" }))
    expect(await screen.findByRole("button", { name: "Verifying…" })).toBeDisabled()
    expect(router.push).not.toHaveBeenCalled()
    resolveVerify({ ok: false, status: 401, json: async () => ({ message: "We couldn't verify that code. Check it and try again, or request a new code." }) })
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy())
  })

  it("shows the generic verification error and does not navigate on failure", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ message: "If this email is linked to a ProfileRelaunch account, we've sent an eight-digit code." }) })
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ message: "We couldn't verify that code. Check it and try again, or request a new code." }) })
    render(<LoginClient />)
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "alex@example.com" } })
    fireEvent.click(screen.getByRole("button", { name: "Send code" }))
    await waitFor(() => expect(screen.getByLabelText("Eight-digit code")).toBeTruthy())
    fireEvent.change(screen.getByLabelText("Eight-digit code"), { target: { value: "12345678" } })
    fireEvent.click(screen.getByRole("button", { name: "Verify and sign in" }))
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/couldn't verify that code/))
    expect(router.push).not.toHaveBeenCalled()
  })
})
