// @vitest-environment jsdom
import React from "react"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { PortalHome } from "./portal-home"

const router = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock("next/navigation", () => ({ useRouter: () => router }))

const fetchMock = vi.fn()

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock)
  fetchMock.mockReset()
  router.push.mockReset()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("portal security page", () => {
  it("confirms sign-in without dashboard data", () => {
    render(<PortalHome />)
    expect(screen.getByRole("heading", { name: "Customer portal" })).toBeTruthy()
    expect(screen.getByText("Signed in securely.")).toBeTruthy()
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/case|document|payment|Guard|customerId|dashboard/i)
  })

  it("signs out through the portal endpoint and returns to login", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ status: "ok" }) })
    render(<PortalHome />)
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }))
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/login"))
    expect(fetchMock).toHaveBeenCalledWith("/api/portal/auth/sign-out", expect.objectContaining({ method: "POST" }))
    expect(fetchMock.mock.calls[0][1].body).toBe("{}")
  })
})
