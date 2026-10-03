// @vitest-environment jsdom
import React from "react"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { LoginClient } from "./login-client"

const fetchMock = vi.fn()

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

describe("portal login screen", () => {
  it("shows the minimal sign-in copy and no portal design", () => {
    render(<LoginClient />)
    expect(screen.getByRole("heading", { name: "Sign in to your ProfileRelaunch account" })).toBeTruthy()
    expect(screen.getByText(/Use the email address verified with ProfileRelaunch/)).toBeTruthy()
    expect(screen.getByLabelText("Email address")).toHaveAttribute("type", "email")
    expect(screen.getByLabelText("Email address")).toHaveAttribute("autocomplete", "email")
    expect(screen.getByRole("button", { name: "Send code" })).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/cases|documents|Guard|dashboard|Customer Login/i)
    expect(window.localStorage.length).toBe(0)
    expect(window.sessionStorage.length).toBe(0)
  })

  it("moves to the code screen with the enumeration-safe sentence and the typed email", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ message: "If this email is linked to a ProfileRelaunch account, we've sent a six-digit code." }) })
    render(<LoginClient />)
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "Alex@Example.com" } })
    fireEvent.click(screen.getByRole("button", { name: "Send code" }))
    await waitFor(() => expect(screen.getByRole("heading", { name: "Check your email" })).toBeTruthy())
    expect(screen.getByRole("status").textContent).toBe("If Alex@Example.com is linked to a ProfileRelaunch account, we've sent a six-digit code.")
    expect(screen.getByLabelText("Six-digit code")).toHaveAttribute("autocomplete", "one-time-code")
    expect(screen.getByRole("button", { name: "Verify and sign in" })).toBeDisabled()
    expect(screen.getByRole("button", { name: "Use a different email" })).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/Code sent|not found|not verified/)
    expect(window.localStorage.length).toBe(0)
  })

  it("shows the generic verification error and does not navigate on failure", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ message: "If this email is linked to a ProfileRelaunch account, we've sent a six-digit code." }) })
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({ message: "We couldn't verify that code. Check it and try again, or request a new code." }) })
    const assign = vi.fn()
    vi.stubGlobal("location", { ...window.location, assign })
    render(<LoginClient />)
    fireEvent.change(screen.getByLabelText("Email address"), { target: { value: "alex@example.com" } })
    fireEvent.click(screen.getByRole("button", { name: "Send code" }))
    await waitFor(() => expect(screen.getByLabelText("Six-digit code")).toBeTruthy())
    fireEvent.change(screen.getByLabelText("Six-digit code"), { target: { value: "123456" } })
    fireEvent.click(screen.getByRole("button", { name: "Verify and sign in" }))
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/couldn't verify that code/))
    expect(assign).not.toHaveBeenCalled()
  })
})
