/** @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import "@testing-library/jest-dom/vitest"
import { Footer } from "./footer"

vi.mock("next/link", () => ({
  default({ href, children, ...props }: { href: string; children: React.ReactNode } & Record<string, unknown>) {
    return <a href={href} {...props}>{children}</a>
  },
}))

describe("Footer explore navigation", () => {
  afterEach(() => {
    cleanup()
  })

  it("lists each required Explore destination once, in order", () => {
    render(<Footer />)
    const explore = screen.getByText("Explore").parentElement
    expect(explore).toBeTruthy()
    const hrefs = [...explore!.querySelectorAll("a")].map((link) => [link.textContent?.trim(), link.getAttribute("href")])
    expect(hrefs).toEqual([
      ["Profile Recovery", "/business-profile-recovery"],
      ["Review Protection", "/review-protection"],
      ["Relaunch Guard", "/relaunch-guard"],
      ["How It Works", "/how-it-works"],
      ["Pricing", "/pricing"],
      ["About", "/about"],
      ["Resources", "/resources"],
    ])
    expect(new Set(hrefs.map(([, href]) => href)).size).toBe(hrefs.length)
  })

  it("shows the ProfileRelaunch contact mailbox", () => {
    render(<Footer />)
    const email = screen.getByRole("link", { name: "contact@profilerelaunch.com" })
    expect(email).toHaveAttribute("href", "mailto:contact@profilerelaunch.com")
    expect(screen.queryByText("contact@reputedefend.com")).not.toBeInTheDocument()
  })
})
