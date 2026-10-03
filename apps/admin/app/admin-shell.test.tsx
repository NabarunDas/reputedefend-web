// @vitest-environment jsdom
import React from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { AdminShell } from "./admin-shell"
import "@testing-library/jest-dom/vitest"

let pathname = "/"
vi.mock("next/navigation", () => ({ usePathname: () => pathname }))
vi.mock("next/link", () => ({
  default({ href, children, ...props }: { href: string; children: React.ReactNode } & Record<string, unknown>) {
    return <a href={href} {...props}>{children}</a>
  },
}))

afterEach(() => cleanup())

describe("admin shell", () => {
  it("keeps the login route free of workspace navigation and the admin email", () => {
    pathname = "/login"
    const { container } = render(<AdminShell><p>Sign-in card</p></AdminShell>)
    expect(screen.queryByRole("navigation", { name: "Admin workspace" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull()
    expect(screen.queryByRole("button", { name: "Open menu" })).toBeNull()
    expect(container.textContent).not.toContain("admin@profilerelaunch.com")
    expect(screen.getByText("Sign-in card")).toBeTruthy()
  })

  it("keeps search in the header and the workspace destinations in the sidebar", () => {
    pathname = "/"
    const { container } = render(<AdminShell><h1>Today</h1></AdminShell>)
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Sign out all devices" })).toBeNull()
    expect(screen.getAllByText("Admin Portal").length).toBeGreaterThan(0)
    const nav = screen.getByRole("navigation", { name: "Admin workspace" })
    expect(nav.querySelector("a[href='/search']")).toBeNull()
    const search = screen.getByRole("search")
    expect(search.tagName).toBe("FORM")
    expect(search).toHaveAttribute("action", "/search")
    expect(screen.getByRole("textbox", { name: "Search records" })).toHaveAttribute("placeholder", "Search cases, clients, businesses…")
    expect(screen.getByRole("link", { name: "Today" })).toHaveAttribute("href", "/")
    expect(screen.getByRole("link", { name: "Intake" })).toHaveAttribute("href", "/enquiries")
    expect(screen.getByRole("link", { name: "Cases" })).toHaveAttribute("href", "/cases")
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/settings")
    expect(screen.getByRole("link", { name: "Security", hidden: true })).toHaveAttribute("href", "/security")
    expect(screen.getByRole("link", { name: "Privacy", hidden: true })).toHaveAttribute("href", "/privacy")
    expect(screen.getByRole("link", { name: "Complaints", hidden: true })).toHaveAttribute("href", "/complaints")
    expect(screen.getByRole("link", { name: "Incidents", hidden: true })).toHaveAttribute("href", "/incidents")
    expect(screen.getByRole("link", { name: "Documents", hidden: true })).toHaveAttribute("href", "/documents")
    expect(screen.getByRole("link", { name: "Communications", hidden: true })).toHaveAttribute("href", "/communications")
    expect(screen.getByRole("link", { name: "Reports" })).toHaveAttribute("href", "/reports")
    expect(container.textContent).not.toContain("admin@profilerelaunch.com")
    expect(container.textContent).toContain("ProfileRelaunch Administrator")
    expect(screen.getByRole("main")).toHaveAttribute("id", "main-content")
    expect(container.textContent).not.toMatch(/Payments/)
  })

  it("opens and closes the mobile navigation from the button and the backdrop", () => {
    pathname = "/cases"
    render(<AdminShell><h1>Cases</h1></AdminShell>)
    const toggle = screen.getByRole("button", { name: "Open menu" })
    expect(toggle).toHaveAttribute("aria-expanded", "false")
    expect(toggle).toHaveAttribute("aria-controls", "admin-sidebar")
    fireEvent.click(toggle)
    expect(screen.getByRole("button", { name: "Close menu" })).toHaveAttribute("aria-expanded", "true")
    fireEvent.click(screen.getByRole("button", { name: "Dismiss navigation" }))
    expect(screen.getByRole("button", { name: "Open menu" })).toHaveAttribute("aria-expanded", "false")
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }))
    fireEvent.click(screen.getByRole("button", { name: "Close menu" }))
    expect(screen.getByRole("button", { name: "Open menu" })).toHaveAttribute("aria-expanded", "false")
  })

  it("opens an inactive disclosure without closing the drawer, and closes the drawer when a destination is chosen", () => {
    pathname = "/complaints/complaint-1"
    render(<AdminShell><h1>Complaint</h1></AdminShell>)
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }))
    expect(screen.queryByText("Operations", { selector: "summary" })).toBeNull()
    expect(screen.getByRole("link", { name: "Complaints" })).toBeVisible()
    expect(screen.getByRole("link", { name: "Complaints" })).toHaveAttribute("aria-current", "page")
    fireEvent.click(screen.getByText("Guard", { selector: "summary" }))
    expect(screen.getByText("Guard", { selector: "summary" }).closest("details")).toHaveAttribute("open")
    expect(screen.getByRole("link", { name: "Overview" })).toBeVisible()
    expect(screen.getByRole("button", { name: "Close menu" })).toHaveAttribute("aria-expanded", "true")
    fireEvent.click(screen.getByRole("link", { name: "Overview" }))
    expect(screen.getByRole("button", { name: "Open menu" })).toHaveAttribute("aria-expanded", "false")
  })

  it("does not give search results a sidebar current page", () => {
    pathname = "/search"
    render(<AdminShell><h1>Search</h1></AdminShell>)
    expect(screen.getByRole("search")).toHaveAttribute("action", "/search")
    expect(screen.getAllByRole("link").some(link => link.getAttribute("aria-current") === "page")).toBe(false)
  })
})
