// @vitest-environment jsdom
import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import React from "react"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import PortalLayout from "./layout"
import { PortalHome } from "./portal-home"
import { PortalNav } from "./portal-nav"
import { AccountView } from "./account/account-view"
import { ProductsView } from "./products/products-view"
import { presentProducts } from "@/lib/portal/products/present"

const router = vi.hoisted(() => ({ push: vi.fn() }))
const replaceDocument = vi.hoisted(() => vi.fn())
const nav = vi.hoisted(() => ({ pathname: "/portal" }))
vi.mock("next/navigation", () => ({ useRouter: () => router, usePathname: () => nav.pathname }))
vi.mock("@/lib/portal/account/document", () => ({
  replaceAuthenticatedDocument: replaceDocument,
  replaceExpiredPortalDocument: vi.fn(),
  reloadAuthenticatedDocument: vi.fn(),
}))

const fetchMock = vi.fn()

function sessionPayload() {
  const now = Date.now()
  return {
    authenticatedAt: new Date(now - 60_000).toISOString(),
    expiresAt: new Date(now + 7 * 60 * 60 * 1000).toISOString(),
    lastActivityAt: new Date(now - 60_000).toISOString(),
    idleExpiresAt: new Date(now + 29 * 60 * 1000).toISOString(),
  }
}

function jsonResult(body: unknown, ok = true, status = ok ? 200 : 500) {
  return { ok, status, json: async () => body }
}

const emptyDashboard = {
  summary: { activeCases: 0, attentionCases: 0, previousCases: 0 },
  attentionCases: [],
  recentCases: [],
}

function renderPortal() {
  return render(<PortalLayout><PortalHome dashboard={emptyDashboard} /></PortalLayout>)
}

beforeEach(() => {
  nav.pathname = "/portal"
  vi.stubGlobal("fetch", fetchMock)
  fetchMock.mockReset()
  fetchMock.mockImplementation((url: string) => {
    if (url === "/api/portal/auth/sign-out") return Promise.resolve(jsonResult({ status: "ok" }))
    return Promise.resolve(jsonResult(sessionPayload()))
  })
  router.push.mockReset()
  replaceDocument.mockReset()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
})

describe("portal shell", () => {
  it("renders the quiet welcome shell and the fixed navigation", () => {
    renderPortal()
    expect(screen.getByText("My ProfileRelaunch").tagName).not.toBe("H1")
    expect(screen.queryByText("Secure customer area")).toBeNull()
    expect(screen.getByRole("heading", { level: 1, name: "Welcome back" })).toBeTruthy()
    expect(screen.getByText("Here is where your cases stand, and the one step that needs you when there is one.")).toBeTruthy()
    expect(screen.getByRole("link", { name: "Tell us about your business" })).toHaveAttribute("href", "https://profilerelaunch.com/get-help")
    expect(screen.getByRole("heading", { level: 2, name: "No active cases" })).toBeTruthy()
    expect(screen.getByText("When you start a ProfileRelaunch case, it will appear here.")).toBeTruthy()

    const navigation = screen.getByRole("navigation", { name: "Customer portal" })
    const labels = [...navigation.querySelectorAll("a")].map(item => item.textContent?.trim())
    expect(labels).toEqual(["Dashboard", "Cases", "Documents", "Messages", "Payments", "Relaunch Guard", "Account"])
    const dashboard = screen.getByRole("link", { name: "Dashboard" })
    expect(dashboard).toHaveAttribute("href", "/portal")
    expect(dashboard).toHaveAttribute("aria-current", "page")
    const cases = screen.getByRole("link", { name: "Cases" })
    expect(cases).toHaveAttribute("href", "/portal/cases")
    expect(cases).not.toHaveAttribute("aria-current")
    const documents = screen.getByRole("link", { name: "Documents" })
    expect(documents).toHaveAttribute("href", "/portal/documents")
    expect(documents).not.toHaveAttribute("aria-current")
    const payments = screen.getByRole("link", { name: "Payments" })
    expect(payments).toHaveAttribute("href", "/portal/payments")
    expect(payments).not.toHaveAttribute("aria-current")
    const guard = screen.getByRole("link", { name: "Relaunch Guard" })
    expect(guard).toHaveAttribute("href", "/portal/guard")
    expect(guard).not.toHaveAttribute("aria-current")
    const messages = screen.getByRole("link", { name: "Messages" })
    expect(messages).toHaveAttribute("href", "/portal/messages")
    expect(messages).not.toHaveAttribute("aria-current")
    const account = screen.getByRole("link", { name: "Account" })
    expect(account).toHaveAttribute("href", "/portal/account")
    expect(account).not.toHaveAttribute("aria-current")
    expect(navigation.querySelectorAll("a")).toHaveLength(7)
    const more = screen.getByRole("button", { name: "More" })
    expect(more).toHaveAttribute("aria-expanded", "false")
    expect(more.getAttribute("aria-controls")).toBeTruthy()
    expect(navigation.querySelector("[aria-disabled='true']")).toBeNull()
    expect(document.body.textContent).not.toMatch(/@|customerId|session token|£|sample case|coming soon|Get Help|Admin/i)
    expect(screen.getByRole("button", { name: "Sign out" })).toHaveClass("secondary")
  })

  it("does not create placeholder portal routes", () => {
    const portalDir = join(process.cwd(), "app/portal")
    expect(existsSync(join(portalDir, "page.tsx"))).toBe(true)
    expect(existsSync(join(portalDir, "cases", "page.tsx"))).toBe(true)
    expect(existsSync(join(portalDir, "cases", "[id]"))).toBe(false)
    expect(existsSync(join(portalDir, "cases", "[reference]", "page.tsx"))).toBe(true)
    expect(existsSync(join(portalDir, "documents", "page.tsx"))).toBe(true)
    expect(existsSync(join(portalDir, "cases", "[reference]", "documents", "page.tsx"))).toBe(true)
    expect(existsSync(join(portalDir, "payments", "page.tsx"))).toBe(true)
    expect(existsSync(join(portalDir, "cases", "[reference]", "payments", "page.tsx"))).toBe(true)
    expect(existsSync(join(portalDir, "guard", "page.tsx"))).toBe(true)
    expect(existsSync(join(portalDir, "guard", "[selector]", "page.tsx"))).toBe(true)
    expect(existsSync(join(portalDir, "messages", "page.tsx"))).toBe(true)
    expect(existsSync(join(portalDir, "messages", "[selector]", "page.tsx"))).toBe(true)
    expect(existsSync(join(portalDir, "account", "page.tsx"))).toBe(true)
    expect(existsSync(join(portalDir, "relaunch-guard"))).toBe(false)
    expect(existsSync(join(portalDir, "relaunch-guard", "page.tsx"))).toBe(false)
  })

  it("opens the remaining destinations from More and restores focus", async () => {
    renderPortal()
    const more = screen.getByRole("button", { name: "More" })
    fireEvent.click(more)
    expect(more).toHaveAttribute("aria-expanded", "true")
    expect(document.getElementById(more.getAttribute("aria-controls") || "")).toHaveClass("is-open")
    await waitFor(() => expect(screen.getByRole("link", { name: "Messages" })).toHaveFocus())
    fireEvent.keyDown(document, { key: "ArrowDown" })
    expect(screen.getByRole("link", { name: "Payments" })).toHaveFocus()
    fireEvent.keyDown(document, { key: "Escape" })
    expect(more).toHaveAttribute("aria-expanded", "false")
    expect(more).toHaveFocus()
    fireEvent.click(more)
    await waitFor(() => expect(screen.getByRole("link", { name: "Messages" })).toHaveFocus())
    fireEvent.pointerDown(document.body)
    expect(more).toHaveAttribute("aria-expanded", "false")
  })

  it("keeps the current destination visible when it lives in More", () => {
    nav.pathname = "/portal/messages"
    renderPortal()
    expect(screen.getByRole("link", { name: "Messages" })).toHaveAttribute("aria-current", "page")
    const more = screen.getByRole("button", { name: "More, Messages" })
    expect(more).toHaveAttribute("aria-current", "true")
    fireEvent.click(more)
    expect(screen.getByRole("link", { name: "Messages" })).toHaveAttribute("aria-current", "page")
  })

  it("signs out through the portal endpoint and returns to login", async () => {
    renderPortal()
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }))
    await waitFor(() => expect(replaceDocument).toHaveBeenCalledWith("login"))
    expect(router.push).not.toHaveBeenCalled()
    const signOut = fetchMock.mock.calls.find(call => call[0] === "/api/portal/auth/sign-out")
    expect(signOut?.[1]).toEqual(expect.objectContaining({ method: "POST", body: "{}" }))
  })

  it("shows signing out until the server confirms, then keeps the error on failure", async () => {
    let resolveSignOut: (value: unknown) => void = () => {}
    fetchMock.mockImplementation((url: string) => {
      if (url === "/api/portal/auth/sign-out") return new Promise(resolve => { resolveSignOut = resolve })
      return Promise.resolve(jsonResult(sessionPayload()))
    })
    renderPortal()
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }))
    expect(await screen.findByRole("button", { name: "Signing out…" })).toBeDisabled()
    expect(router.push).not.toHaveBeenCalled()
    expect(replaceDocument).not.toHaveBeenCalled()
    expect(screen.getByRole("heading", { name: "Welcome back" })).toBeTruthy()
    resolveSignOut(jsonResult({}, false, 500))
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("We couldn't sign you out. Try again."))
    expect(screen.getAllByRole("alert")).toHaveLength(1)
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull()
    expect(router.push).not.toHaveBeenCalled()
    expect(replaceDocument).not.toHaveBeenCalled()
    expect(screen.getByRole("button", { name: "Sign out" })).toBeEnabled()
  })

  it("keeps My Products out of the product navigation and the legacy bar unchanged", () => {
    const closed = render(<PortalNav />)
    expect(screen.queryByRole("link", { name: "Back to My Products" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Switch product" })).toBeNull()
    expect(screen.getByRole("link", { name: "Relaunch Guard" })).toHaveAttribute("href", "/portal/guard")
    closed.unmount()
    nav.pathname = "/portal/recovery"
    render(<PortalNav mode="recovery" />)
    expect(screen.queryByRole("link", { name: "Back to My Products" })).toBeNull()
    const dashboard = screen.getByRole("link", { name: "Dashboard" })
    expect(dashboard).toHaveAttribute("href", "/portal/recovery")
    expect(dashboard).toHaveAttribute("aria-current", "page")
    expect(screen.queryByRole("link", { name: "Relaunch Guard" })).toBeNull()
    expect(screen.getByRole("link", { name: "Cases" })).toHaveAttribute("href", "/portal/cases")
    expect(screen.getByRole("link", { name: "Payments" })).toHaveAttribute("href", "/portal/payments")
  })

  it("uses a launcher shell on My Products and a Guard shell without Recovery tabs", () => {
    vi.stubEnv("CUSTOMER_PRODUCTS_HUB_ENABLED", "true")
    nav.pathname = "/portal/products"
    const products = renderPortal()
    expect(screen.queryByText("My ProfileRelaunch")).toBeNull()
    expect(screen.queryByRole("navigation", { name: "Customer portal" })).toBeNull()
    expect(screen.queryByRole("link", { name: "Dashboard" })).toBeNull()
    expect(screen.queryByRole("link", { name: "Cases" })).toBeNull()
    expect(screen.queryByRole("link", { name: "Relaunch Guard" })).toBeNull()
    products.unmount()

    nav.pathname = "/portal"
    const entry = renderPortal()
    expect(screen.queryByRole("navigation", { name: "Customer portal" })).toBeNull()
    entry.unmount()

    nav.pathname = "/portal/guard"
    renderPortal()
    expect(screen.queryByRole("heading", { level: 1, name: "Relaunch Guard" })).toBeNull()
    const labels = [...screen.getByRole("navigation", { name: "Customer portal" }).querySelectorAll("a")].map(item => item.textContent?.trim())
    expect(labels).toEqual(["Relaunch Guard", "Account"])
    expect(document.querySelector(".portal-context-product")).toHaveTextContent("Relaunch Guard")
    expect(document.querySelector(".portal-context-title")).toHaveTextContent("Dashboard")
    expect(screen.getByRole("button", { name: "Switch product" })).toBeEnabled()
    expect(screen.queryByRole("link", { name: "Back to My Products" })).toBeNull()
    expect(screen.getByRole("link", { name: "Relaunch Guard" })).toHaveAttribute("aria-current", "page")
    expect(screen.queryByRole("link", { name: "Cases" })).toBeNull()
    expect(screen.queryByRole("link", { name: "Documents" })).toBeNull()
    expect(screen.queryByRole("link", { name: "Messages" })).toBeNull()
    expect(screen.queryByRole("link", { name: "Payments" })).toBeNull()
    expect(screen.queryByRole("button", { name: "More" })).toBeNull()
    expect(screen.queryByRole("link", { name: "Back to My Products" })).toBeNull()
    vi.unstubAllEnvs()
  })

  it("keeps Account on the original navigation while the hub is off", () => {
    nav.pathname = "/portal/account"
    render(<PortalLayout><AccountView account={{ name: "Alex Customer", email: "alex@example.com", phone: null, emailVerified: true, phoneVerified: false }} /></PortalLayout>)
    expect(screen.getByText("My ProfileRelaunch").tagName).not.toBe("H1")
    const labels = [...screen.getByRole("navigation", { name: "Customer portal" }).querySelectorAll("a")].map(item => item.textContent?.trim())
    expect(labels).toEqual(["Dashboard", "Cases", "Documents", "Messages", "Payments", "Relaunch Guard", "Account"])
    expect(screen.getByRole("link", { name: "Account" })).toHaveAttribute("aria-current", "page")
    expect(screen.getByRole("heading", { level: 1, name: "Account" })).toBeTruthy()
    expect(screen.getByRole("link", { name: "Cases" })).toHaveAttribute("href", "/portal/cases")
    expect(screen.queryByRole("link", { name: "Back to My Products" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Switch product" })).toBeNull()
  })

  it("uses a neutral Account shell when the hub is on", () => {
    vi.stubEnv("CUSTOMER_PRODUCTS_HUB_ENABLED", "true")
    nav.pathname = "/portal/account"
    render(<PortalLayout><AccountView account={{ name: "Alex Customer", email: "alex@example.com", phone: null, emailVerified: true, phoneVerified: false }} /></PortalLayout>)
    expect(document.querySelector(".portal-context-title")).toHaveTextContent("Account")
    expect(document.querySelector(".portal-context-title")?.tagName).not.toBe("H1")
    const labels = [...screen.getByRole("navigation", { name: "Customer portal" }).querySelectorAll("a")].map(item => item.textContent?.trim())
    expect(labels).toEqual(["Account"])
    expect(screen.getByRole("button", { name: "Switch product" })).toBeEnabled()
    expect(screen.queryByRole("link", { name: "Back to My Products" })).toBeNull()
    expect(screen.queryByRole("link", { name: "My Products" })).toBeNull()
    expect(screen.getByRole("link", { name: "Account" })).toHaveAttribute("aria-current", "page")
    expect(screen.getByRole("heading", { level: 1, name: "Account" })).toBeTruthy()
    expect(screen.queryByRole("link", { name: "Cases" })).toBeNull()
    expect(screen.queryByRole("link", { name: "Documents" })).toBeNull()
    expect(screen.queryByRole("link", { name: "Messages" })).toBeNull()
    expect(screen.queryByRole("link", { name: "Payments" })).toBeNull()
    expect(screen.queryByRole("link", { name: "Relaunch Guard" })).toBeNull()
    expect(screen.queryByRole("button", { name: "More" })).toBeNull()
    expect(screen.getAllByRole("button", { name: "Sign out" }).length).toBeGreaterThan(0)
  })

  it("puts the welcome heading before the case summary", () => {
    render(<PortalHome context="Recovery & Review Support / Dashboard" accountName="Ada Okonkwo" dashboard={emptyDashboard} />)
    const heading = screen.getByRole("heading", { level: 1, name: "Welcome back, Ada Okonkwo" })
    const summary = screen.getByText("Active cases")
    expect(heading.compareDocumentPosition(summary) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1)
    expect(screen.getByText("Recovery & Review Support / Dashboard")).toBeTruthy()
    expect(screen.queryByRole("link", { name: "Back to My Products" })).toBeNull()
    const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8")
    const grid = css.slice(css.lastIndexOf(".portal-dashboard {"))
    expect(grid).toContain('"head head"')
    expect(grid).toContain('"main side"')
    expect(grid).toContain('"below below"')
    expect(grid).not.toMatch(/\.portal-main \{[^}]*grid-row:\s*2/)
  })

  it("signs out from My Products and still checks the idle session", async () => {
    vi.stubEnv("CUSTOMER_PRODUCTS_HUB_ENABLED", "true")
    nav.pathname = "/portal/products"
    render(<PortalLayout><ProductsView products={presentProducts({
      recovery: { status: "unavailable" },
      guard: { status: "unavailable" },
    })} /></PortalLayout>)
    expect(screen.queryByRole("navigation", { name: "Customer portal" })).toBeNull()
    expect(screen.getByRole("link", { name: "Account" })).toHaveAttribute("href", "/portal/account")
    expect(screen.queryByText("Ada Okonkwo")).toBeNull()
    await waitFor(() => expect(fetchMock.mock.calls.some(call => call[0] === "/api/portal/auth/session")).toBe(true))
    const session = fetchMock.mock.calls.find(call => call[0] === "/api/portal/auth/session")
    expect(session?.[1]).toEqual(expect.objectContaining({ method: "GET" }))
    fireEvent.click(screen.getByRole("button", { name: "Sign out" }))
    await waitFor(() => expect(replaceDocument).toHaveBeenCalledWith("login"))
    const signOut = fetchMock.mock.calls.find(call => call[0] === "/api/portal/auth/sign-out")
    expect(signOut?.[1]).toEqual(expect.objectContaining({ method: "POST", body: "{}" }))
  })
})
