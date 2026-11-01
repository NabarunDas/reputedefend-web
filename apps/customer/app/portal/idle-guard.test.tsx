// @vitest-environment jsdom
import React from "react"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
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

describe("unattended portal expiry", () => {
  const pending: Array<(value: ReturnType<typeof jsonResponse>) => void> = []

  beforeEach(() => {
    vi.useFakeTimers()
    pending.length = 0
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  function sessionReads() {
    return fetchMock.mock.calls.filter(call => call[0] === "/api/portal/auth/session")
  }

  function activityWrites() {
    return fetchMock.mock.calls.filter(call => call[1]?.method === "POST")
  }

  function renderSensitive() {
    return render(
      <>
        <p className="customer-header-context">Mina Cole</p>
        <div className="portal-private">Private case note</div>
        <PortalIdleGuard />
      </>,
    )
  }

  function hang() {
    return new Promise<ReturnType<typeof jsonResponse>>(resolve => pending.push(resolve))
  }

  async function advance(ms = 0) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms)
    })
  }

  async function openUntil(body: ReturnType<typeof deadlines>, later: () => Promise<ReturnType<typeof jsonResponse>> | ReturnType<typeof jsonResponse>) {
    fetchMock.mockImplementation((url: string) => {
      if (url !== "/api/portal/auth/session") return hang()
      if (sessionReads().length === 1) return Promise.resolve(jsonResponse(body))
      return Promise.resolve(later())
    })
    renderSensitive()
    await advance(0)
    expect(document.documentElement.dataset.portalSession).toBeUndefined()
    expect(document.querySelector(".customer-header-context")?.hasAttribute("aria-hidden")).toBe(false)
  }

  function expectConcealed(state: "checking" | "held") {
    const page = document.querySelector(".portal-private")
    const name = document.querySelector(".customer-header-context")
    expect(document.documentElement.dataset.portalSession).toBe(state)
    expect(page?.getAttribute("aria-hidden")).toBe("true")
    expect(page?.hasAttribute("inert")).toBe(true)
    expect(page?.textContent).toContain("Private case note")
    expect(name?.getAttribute("aria-hidden")).toBe("true")
    expect(name?.hasAttribute("inert")).toBe(true)
    expect(name?.textContent).toBe("Mina Cole")
  }

  it("conceals content and the header name when the idle deadline passes, then redirects once", async () => {
    const body = deadlines(5_000)
    await openUntil(body, () => hang())
    await advance(4_999)
    expect(document.documentElement.dataset.portalSession).toBeUndefined()
    expect(sessionReads()).toHaveLength(1)
    expect(activityWrites()).toHaveLength(0)

    await advance(1)
    expectConcealed("checking")
    expect(sessionReads()).toHaveLength(2)
    expect(sessionReads().every(call => (call[1]?.method ?? "GET") === "GET")).toBe(true)
    expect(sessionReads().at(-1)?.[1]?.cache).toBe("no-store")
    expect(activityWrites()).toHaveLength(0)

    const release = pending[0]
    expect(release).toBeTypeOf("function")
    release(jsonResponse({ message: "ended" }, 401))
    await advance(0)
    expect(replaceExpired).toHaveBeenCalledTimes(1)
    await advance(30_000)
    expect(replaceExpired).toHaveBeenCalledTimes(1)
    expect(sessionReads()).toHaveLength(2)
    expect(activityWrites()).toHaveLength(0)
    expectConcealed("checking")
  })

  it("restores a session another tab kept valid and does not read again", async () => {
    const body = deadlines(5_000)
    const extended = {
      ...body,
      lastActivityAt: new Date(Date.now()).toISOString(),
      idleExpiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    }
    await openUntil(body, () => hang())
    await advance(5_000)
    expectConcealed("checking")
    pending[0](jsonResponse(extended))
    await advance(0)
    expect(document.documentElement.dataset.portalSession).toBeUndefined()
    expect(document.querySelector(".portal-private")?.hasAttribute("aria-hidden")).toBe(false)
    expect(document.querySelector(".customer-header-context")?.hasAttribute("aria-hidden")).toBe(false)
    expect(replaceExpired).not.toHaveBeenCalled()
    expect(activityWrites()).toHaveLength(0)
    const reads = sessionReads().length
    await advance(20_000)
    expect(sessionReads()).toHaveLength(reads)
    expect(activityWrites()).toHaveLength(0)
  })

  it("drops a stale denial when a newer read shows another tab is still signed in", async () => {
    const body = deadlines(5_000)
    const extended = {
      ...body,
      lastActivityAt: new Date(Date.now()).toISOString(),
      idleExpiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    }
    await openUntil(body, () => hang())
    await advance(5_000)
    expect(sessionReads()).toHaveLength(2)
    window.dispatchEvent(new PopStateEvent("popstate"))
    expect(sessionReads()).toHaveLength(3)
    expect(pending).toHaveLength(2)
    pending[0](jsonResponse({ message: "ended" }, 401))
    await advance(0)
    expect(replaceExpired).not.toHaveBeenCalled()
    expectConcealed("checking")
    pending[1](jsonResponse(extended))
    await advance(0)
    expect(replaceExpired).not.toHaveBeenCalled()
    expect(document.documentElement.dataset.portalSession).toBeUndefined()
    expect(activityWrites()).toHaveLength(0)
  })

  it("keeps the page concealed when the session check fails and retries with a read", async () => {
    const body = deadlines(5_000)
    const extended = {
      ...body,
      lastActivityAt: new Date(Date.now()).toISOString(),
      idleExpiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    }
    let failed = false
    fetchMock.mockImplementation((url: string) => {
      if (url !== "/api/portal/auth/session") return hang()
      if (sessionReads().length === 1) return Promise.resolve(jsonResponse(body))
      if (!failed) {
        failed = true
        return Promise.reject(new Error("offline"))
      }
      return Promise.resolve(jsonResponse(extended))
    })
    renderSensitive()
    await advance(0)
    expect(document.documentElement.dataset.portalSession).toBeUndefined()
    await advance(5_000)
    expectConcealed("held")
    expect(screen.getByRole("alert")).toHaveTextContent("We couldn't confirm your session. Try again.")
    expect(replaceExpired).not.toHaveBeenCalled()
    expect(activityWrites()).toHaveLength(0)
    const reads = sessionReads().length
    await advance(15_000)
    expect(sessionReads()).toHaveLength(reads)

    const retry = screen.getByRole("button", { name: "Try again" })
    fireEvent.pointerDown(retry)
    fireEvent.keyDown(retry, { key: "Enter" })
    fireEvent.click(retry)
    await advance(0)
    expect(activityWrites()).toHaveLength(0)
    expect(sessionReads()).toHaveLength(reads + 1)
    expect(sessionReads().at(-1)?.[1]?.method ?? "GET").toBe("GET")
    expect(document.documentElement.dataset.portalSession).toBeUndefined()
    expect(document.querySelector(".customer-header-context")?.hasAttribute("aria-hidden")).toBe(false)
    expect(replaceExpired).not.toHaveBeenCalled()
  })

  it("enforces the eight-hour limit even while idle time remains", async () => {
    const now = Date.now()
    const expiresAt = new Date(now + 5_000).toISOString()
    const body = {
      status: "ok",
      authenticatedAt: new Date(now + 5_000 - 8 * 60 * 60 * 1000).toISOString(),
      expiresAt,
      lastActivityAt: new Date(now).toISOString(),
      idleExpiresAt: new Date(now + 30 * 60 * 1000).toISOString(),
    }
    await openUntil(body, () => hang())
    await advance(4_999)
    expect(sessionReads()).toHaveLength(1)
    await advance(1)
    expectConcealed("checking")
    expect(activityWrites()).toHaveLength(0)
    pending[0](jsonResponse({ message: "ended" }, 401))
    await advance(0)
    expect(replaceExpired).toHaveBeenCalledTimes(1)
    await advance(30 * 60 * 1000)
    expect(replaceExpired).toHaveBeenCalledTimes(1)
    expect(sessionReads()).toHaveLength(2)
    expectConcealed("checking")
  })

  it("does not restore a page when the absolute deadline moves forward", async () => {
    const now = Date.now()
    const body = {
      status: "ok",
      authenticatedAt: new Date(now + 5_000 - 8 * 60 * 60 * 1000).toISOString(),
      expiresAt: new Date(now + 5_000).toISOString(),
      lastActivityAt: new Date(now).toISOString(),
      idleExpiresAt: new Date(now + 30 * 60 * 1000).toISOString(),
    }
    const moved = {
      ...body,
      expiresAt: new Date(now + 60 * 60 * 1000).toISOString(),
      idleExpiresAt: new Date(now + 30 * 60 * 1000).toISOString(),
    }
    await openUntil(body, () => hang())
    await advance(5_000)
    expectConcealed("checking")
    pending[0](jsonResponse(moved))
    await advance(0)
    expectConcealed("held")
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy()
    expect(replaceExpired).not.toHaveBeenCalled()
    expect(activityWrites()).toHaveLength(0)
    const reads = sessionReads().length
    await advance(10_000)
    expect(sessionReads()).toHaveLength(reads)
  })
})
