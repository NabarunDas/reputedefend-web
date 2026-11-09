/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react"
import "@testing-library/jest-dom/vitest"
import { afterEach, describe, expect, it, vi } from "vitest"
import HomePage from "@/app/page"
import PricingPage from "@/app/pricing/page"
import RelaunchGuardPage from "@/app/relaunch-guard/page"
import { Footer } from "@/components/footer"
import { relaunchGuardOverview as copy } from "@/lib/relaunch-guard-overview"
import { footerContent } from "@/lib/content"
import { formatGbpPrice, relaunchGuardAddon } from "@/lib/pricing"

vi.mock("next/navigation", () => ({
  usePathname: () => "/relaunch-guard",
}))

afterEach(() => {
  cleanup()
})

describe("Relaunch Guard overview", () => {
  it("explains Guard from the approved ProfileRelaunch facts and keeps it separate from Telloya", () => {
    render(<RelaunchGuardPage />)

    expect(screen.getByRole("heading", { level: 1, name: "Relaunch Guard" })).toBeInTheDocument()
    const artwork = screen.getByRole("img", { name: /concept Google Business Profile/i })
    expect(artwork.getAttribute("src")).toContain("relaunch-guard-hero.webp")
    expect(artwork).toHaveAttribute("width", "912")
    expect(artwork).toHaveAttribute("height", "355")
    expect(screen.getByText(copy.hero.lead)).toBeInTheDocument()
    expect(screen.getByText(copy.checks.cards[0].text)).toBeInTheDocument()
    expect(screen.getByText(copy.checks.cards[1].text)).toBeInTheDocument()
    expect(screen.getByText(copy.checks.cards[2].text)).toBeInTheDocument()
    expect(screen.getByText(copy.schedule.body)).toBeInTheDocument()
    expect(screen.getByText(copy.schedule.followUp)).toBeInTheDocument()
    expect(screen.getByText(/You never need to share your Google password/)).toBeInTheDocument()
    expect(screen.getByText(`${formatGbpPrice(relaunchGuardAddon.pricePerLocationGbp)} per paid Guard location per month`)).toBeInTheDocument()
    expect(screen.getByText(copy.price.entitlement)).toBeInTheDocument()
    for (const limit of copy.limits.items) {
      expect(screen.getAllByText(limit).length).toBeGreaterThan(0)
    }
    expect(screen.getByText(copy.authority.body)).toBeInTheDocument()
    expect(screen.queryByText(/Telloya Complete/)).not.toBeInTheDocument()
    expect(screen.queryByText(/continuous monitoring/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/AI-powered/i)).not.toBeInTheDocument()

    const enquire = screen.getAllByRole("link", { name: "Enquire about Telloya + Guard" })
    expect(enquire.length).toBeGreaterThan(0)
    expect(enquire.every((link) => link.getAttribute("href") === "/enquire?product=complete")).toBe(true)

    const external = screen.getAllByRole("link", { name: /View full details on ProfileRelaunch/ })
    expect(external.length).toBeGreaterThan(0)
    for (const link of external) {
      expect(link).toHaveAttribute("href", "https://profilerelaunch.com/relaunch-guard")
      expect(link).toHaveAttribute("target", "_blank")
      expect(link).toHaveAttribute("rel", "noopener noreferrer")
    }
  })

  it("links the homepage, pricing page and footer to the overview without dropping the external Guard link", () => {
    const { unmount } = render(<HomePage />)
    expect(screen.getByRole("link", { name: "Learn about Relaunch Guard" })).toHaveAttribute("href", "/relaunch-guard")
    unmount()

    render(<PricingPage />)
    expect(screen.getByRole("link", { name: "Learn more about Relaunch Guard" })).toHaveAttribute("href", "/relaunch-guard")
    cleanup()

    render(<Footer />)
    const internal = screen.getAllByRole("link", { name: "Relaunch Guard" }).find((link) => link.getAttribute("href") === "/relaunch-guard")
    const external = screen.getAllByRole("link", { name: "Relaunch Guard" }).find((link) => link.getAttribute("href") === "https://profilerelaunch.com/relaunch-guard")
    expect(internal).toBeDefined()
    expect(external).toHaveAttribute("rel", "noopener noreferrer")
    expect(footerContent.sections.find((section) => section.title === "ProfileRelaunch")?.links).toEqual([
      { label: "Main Website", href: "https://profilerelaunch.com" },
      { label: "Relaunch Guard", href: "https://profilerelaunch.com/relaunch-guard" },
    ])
  })
})
