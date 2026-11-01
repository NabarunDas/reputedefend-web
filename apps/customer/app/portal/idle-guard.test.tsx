// @vitest-environment jsdom
import React from "react"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { PortalIdleGuard } from "@/app/portal/idle-guard"

const replaceExpired = vi.hoisted(() => vi.fn())
vi.mock("next/navigation", () => ({ usePathname: () => "/portal" }))
vi.mock("@/lib/portal/account/document", () => ({
  replaceExpiredPortalDocument: replaceExpired,
}))

const fetchMock = vi.fn()

function deadlines(idleInMs: number) {
  const now = Date.now()
  return {
    status: "ok",
    authenticatedAt: new Date(now - 60 * 60 * 1000).toISOString(),
    expiresAt: new Date(now + 7 * 60 * 60 * 1000).toISOString(),
    lastActivityAt: new Date(now - 20 * 60 * 1000).toISOString(),
    idleExpiresAt: new Date(now + idleInMs).toISOString(),
  }
}

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body }
}

beforeEach(() => {
  replaceExpired.mockReset()
  fetchMock.mockReset()
  vi.stubGlobal("fetch", fetchMock)
  delete document.documentElement.dataset.portalSession
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" })
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  delete document.documentElement.dataset.portalSession
})

describe("portal idle guard", () => {
  it("warns before expiry and stays signed in without a mount-time activity write", async () => {
    const soon = deadlines(90_000)
    const extended = { ...soon, lastActivityAt: new Date().toISOString(), idleExpiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString() }
    const methods: string[] = []
    fetchMock.mockImplementation(async (_input: unknown, init?: RequestInit) => {
      const method = init?.method ?? "GET"
      methods.push(method)
      if (method === "POST" && methods.filter(item => item === "POST").length > 1) return jsonResponse({ ...extended, unchanged: false })
      if (method === "POST") return jsonResponse({ ...soon, unchanged: true })
      return jsonResponse(soon)
    })
    render(<><div className="portal-private">Case reference PR-26-AAAAAA</div><PortalIdleGuard /></>)
    expect(await screen.findByRole("button", { name: "Stay signed in" })).toBeTruthy()
    expect(screen.getByText("Your session will end soon for security. Stay signed in if you are still here.")).toBeTruthy()
    expect(methods).toEqual(["GET"])

    fireEvent.pointerDown(document)
    await waitFor(() => expect(methods).toEqual(["GET", "POST"]))
    fireEvent.pointerDown(document)
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(methods).toEqual(["GET", "POST"])

    fireEvent.click(screen.getByRole("button", { name: "Stay signed in" }))
    await waitFor(() => expect(methods.filter(method => method === "POST")).toHaveLength(2))
    await waitFor(() => expect(screen.queryByRole("button", { name: "Stay signed in" })).toBeNull())
    expect(replaceExpired).not.toHaveBeenCalled()
    const posted = fetchMock.mock.calls.filter(call => call[1]?.method === "POST")
    expect(posted[0][0]).toBe("/api/portal/auth/activity")
  })

  it("does not record activity from a hidden tab and redirects when the session is gone", async () => {
    fetchMock.mockResolvedValue(jsonResponse(deadlines(90_000)))
    render(<PortalIdleGuard />)
    await screen.findByRole("button", { name: "Stay signed in" })
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" })
    fireEvent.keyDown(document, { key: "a" })
    await new Promise(resolve => setTimeout(resolve, 20))
    expect(fetchMock.mock.calls.filter(call => call[1]?.method === "POST")).toHaveLength(0)

    fetchMock.mockResolvedValue(jsonResponse({ message: "ended" }, 401))
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" })
    document.dispatchEvent(new Event("visibilitychange"))
    await waitFor(() => expect(replaceExpired).toHaveBeenCalledTimes(1))
    expect(fetchMock.mock.calls.at(-1)?.[1]?.method ?? "GET").toBe("GET")
  })

  it("hides portal content before a back-forward restore check completes", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(deadlines(30 * 60 * 1000)))
    render(<><div className="portal-private">Private case note</div><PortalIdleGuard /></>)
    await waitFor(() => expect(document.documentElement.dataset.portalSession).toBeUndefined())
    let release: (value: ReturnType<typeof jsonResponse>) => void = () => {}
    fetchMock.mockImplementation(() => new Promise(resolve => { release = resolve }))
    const page = document.querySelector(".portal-private")
    window.dispatchEvent(Object.assign(new Event("pagehide"), { persisted: true }))
    expect(document.documentElement.dataset.portalSession).toBe("checking")
    expect(page?.getAttribute("aria-hidden")).toBe("true")
    expect(page?.hasAttribute("inert")).toBe(true)
    window.dispatchEvent(Object.assign(new Event("pageshow"), { persisted: true }))
    release(jsonResponse(deadlines(30 * 60 * 1000)))
    await waitFor(() => expect(document.documentElement.dataset.portalSession).toBeUndefined())
    expect(page?.getAttribute("aria-hidden")).toBeNull()
  })
})
