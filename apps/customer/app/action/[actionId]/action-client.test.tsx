// @vitest-environment jsdom
import React from "react"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { ActionClient } from "./action-client"

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

describe("customer action page", () => {
  it("exchanges the fragment secret and removes it without using web storage", async () => {
    window.history.replaceState(null, "", "/action/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa#t=" + "b".repeat(64))
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ status: "ok", maskedEmail: "a***@example.com" }) })
    render(<ActionClient actionId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" />)
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(window.location.hash).toBe("")
    expect(window.localStorage.length).toBe(0)
    expect(window.sessionStorage.length).toBe(0)
    expect(JSON.stringify(fetchMock.mock.calls[0][1].body)).toContain("b".repeat(64))
    expect(screen.getByText(/a\*\*\*@example.com/)).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/googletagmanager|dashboard|Submit to Google/i)
  })
})
