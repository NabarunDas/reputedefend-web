// @vitest-environment jsdom
import React from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { AdminNav, adminNavItems } from "./admin-nav"
import "@testing-library/jest-dom/vitest"

vi.mock("next/link", () => ({
  default({ href, children, ...props }: { href: string; children: React.ReactNode } & Record<string, unknown>) {
    return <a href={href} {...props}>{children}</a>
  },
}))

afterEach(() => cleanup())

describe("admin navigation", () => {
  it("lists only implemented workspace destinations", () => {
    render(<AdminNav pathname="/" />)
    const nav = screen.getByRole("navigation", { name: "Admin workspace" })
    expect([...nav.querySelectorAll("a")].map(link => [link.getAttribute("href"), link.textContent])).toEqual([
      ["/", "Today"],
      ["/enquiries", "Enquiries"],
      ["/records/client", "Clients & Businesses"],
      ["/cases", "Cases"],
      ["/documents", "Documents"],
      ["/tasks", "Tasks"],
      ["/activity", "Activity"],
      ["/security", "Security"],
    ])
    expect(nav.textContent).not.toMatch(/Payments|Guard|Communications|Reports/)
    expect(nav.textContent).not.toContain("admin@profilerelaunch.com")
    expect(adminNavItems).toHaveLength(8)
  })

  it("marks Today as the home route and Security as its own route", () => {
    const { rerender } = render(<AdminNav pathname="/" />)
    expect(screen.getByRole("link", { name: "Today" })).toHaveAttribute("aria-current", "page")
    expect(screen.getByRole("link", { name: "Security" })).not.toHaveAttribute("aria-current")
    rerender(<AdminNav pathname="/security" />)
    expect(screen.getByRole("link", { name: "Today" })).not.toHaveAttribute("aria-current")
    expect(screen.getByRole("link", { name: "Security" })).toHaveAttribute("aria-current", "page")
  })

  it("keeps nested records and enquiry pages on their existing sections", () => {
    const { rerender } = render(<AdminNav pathname="/records/business/new" />)
    expect(screen.getByRole("link", { name: "Clients & Businesses" })).toHaveAttribute("aria-current", "page")
    rerender(<AdminNav pathname="/enquiries/new" />)
    expect(screen.getByRole("link", { name: "Enquiries" })).toHaveAttribute("aria-current", "page")
  })
})
