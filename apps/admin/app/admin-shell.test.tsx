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

  it("exposes Sign out and implemented navigation without the admin email", () => {
    pathname = "/"
    const { container } = render(<AdminShell><h1>Today</h1></AdminShell>)
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy()
    expect(screen.queryByRole("button", { name: "Sign out all devices" })).toBeNull()
    expect(screen.getAllByText("Admin Portal").length).toBeGreaterThan(0)
    expect(screen.getByRole("navigation", { name: "Admin workspace" })).toBeTruthy()
    expect(screen.getByRole("link", { name: "Today" })).toHaveAttribute("href", "/")
    expect(screen.getByRole("link", { name: "Security" })).toHaveAttribute("href", "/security")
    expect(screen.getByRole("link", { name: "Documents" })).toHaveAttribute("href", "/documents")
    expect(container.textContent).not.toContain("admin@profilerelaunch.com")
    expect(container.textContent).toContain("ProfileRelaunch Administrator")
    expect(container.textContent).not.toMatch(/Payments|Communications|Reports/)
  })

  it("opens and closes the mobile navigation without leaving a horizontal menu", () => {
    pathname = "/cases"
    render(<AdminShell><h1>Cases</h1></AdminShell>)
    const toggle = screen.getByRole("button", { name: "Open menu" })
    expect(toggle).toHaveAttribute("aria-expanded", "false")
    fireEvent.click(toggle)
    expect(screen.getByRole("button", { name: "Close menu" })).toHaveAttribute("aria-expanded", "true")
    fireEvent.click(screen.getByRole("button", { name: "Dismiss navigation" }))
    expect(screen.getByRole("button", { name: "Open menu" })).toHaveAttribute("aria-expanded", "false")
  })
})
