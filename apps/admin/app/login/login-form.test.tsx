// @vitest-environment jsdom
import React from "react"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
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
})

describe("admin login copy", () => {
  it("does not display the admin email and uses registered-admin wording", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ message: "Your code has been sent." }) })
    const { container } = render(<LoginForm />)
    expect(container.textContent).toContain("We’ll send a sign-in code to the registered admin email.")
    expect(container.textContent).not.toContain("admin@profilerelaunch.com")
    fireEvent.click(screen.getByRole("button", { name: "Send sign-in code" }))
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("A sign-in code has been sent to the registered admin email."))
    expect(container.textContent).not.toContain("admin@profilerelaunch.com")
  })
})
