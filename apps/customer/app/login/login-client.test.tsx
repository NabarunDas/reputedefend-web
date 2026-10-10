// @vitest-environment jsdom
import React from "react"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
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
    expect(screen.getAllByRole("textbox")).toHaveLength(1)
    expect(document.querySelectorAll("[data-otp-slot]")).toHaveLength(8)
    expect(code).toHaveAttribute("inputmode", "numeric")
    expect(code).toHaveAttribute("autocomplete", "one-time-code")
    expect(code).toHaveAttribute("pattern", "[0-9]{8}")
    expect(code).not.toHaveAttribute("maxlength")
    expect(code).toHaveClass("otp-control")
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
    expect(fetchMock.mock.calls.filter(([url]) => url === "/api/portal/auth/verify")).toHaveLength(1)
  })
})

function slots() {
  return [...document.querySelectorAll<HTMLElement>("[data-otp-slot]")]
}

function verifyCalls() {
  return fetchMock.mock.calls.filter(([url]) => url === "/api/portal/auth/verify")
}

async function openCodeScreen() {
  fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ message: "If this email is linked to a ProfileRelaunch account, we've sent an eight-digit code." }) })
  render(<LoginClient />)
  fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "alex@example.com" } })
  fireEvent.click(screen.getByRole("button", { name: "Send code" }))
  const code = await screen.findByLabelText("Eight-digit code")
  return code as HTMLInputElement
}

describe("portal login OTP slots", () => {
  it("renders eight visual slots on one labelled input", async () => {
    const code = await openCodeScreen()
    expect(slots()).toHaveLength(8)
    expect(screen.getAllByRole("textbox")).toHaveLength(1)
    expect(code).toHaveAttribute("aria-label", "Eight-digit code")
    expect(code).toHaveAttribute("inputmode", "numeric")
    expect(code).toHaveAttribute("autocomplete", "one-time-code")
    expect(code).toHaveAttribute("autocapitalize", "none")
    expect(code).not.toHaveAttribute("maxlength")
    expect(code.tabIndex).toBe(0)
    expect(slots().every(slot => slot.closest("[aria-hidden='true']"))).toBe(true)
    expect(code).toHaveFocus()
    expect(slots()[0]).toHaveAttribute("data-current", "true")
  })

  it("fills slots from typed digits and ignores other characters", async () => {
    const code = await openCodeScreen()
    fireEvent.change(code, { target: { value: "12a3-4" } })
    expect(code).toHaveValue("1234")
    expect(slots().map(slot => slot.textContent)).toEqual(["1", "2", "3", "4", "", "", "", ""])
    expect(slots()[4]).toHaveAttribute("data-current", "true")
    fireEvent.change(code, { target: { value: "123" } })
    expect(code).toHaveValue("123")
    expect(slots()[3]).toHaveAttribute("data-current", "true")
    expect(screen.getByRole("button", { name: "Verify and sign in" })).toBeDisabled()
    expect(verifyCalls()).toHaveLength(0)
  })

  it("normalises a formatted paste and truncates an overlong paste", async () => {
    const code = await openCodeScreen()
    fireEvent.paste(code)
    fireEvent.change(code, { target: { value: "12 34-5678" } })
    expect(code).toHaveValue("12345678")
    expect(slots().map(slot => slot.textContent).join("")).toBe("12345678")
    fireEvent.change(code, { target: { value: "123456789999" } })
    expect(code).toHaveValue("12345678")
    expect(slots().map(slot => slot.textContent).join("")).toBe("12345678")
    expect(verifyCalls()).toHaveLength(0)
  })

  it("focuses the single input from a slot and clears the current marker on blur", async () => {
    const code = await openCodeScreen()
    await act(async () => { code.blur() })
    expect(code).not.toHaveFocus()
    expect(slots().every(slot => slot.getAttribute("data-current") === "false")).toBe(true)
    fireEvent.mouseDown(slots()[2])
    expect(code).toHaveFocus()
    expect(slots()[0]).toHaveAttribute("data-current", "true")
    fireEvent.keyDown(code, { key: "Backspace" })
    expect(screen.getAllByRole("textbox")).toHaveLength(1)
  })

  it("verifies once from the button and does not submit while the code is incomplete", async () => {
    const code = await openCodeScreen()
    fireEvent.change(code, { target: { value: "1234567" } })
    fireEvent.click(screen.getByRole("button", { name: "Verify and sign in" }))
    expect(verifyCalls()).toHaveLength(0)
    fireEvent.change(code, { target: { value: "12345678" } })
    expect(verifyCalls()).toHaveLength(0)
    expect(screen.getByRole("button", { name: "Verify and sign in" })).toBeEnabled()
    fetchMock.mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ message: "We couldn't verify that code. Check it and try again, or request a new code." }) })
    fireEvent.click(screen.getByRole("button", { name: "Verify and sign in" }))
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/couldn't verify that code/))
    expect(verifyCalls()).toHaveLength(1)
    expect(verifyCalls()[0][1]).toMatchObject({ method: "POST", body: JSON.stringify({ code: "12345678" }) })
    expect(router.push).not.toHaveBeenCalled()
  })

  it("signs in after one successful verification", async () => {
    const code = await openCodeScreen()
    fireEvent.change(code, { target: { value: "12345678" } })
    expect(verifyCalls()).toHaveLength(0)
    fetchMock.mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ status: "ok" }) })
    fireEvent.click(screen.getByRole("button", { name: "Verify and sign in" }))
    await waitFor(() => expect(router.push).toHaveBeenCalledTimes(1))
    expect(router.push).toHaveBeenCalledWith("/portal")
    expect(verifyCalls()).toHaveLength(1)
  })
})
