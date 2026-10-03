// @vitest-environment jsdom
import { existsSync } from "node:fs"
import { join } from "node:path"
import React from "react"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import PortalLayout from "./layout"
import { PortalHome } from "./portal-home"

const router = vi.hoisted(() => ({ push: vi.fn() }))
const nav = vi.hoisted(() => ({ pathname: "/portal" }))
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => nav.pathname }))

const fetchMock = vi.fn()

const emptyDashboard = {
  summary: { activeCases: 0, attentionCases: 0, previousCases: 0 },
  attentionCases: [],
  recentCases: [],
}

function renderPortal() {
  return render(<PortalLayout><PortalHome dashboard={emptyDashboard} /></PortalLayout>)
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock)
  fetchMock.mockReset()
  router.push.mockReset()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe("portal shell", () => {
  it("renders the quiet welcome shell and the fixed navigation", () => {
    renderPortal()
    expect(screen.getByText("My ProfileRelaunch").tagName).not.toBe("H1")
    expect(screen.getByText("Secure customer area")).toBeTruthy()
    expect(screen.getByText("CUSTOMER PORTAL")).toBeTruthy()
    expect(screen.getByRole("heading", { level: 1, name: "Welcome to My ProfileRelaunch" })).toBeTruthy()
    expect(screen.getByText("See what needs your attention and where your cases stand.")).toBeTruthy()
    expect(screen.getByRole("heading", { level: 2, name: "No active cases" })).toBeTruthy()
    expect(screen.getByText("When you start a ProfileRelaunch case, it will appear here.")).toBeTruthy()

    const navigation = screen.getByRole("navigation", { name: "Customer portal" })
    const labels = [...navigation.querySelectorAll("li")].map(item => item.textContent?.replace("not available yet", "").trim())
    expect(labels).toEqual(["Dashboard", "Cases", "Documents", "Payments", "Relaunch Guard", "Account"])
    const dashboard = screen.getByRole("link", { name: "Dashboard" })
    expect(dashboard).toHaveAttribute("href", "/portal")
    expect(dashboard).toHaveAttribute("aria-current", "page")
    const cases = screen.getByRole("link", { name: "Cases" })
    expect(cases).toHaveAttribute("href", "/portal/cases")
    expect(cases).not.toHaveAttribute("aria-current")
    expect(navigation.querySelectorAll("a")).toHaveLength(2)
    const unavailable = [...navigation.querySelectorAll("[aria-disabled='true']")]
    expect(unavailable.map(item => item.tagName)).toEqual(["SPAN", "SPAN", "SPAN", "SPAN"])
    expect(unavailable.map(item => item.textContent)).toEqual([
      "Documents not available yet",
      "Payments not available yet",
      "Relaunch Guard not available yet",
      "Account not available yet",
    ])
    expect(document.body.textContent).not.toMatch(/@|customerId|session token|£|sample case|coming soon|Get Help|Admin/i)
    expect(screen.getByRole("button", { name: "Sign out" })).toHaveClass("secondary")
  })

  it("does not create placeholder portal routes", () => {
    const portalDir = join(process.cwd(), "app/portal")
    expect(existsSync(join(portalDir, "page.tsx"))).toBe(true)
    expect(existsSync(join(portalDir, "cases", "page.tsx"))).toBe(true)
    expect(existsSync(join(portalDir, "cases", "[id]"))).toBe(false)
    expect(existsSync(join(portalDir, "cases", "[reference]", "page.tsx"))).toBe(true)
    for (const name of ["documents", "payments", "guard", "account", "relaunch-guard"]) {
      expect(existsSync(join(portalDir, name))).toBe(false)
      expect(existsSync(join(portalDir, name, "page.tsx"))).toBe(false)
    }
  })

  it("signs out through the portal endpoint and returns to login", async () => {
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ status: "ok" }) })
    renderPortal()
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }))
    await waitFor(() => expect(router.push).toHaveBeenCalledWith("/login"))
    expect(fetchMock).toHaveBeenCalledWith("/api/portal/auth/sign-out", expect.objectContaining({ method: "POST" }))
    expect(fetchMock.mock.calls[0][1].body).toBe("{}")
  })

  it("shows signing out until the server confirms, then keeps the error on failure", async () => {
    let resolveFetch: (value: unknown) => void = () => {}
    fetchMock.mockReturnValue(new Promise(resolve => { resolveFetch = resolve }))
    renderPortal()
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }))
    expect(await screen.findByRole("button", { name: "Signing out…" })).toBeDisabled()
    expect(router.push).not.toHaveBeenCalled()
    expect(screen.getByRole("heading", { name: "Welcome to My ProfileRelaunch" })).toBeTruthy()
    resolveFetch({ ok: false, status: 500, json: async () => ({}) })
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("We couldn't sign you out. Try again."))
    expect(router.push).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: "Sign out" })).toBeEnabled()
  })
})
