// @vitest-environment jsdom
import React from "react"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { LoginForm } from "./login-form"
import "@testing-library/jest-dom/vitest"

const fetchMock = vi.fn()
beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock)
  fetchMock.mockReset()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

function jsonResponse(body: { message: string }, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

function verifyCalls() {
  return fetchMock.mock.calls.filter(([url]) => url === "/auth/verify")
}

async function sendCode() {
  fetchMock.mockResolvedValue(jsonResponse({ message: "Your code has been sent." }))
  fireEvent.click(screen.getByRole("button", { name: "Send sign-in code" }))
  await waitFor(() => expect(screen.getByRole("status").textContent).toBe("A sign-in code has been sent to the registered admin email."))
  fetchMock.mockImplementation(async (url: string) => {
    if (url === "/auth/verify") return jsonResponse({ message: "That code is not valid." }, 401)
    return jsonResponse({ message: "Your code has been sent." })
  })
}

function slots() {
  return [...document.querySelectorAll<HTMLElement>("[data-otp-slot]")]
}

describe("admin login copy", () => {
  it("does not display the admin email and uses registered-admin wording", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: "Your code has been sent." }))
    const { container } = render(<LoginForm />)
    expect(container.textContent).toContain("We’ll send a sign-in code to the registered admin email.")
    expect(container.textContent).not.toContain("admin@profilerelaunch.com")
    fireEvent.click(screen.getByRole("button", { name: "Send sign-in code" }))
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("A sign-in code has been sent to the registered admin email."))
    expect(container.textContent).not.toContain("admin@profilerelaunch.com")
    const input = screen.getByLabelText("Eight-digit code")
    expect(input).toHaveAttribute("pattern", "[0-9]{8}")
    expect(input).toHaveAttribute("autocomplete", "one-time-code")
    expect(input).toHaveAttribute("inputmode", "numeric")
    expect(input).toHaveAttribute("aria-describedby", "code-help")
  })
})

describe("admin login code entry", () => {
  it("renders eight visual slots for one OTP input", async () => {
    render(<LoginForm />)
    await sendCode()
    expect(slots()).toHaveLength(8)
    expect(screen.getAllByRole("textbox")).toHaveLength(1)
    expect(screen.getByLabelText("Eight-digit code")).toHaveAttribute("autocomplete", "one-time-code")
    expect(slots().every(slot => slot.getAttribute("aria-hidden") === null || slot.closest("[aria-hidden='true']"))).toBe(true)
    fireEvent.focus(screen.getByLabelText("Eight-digit code"))
    expect(slots()[0]).toHaveAttribute("data-current", "true")
  })

  it("fills slots from digits and ignores other characters", async () => {
    render(<LoginForm />)
    await sendCode()
    const input = screen.getByLabelText("Eight-digit code")
    fireEvent.change(input, { target: { value: "12a3-4" } })
    expect(input).toHaveValue("1234")
    expect(slots().map(slot => slot.textContent)).toEqual(["1", "2", "3", "4", "", "", "", ""])
    fireEvent.focus(input)
    expect(slots()[4]).toHaveAttribute("data-current", "true")
    expect(verifyCalls()).toHaveLength(0)
    expect(screen.getByRole("button", { name: "Sign in" })).toBeDisabled()
  })

  it("normalises a formatted paste and truncates extra digits", async () => {
    render(<LoginForm />)
    await sendCode()
    const input = screen.getByLabelText("Eight-digit code")
    fireEvent.change(input, { target: { value: "12 34-5678" } })
    expect(input).toHaveValue("12345678")
    expect(slots().map(slot => slot.textContent).join("")).toBe("12345678")
    fireEvent.change(input, { target: { value: "123456789999" } })
    expect(input).toHaveValue("12345678")
  })

  it("does not auto-submit six or seven digits", async () => {
    render(<LoginForm />)
    await sendCode()
    const input = screen.getByLabelText("Eight-digit code")
    fireEvent.change(input, { target: { value: "123456" } })
    fireEvent.change(input, { target: { value: "1234567" } })
    expect(screen.getByRole("button", { name: "Sign in" })).toBeDisabled()
    expect(verifyCalls()).toHaveLength(0)
  })

  it("auto-submits the eighth digit once across later renders", async () => {
    const view = render(<LoginForm />)
    await sendCode()
    fireEvent.change(screen.getByLabelText("Eight-digit code"), { target: { value: "1234567" } })
    expect(verifyCalls()).toHaveLength(0)
    fireEvent.change(screen.getByLabelText("Eight-digit code"), { target: { value: "12345678" } })
    await waitFor(() => expect(verifyCalls()).toHaveLength(1))
    expect(verifyCalls()[0][1]).toMatchObject({ method: "POST", body: JSON.stringify({ code: "12345678" }) })
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("That code is not valid."))
    view.rerender(<LoginForm />)
    expect(verifyCalls()).toHaveLength(1)
  })

  it("keeps Sign in available after a failed attempt", async () => {
    render(<LoginForm />)
    await sendCode()
    fireEvent.change(screen.getByLabelText("Eight-digit code"), { target: { value: "12345678" } })
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("That code is not valid."))
    const button = screen.getByRole("button", { name: "Sign in" })
    expect(button).toBeEnabled()
    fireEvent.click(button)
    await waitFor(() => expect(verifyCalls()).toHaveLength(2))
    expect(verifyCalls()[1][1]).toMatchObject({ body: JSON.stringify({ code: "12345678" }) })
  })

  it("refocuses the code after a failure and submits a corrected code once", async () => {
    let resolveVerify: (value: { ok: boolean, status: number, json: () => Promise<{ message: string }> }) => void = () => {}
    fetchMock.mockImplementation(async (url: string) => {
      if (url === "/auth/send") return jsonResponse({ message: "Your code has been sent." })
      return new Promise(resolve => { resolveVerify = resolve })
    })
    render(<LoginForm />)
    fireEvent.click(screen.getByRole("button", { name: "Send sign-in code" }))
    const input = await screen.findByLabelText("Eight-digit code")
    fireEvent.change(input, { target: { value: "12345678" } })
    await waitFor(() => expect(verifyCalls()).toHaveLength(1))
    input.blur()
    expect(input).not.toHaveFocus()
    resolveVerify(jsonResponse({ message: "That code is not valid." }, 401))
    await waitFor(() => expect(input).toHaveFocus())
    fireEvent.change(input, { target: { value: "1234567" } })
    expect(verifyCalls()).toHaveLength(1)
    fireEvent.change(input, { target: { value: "87654321" } })
    await waitFor(() => expect(verifyCalls()).toHaveLength(2))
    expect(verifyCalls()[1][1]).toMatchObject({ body: JSON.stringify({ code: "87654321" }) })
  })

  it("clears the displayed code when another code is sent", async () => {
    vi.useFakeTimers()
    fetchMock.mockResolvedValue(jsonResponse({ message: "Your code has been sent." }))
    render(<LoginForm />)
    fireEvent.click(screen.getByRole("button", { name: "Send sign-in code" }))
    await vi.waitFor(() => expect(screen.getByLabelText("Eight-digit code")).toBeInTheDocument())
    const input = screen.getByLabelText("Eight-digit code")
    fireEvent.change(input, { target: { value: "1234" } })
    expect(slots().map(slot => slot.textContent).join("")).toBe("1234")
    for (let second = 0; second < 60; second += 1) {
      await act(async () => { await vi.advanceTimersByTimeAsync(1000) })
    }
    fireEvent.click(screen.getByRole("button", { name: "Send another code" }))
    await vi.waitFor(() => expect(input).toHaveValue(""))
    expect(slots().every(slot => slot.textContent === "")).toBe(true)
    expect(screen.getByRole("button", { name: "Send another code in 60s" })).toBeDisabled()
  })
})
