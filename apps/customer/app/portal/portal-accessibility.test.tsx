// @vitest-environment jsdom
import React from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import PortalLayout from "./layout"
import { PortalHome, PortalUnavailable } from "./portal-home"
import { CasesUnavailable, CasesView } from "./cases/cases-view"
import { DocumentsUnavailable, DocumentsView } from "./documents/documents-view"
import { CaseDocumentsUnavailable } from "./cases/[reference]/documents/case-documents"
import { CaseUnavailable } from "./cases/[reference]/case-workspace"
import { ServiceUnavailable } from "./cases/[reference]/service/service-view"
import { PaymentsUnavailable, PaymentsView } from "./payments/payments-view"
import { GuardUnavailable, GuardView } from "./guard/guard-view"
import { MessagesUnavailable, MessagesView } from "./messages/messages-view"
import { AccountUnavailable, AccountView } from "./account/account-view"
import { LoginClient } from "../login/login-client"
import { ProductsLoading, ProductsView } from "./products/products-view"
import { presentProducts } from "@/lib/portal/products/present"

const nav = vi.hoisted(() => ({ pathname: "/portal" }))
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

afterEach(() => {
  cleanup()
  nav.pathname = "/portal"
  vi.unstubAllEnvs()
})

function oneHeading(name: string | RegExp) {
  const headings = screen.getAllByRole("heading", { level: 1 })
  expect(headings).toHaveLength(1)
  expect(headings[0].textContent).toMatch(name)
  expect(document.querySelector("[tabindex='1'], [tabindex='2']")).toBeNull()
  for (const control of document.querySelectorAll("a, button, input, select, textarea")) {
    expect((control.getAttribute("aria-label") || control.textContent || (control as HTMLInputElement).labels?.length || control.id).toString().trim().length).toBeGreaterThan(0)
  }
}

describe("assembled portal accessibility", () => {
  it("gives login one heading, a labelled email field, and an alert on failure", () => {
    render(<LoginClient />)
    oneHeading("Sign in to your ProfileRelaunch account")
    expect(screen.getByLabelText("Email address")).toBeTruthy()
    expect(screen.getByLabelText("Email address")).not.toHaveAttribute("placeholder")
    fireEvent.submit(screen.getByRole("button", { name: "Send code" }).closest("form")!)
    expect(screen.getByRole("alert").textContent).toMatch(/email/i)
    expect(screen.getByRole("button", { name: "Send code" })).toBeEnabled()
  })

  it("marks the current portal destination and gives each surface one heading", () => {
    function check(pathname: string, heading: string, view: React.ReactElement) {
      nav.pathname = pathname
      const { unmount } = render(<PortalLayout>{view}</PortalLayout>)
      oneHeading(heading)
      const current = screen.getByRole("navigation", { name: "Customer portal" }).querySelector("[aria-current='page']")
      expect(current).toBeTruthy()
      expect(current?.getAttribute("href")).toBeTruthy()
      expect(document.querySelector("h1")).toBeTruthy()
      unmount()
    }
    const emptyDashboard = { summary: { activeCases: 0, attentionCases: 0, previousCases: 0 }, attentionCases: [], recentCases: [] }
    check("/portal", "Welcome back", <PortalHome dashboard={emptyDashboard} />)
    check("/portal", "We couldn't load your customer space", <PortalUnavailable />)
    check("/portal/cases", "Cases", <CasesView view="active" page={{ cases: [], nextCursor: null }} />)
    check("/portal/cases", "Cases", <CasesUnavailable />)
    check("/portal/documents", "Documents", <DocumentsView documents={{ needs: [], submissions: [], documents: [] }} />)
    check("/portal/documents", "We couldn't load your documents", <DocumentsUnavailable />)
    check("/portal/cases/PR-26-AAAAAA", "We couldn't load this case", <CaseUnavailable />)
    check("/portal/cases/PR-26-AAAAAA/documents", "We couldn't load documents for this case", <CaseDocumentsUnavailable />)
    check("/portal/cases/PR-26-AAAAAA/service", "We couldn't load service details", <ServiceUnavailable />)
    check("/portal/payments", "Payments", <PaymentsView cases={[]} focused={false} />)
    check("/portal/payments", "We couldn't load payments", <PaymentsUnavailable />)
    check("/portal/guard", "Relaunch Guard", <GuardView locations={[]} focused={false} />)
    check("/portal/guard", "We couldn't load Relaunch Guard", <GuardUnavailable />)
    check("/portal/messages", "Messages", <MessagesView portalContext={"a".repeat(32)} page={{ threads: [], complete: true, nextCursor: null }} earlier={false} />)
    check("/portal/messages", "Messages", <MessagesUnavailable />)
    check("/portal/account", "Account", <AccountView account={{ name: "Alex Customer", email: `${"a".repeat(80)}@example.com`, phone: null, emailVerified: true, phoneVerified: false }} />)
    check("/portal/account", "Account", <AccountUnavailable />)
  })

  it("keeps one My Products heading and hides workspace navigation on the launcher", () => {
    vi.stubEnv("CUSTOMER_PRODUCTS_HUB_ENABLED", "true")
    nav.pathname = "/portal/products"
    render(<PortalLayout><ProductsView products={presentProducts({
      recovery: { status: "unavailable" },
      guard: { status: "unavailable" },
    })} /></PortalLayout>)
    oneHeading("My Products")
    expect(screen.queryByRole("navigation", { name: "Customer portal" })).toBeNull()
    expect(screen.queryByRole("link", { name: "Dashboard" })).toBeNull()
    expect(screen.queryByRole("link", { name: "Cases" })).toBeNull()
    expect(screen.queryByText("My ProfileRelaunch")).toBeNull()
    expect(screen.getByRole("link", { name: "Account" })).toHaveAttribute("href", "/portal/account")
    expect(screen.queryByText("Ada Okonkwo")).toBeNull()
    expect(screen.getByRole("button", { name: "Sign out" })).toBeEnabled()
    cleanup()
    nav.pathname = "/portal/products"
    render(<PortalLayout><ProductsLoading /></PortalLayout>)
    oneHeading("My Products")
    expect(screen.queryByRole("navigation", { name: "Customer portal" })).toBeNull()
    vi.unstubAllEnvs()
  })

  it("marks the current workspace when the hub is open", () => {
    vi.stubEnv("CUSTOMER_PRODUCTS_HUB_ENABLED", "true")
    nav.pathname = "/portal/recovery"
    const recovery = render(<PortalLayout><PortalHome dashboard={{ summary: { activeCases: 0, attentionCases: 0, previousCases: 0 }, attentionCases: [], recentCases: [] }} context="Recovery & Review Support / Dashboard" /></PortalLayout>)
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("href", "/portal/recovery")
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("aria-current", "page")
    expect(screen.getByRole("button", { name: "Switch product" })).toBeEnabled()
    expect(screen.queryByRole("link", { name: "Back to My Products" })).toBeNull()
    expect(screen.queryByRole("link", { name: "Relaunch Guard" })).toBeNull()
    expect(screen.getByText("Recovery & Review Support / Dashboard")).toBeTruthy()
    expect(document.querySelector(".portal-context-product")).toHaveTextContent("Recovery & Review Support")
    expect(document.querySelector(".portal-context-title")).toHaveTextContent("Dashboard")
    recovery.unmount()
    nav.pathname = "/portal/guard"
    const guard = render(<PortalLayout><GuardView locations={[]} focused={false} /></PortalLayout>)
    expect(screen.getByRole("link", { name: "Relaunch Guard" })).toHaveAttribute("aria-current", "page")
    expect(screen.queryByRole("link", { name: "Cases" })).toBeNull()
    guard.unmount()
    nav.pathname = "/portal/account"
    render(<PortalLayout><AccountView account={{ name: "Alex Customer", email: "alex@example.com", phone: null, emailVerified: true, phoneVerified: false }} /></PortalLayout>)
    expect(screen.getByRole("link", { name: "Account" })).toHaveAttribute("aria-current", "page")
    expect(screen.getByRole("button", { name: "Switch product" })).toBeEnabled()
    expect(screen.queryByRole("link", { name: "Back to My Products" })).toBeNull()
    expect(screen.queryByRole("link", { name: "Cases" })).toBeNull()
    expect(screen.queryByRole("link", { name: "Documents" })).toBeNull()
    expect(screen.queryByRole("link", { name: "Messages" })).toBeNull()
    expect(screen.queryByRole("link", { name: "Payments" })).toBeNull()
    vi.unstubAllEnvs()
  })
})
