/** @vitest-environment jsdom */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react"
import "@testing-library/jest-dom/vitest"
import { afterEach, describe, expect, it, vi } from "vitest"
import HomePage from "@/app/page"
import HowItWorks from "@/app/how-it-works/page"
import { Header } from "@/components/header"
import { homepageContent, howItWorksContent, navigationContent } from "@/lib/content"
import { getCustomerPortalHref } from "@/lib/customer-portal"
import { telloyaPlans } from "@/lib/pricing"

vi.mock("next/navigation", () => ({
  usePathname: () => "/demo",
}))

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

const primaryLabels = ["How It Works", "Features", "Industries", "Pricing", "See Example"]
const primaryHrefs = ["/how-it-works", "/features", "/industries", "/pricing", "/demo"]

describe("Telloya navigation", () => {
  it("shows five primary links, with See Example fifth, and keeps login separate from enquire", () => {
    const { container } = render(<Header />)
    const primary = within(container.querySelector(".site-nav-links") as HTMLElement).getAllByRole("link")
    expect(primary.map((link) => link.textContent)).toEqual(primaryLabels)
    expect(primary.map((link) => link.getAttribute("href"))).toEqual(primaryHrefs)
    expect(primary).toHaveLength(5)
    expect(primary[4]).toHaveTextContent("See Example")
    expect(primary[4]).toHaveAttribute("href", "/demo")
    expect(primary[4]).toHaveAttribute("aria-current", "page")
    expect(primary.slice(0, 4).every((link) => link.getAttribute("aria-current") === null)).toBe(true)

    const desktopLogin = container.querySelector(".site-nav-account")
    const desktopEnquire = container.querySelector(".site-nav-cta .button-secondary")
    expect(desktopLogin).toHaveTextContent("Customer Login")
    expect(desktopLogin).toHaveAttribute("href", getCustomerPortalHref())
    expect(desktopEnquire).toHaveTextContent("Enquire about Telloya")
    expect(desktopEnquire).toHaveAttribute("href", "/enquire")
    expect(navigationContent.account.href).toBe(getCustomerPortalHref())
    expect(navigationContent.cta).toEqual({ label: "Enquire about Telloya", href: "/enquire" })

    const compactEnquire = container.querySelector(".site-nav-compact-cta")
    expect(compactEnquire).toHaveTextContent("Enquire")
    expect(compactEnquire).toHaveAccessibleName("Enquire about Telloya")
    expect(compactEnquire).toHaveAttribute("href", "/enquire")
  })

  it("keeps every header link keyboard reachable and does not submit an enquiry", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response())
    const { container } = render(<Header />)
    const nav = screen.getByRole("navigation", { name: "Main navigation" })
    for (const link of within(nav).getAllByRole("link")) {
      expect(link.tabIndex).not.toBe(-1)
      link.focus()
      expect(link).toHaveFocus()
      fireEvent.click(link)
    }
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(container.querySelector("form")).toBeNull()

    const css = readFileSync(resolve(process.cwd(), "app/globals.css"), "utf8")
    expect(css).toContain(":focus-visible")
    expect(css).toContain(".site-nav-account:focus-visible")
    expect(css).toContain("@media (max-width: 1180px)")
    expect(css).not.toContain("max-width: 1060px")
  })

  it("operates the mobile menu from the keyboard and closes it after an internal link", () => {
    const { container } = render(<Header />)
    const menu = container.querySelector("#mobile-menu")
    fireEvent.click(screen.getByRole("button", { name: "Open menu" }))
    expect(menu).not.toHaveAttribute("aria-hidden")

    const mobileLinks = within(menu as HTMLElement).getAllByRole("link")
    expect(mobileLinks.map((link) => link.textContent)).toEqual([
      ...primaryLabels,
      "Customer Login",
      "Enquire about Telloya",
    ])
    for (const link of mobileLinks) {
      link.focus()
      expect(link).toHaveFocus()
    }
    expect(within(menu as HTMLElement).getByRole("link", { name: "See Example" })).toHaveAttribute("aria-current", "page")
    expect(within(menu as HTMLElement).getByRole("link", { name: "Customer Login" })).toHaveAttribute("href", getCustomerPortalHref())

    const opener = screen.getByRole("button", { name: "Open menu" })
    expect(opener).toHaveAttribute("aria-expanded", "true")
    expect(opener).toHaveAttribute("aria-controls", "mobile-menu")
    expect(menu).toHaveAttribute("role", "dialog")
    expect(menu).toHaveAttribute("aria-modal", "true")
    expect(menu).toHaveAttribute("aria-label", "Mobile navigation")
    expect(menu).not.toHaveAttribute("inert")

    fireEvent.keyDown(document, { key: "Escape" })
    expect(menu).toHaveAttribute("aria-hidden", "true")
    expect(menu).toHaveAttribute("inert")
    expect(opener).toHaveFocus()

    fireEvent.click(opener)
    fireEvent.click(screen.getByRole("button", { name: "Close menu" }))
    expect(menu).toHaveAttribute("aria-hidden", "true")
    expect(opener).toHaveAttribute("aria-expanded", "false")
    expect(opener).toHaveFocus()

    fireEvent.click(opener)
    fireEvent.click(within(menu as HTMLElement).getByRole("link", { name: "Enquire about Telloya" }))
    expect(menu).toHaveAttribute("aria-hidden", "true")
  })

  it("leaves the homepage hero and the sample links on their existing destinations", () => {
    const { unmount } = render(<HomePage />)
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Don't Let Missed Calls")
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Cost You Customers.")
    expect(screen.getByRole("link", { name: /See how Telloya works/i })).toHaveAttribute("href", "/how-it-works")
    expect(screen.getByRole("link", { name: "See a Sample Conversation" })).toHaveAttribute("href", "/demo")
    expect(homepageContent.hero.primaryCta).toBe("See how Telloya works")
    expect(homepageContent.hero.secondaryCta).toBe("Enquire about Telloya")
    expect(homepageContent.example.demoLink).toEqual({ label: "See a Sample Conversation", href: "/demo" })
    unmount()

    render(<HowItWorks />)
    expect(screen.getByRole("link", { name: "See a Sample Conversation" })).toHaveAttribute("href", "/demo")
    expect(howItWorksContent.experience.demoLink.href).toBe("/demo")
    expect(telloyaPlans.map((plan) => [plan.tier, plan.monthlyPriceGbp, plan.minutesPerMonth])).toEqual([
      ["basic", 49, 120],
      ["growth", 79, 300],
      ["pro", 120, 500],
      ["custom", null, null],
    ])
  })
})
