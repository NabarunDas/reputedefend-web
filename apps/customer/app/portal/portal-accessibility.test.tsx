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

const nav = vi.hoisted(() => ({ pathname: "/portal" }))
vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}))

afterEach(() => {
  cleanup()
  nav.pathname = "/portal"
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
    const surfaces: Array<[string, string, React.ReactElement]> = [
      ["/portal", "Welcome to My ProfileRelaunch", <PortalHome dashboard={{ summary: { activeCases: 0, attentionCases: 0, previousCases: 0 }, attentionCases: [], recentCases: [] }} />],
      ["/portal", "We couldn't load your customer space", <PortalUnavailable />],
      ["/portal/cases", "Cases", <CasesView view="active" page={{ cases: [], nextCursor: null }} />],
      ["/portal/cases", "Cases", <CasesUnavailable />],
      ["/portal/documents", "Documents", <DocumentsView documents={{ needs: [], submissions: [], documents: [] }} />],
      ["/portal/documents", "We couldn't load your documents", <DocumentsUnavailable />],
      ["/portal/cases/PR-26-AAAAAA", "We couldn't load this case", <CaseUnavailable />],
      ["/portal/cases/PR-26-AAAAAA/documents", "We couldn't load documents for this case", <CaseDocumentsUnavailable />],
      ["/portal/cases/PR-26-AAAAAA/service", "We couldn't load service details", <ServiceUnavailable />],
      ["/portal/payments", "Payments", <PaymentsView cases={[]} focused={false} />],
      ["/portal/payments", "We couldn't load payments", <PaymentsUnavailable />],
      ["/portal/guard", "Relaunch Guard", <GuardView locations={[]} focused={false} />],
      ["/portal/guard", "We couldn't load Relaunch Guard", <GuardUnavailable />],
      ["/portal/messages", "Messages", <MessagesView page={{ threads: [], complete: true, nextCursor: null }} earlier={false} />],
      ["/portal/messages", "Messages", <MessagesUnavailable />],
      ["/portal/account", "Account", <AccountView account={{ name: "Alex Customer", email: `${"a".repeat(80)}@example.com`, phone: null, emailVerified: true, phoneVerified: false }} />],
      ["/portal/account", "Account", <AccountUnavailable />],
    ]
    for (const [pathname, heading, view] of surfaces) {
      nav.pathname = pathname
      const { unmount } = render(<PortalLayout>{view}</PortalLayout>)
      oneHeading(heading)
      const current = screen.getByRole("navigation", { name: "Customer portal" }).querySelector("[aria-current='page']")
      expect(current).toBeTruthy()
      expect(current?.getAttribute("href")).toBeTruthy()
      const long = document.querySelector(".account-page dd, .lead, .case-ref, h1")
      expect(long).toBeTruthy()
      unmount()
    }
  })
})
