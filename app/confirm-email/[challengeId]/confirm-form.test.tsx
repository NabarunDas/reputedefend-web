/** @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import "@testing-library/jest-dom/vitest"
import { ConfirmEmailForm } from "./confirm-form"

const token = "a".repeat(64)
const csrf = "b".repeat(64)
const challengeId = "11111111-1111-4111-8111-111111111111"

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  window.history.replaceState(null, "", "/")
})

describe("email confirmation customer UX", () => {
  it("loads same-origin CSRF first, then requires a human POST; a page visit never verifies", async () => {
    window.history.replaceState(null, "", `/confirm-email/${challengeId}#t=${token}`)
    const requests: Array<{ url: string; init?: RequestInit }> = []
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      requests.push({ url, init })
      if (init?.method === "GET") return { ok: true, json: async () => ({ csrf }) }
      return { ok: true, json: async () => ({ message: "Your email address is confirmed." }) }
    })
    vi.stubGlobal("fetch", fetchMock)
    render(<ConfirmEmailForm challengeId={challengeId} canConfirm canResend />)
    await waitFor(() => expect(screen.getByRole("button", { name: "Confirm email" })).toBeEnabled())
    expect(requests).toHaveLength(1)
    expect(requests[0]).toMatchObject({ url: "/api/confirm-email", init: { method: "GET", credentials: "same-origin" } })
    expect(window.location.hash).toBe("")
    fireEvent.click(screen.getByRole("button", { name: "Confirm email" }))
    await waitFor(() => expect(screen.getByText("Your email address is confirmed.")).toBeInTheDocument())
    expect(requests).toHaveLength(2)
    expect(requests[1]).toMatchObject({ url: "/api/confirm-email", init: { method: "POST", credentials: "same-origin" } })
    expect(JSON.parse(requests[1].init?.body as string)).toEqual({ challengeId, csrf, token, action: "confirm" })
    expect(screen.getByRole("button", { name: "Confirm email" })).toBeDisabled()
  })

  it("cannot verify without the emailed bearer token", async () => {
    window.history.replaceState(null, "", `/confirm-email/${challengeId}`)
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ csrf }) }))
    vi.stubGlobal("fetch", fetchMock)
    render(<ConfirmEmailForm challengeId={challengeId} canConfirm canResend />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    expect(screen.getByRole("button", { name: "Confirm email" })).toBeDisabled()
    expect(screen.getByText(/Open the confirmation button in your email/)).toBeInTheDocument()
  })
})
