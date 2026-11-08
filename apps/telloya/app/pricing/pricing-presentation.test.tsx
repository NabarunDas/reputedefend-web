/** @vitest-environment jsdom */
import { readFileSync } from "node:fs"
import { resolve } from "node:path"
import { act, cleanup, render, screen, within } from "@testing-library/react"
import "@testing-library/jest-dom/vitest"
import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}))
import HomePage from "@/app/page"
import PricingPage from "@/app/pricing/page"
import { Header } from "@/components/header"
import { homepageContent, navigationContent, pricingContent } from "@/lib/content"
import { getEnquiryCapabilities } from "@/lib/enquiry-contract"
import { isSitePublic } from "@/lib/config"
import { coreTelloyaCapabilities, overagePolicy, relaunchGuardAddon } from "@/lib/pricing"

afterEach(() => {
  cleanup()
})

const standardEntitlementLine = "1 operating location · 1 receptionist number"

describe("homepage pricing period", () => {
  it("shows /month on standard prices and leaves Custom as a quotation", () => {
    render(<HomePage />)
    const plans = screen.getByRole("region", { name: /four plans/i })
    const cards = within(plans).getAllByRole("article")
    expect(cards.map((card) => within(card).getByRole("heading").textContent)).toEqual([
      "Basic",
      "Growth",
      "Pro",
      "Custom",
    ])

    expect(within(cards[0]).getByText("£49")).toBeInTheDocument()
    expect(within(cards[0]).getByText("/month")).toBeInTheDocument()
    expect(within(cards[0]).getByText("120 minutes/month")).toBeInTheDocument()
    expect(within(cards[1]).getByText("£79")).toBeInTheDocument()
    expect(within(cards[1]).getByText("/month")).toBeInTheDocument()
    expect(within(cards[1]).getByText("300 minutes/month")).toBeInTheDocument()
    expect(within(cards[1]).getByText("Recommended")).toBeInTheDocument()
    expect(within(cards[2]).getByText("£120")).toBeInTheDocument()
    expect(within(cards[2]).getByText("/month")).toBeInTheDocument()
    expect(within(cards[2]).getByText("500 minutes/month")).toBeInTheDocument()

    expect(within(cards[3]).getAllByText("By quotation")).toHaveLength(2)
    expect(within(cards[3]).queryByText("/month")).not.toBeInTheDocument()
    expect(homepageContent.plans.tiers.map((tier) => tier.pricePeriod)).toEqual(["/month", "/month", "/month", null])
  })

  it("keeps the approved headline and navigation", () => {
    render(<HomePage />)
    const heading = screen.getByRole("heading", { level: 1 })
    expect(heading).toHaveTextContent("Don't Let Missed Calls")
    expect(heading).toHaveTextContent("Cost You Customers.")

    cleanup()
    render(<Header />)
    expect(navigationContent.main.map((item) => [item.label, item.href])).toEqual([
      ["How It Works", "/how-it-works"],
      ["Features", "/features"],
      ["Industries", "/industries"],
      ["Pricing", "/pricing"],
      ["See Example", "/demo"],
    ])
    expect(screen.getAllByRole("link", { name: "See Example" }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole("link", { name: "Customer Login" }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole("link", { name: "Enquire about Telloya" }).every((link) => link.getAttribute("href") === "/enquire")).toBe(true)
  })
})

describe("pricing page presentation", () => {
  it("keeps four cards, a shared capability panel, and the Custom quotation list", () => {
    render(<PricingPage />)
    const plans = screen.getByRole("region", { name: "Telloya pricing plans" })
    const cards = within(plans).getAllByRole("article")
    expect(cards).toHaveLength(4)
    expect(cards.map((card) => card.getAttribute("data-tier"))).toEqual(["basic", "growth", "pro", "custom"])

    for (const card of cards.slice(0, 3)) {
      expect(within(card).getByText(standardEntitlementLine)).toBeInTheDocument()
      expect(within(card).queryByRole("list")).not.toBeInTheDocument()
    }
    expect(within(plans).getAllByText(standardEntitlementLine)).toHaveLength(3)
    expect(within(cards[3]).queryByText(standardEntitlementLine)).not.toBeInTheDocument()
    expect(within(cards[3]).getByRole("link", { name: /Request a tailored quote/i })).toHaveAttribute("href", "/enquire?plan=custom")
    for (const feature of [
      "Operating locations by quotation",
      "Receptionist numbers by quotation",
      "Minute allowance by quotation",
      "Voice, accent and language preferences, subject to the voice provider",
      "Configuration by quotation",
    ]) {
      expect(within(cards[3]).getByText(feature)).toBeInTheDocument()
    }

    expect(within(cards[1]).getByText("Recommended")).toBeInTheDocument()
    expect(within(cards[1]).getByText("For growing call volumes")).toBeInTheDocument()
    expect(pricingContent.plans.find((plan) => plan.tier === "growth")?.popular).toBe(true)

    const shared = within(plans).getByRole("heading", { name: "Included with Basic, Growth and Pro" })
    const panel = shared.parentElement as HTMLElement
    expect(within(panel).getAllByRole("listitem").map((item) => item.textContent)).toEqual([...coreTelloyaCapabilities])
    expect(pricingContent.standardIncludes.features).toBe(coreTelloyaCapabilities)
    expect(within(panel).getByText(pricingContent.standardIncludes.note)).toBeInTheDocument()
    expect(screen.getAllByText("Conversational enquiry collection")).toHaveLength(1)

    expect(within(cards[0]).getByRole("link", { name: /Enquire about Basic/i })).toHaveAttribute("href", "/enquire?plan=basic")
    expect(within(cards[1]).getByRole("link", { name: /Enquire about Growth/i })).toHaveAttribute("href", "/enquire?plan=growth")
    expect(within(cards[2]).getByRole("link", { name: /Enquire about Pro/i })).toHaveAttribute("href", "/enquire?plan=pro")
  })

  it("keeps Guard optional, separately priced, and correctly combined", () => {
    render(<PricingPage />)
    const guard = screen.getByRole("region", { name: "Relaunch Guard" })
    expect(within(guard).getByText("Optional add-on — not required")).toBeInTheDocument()
    expect(within(guard).getByText("£9.99")).toBeInTheDocument()
    expect(within(guard).getByText("/location/month")).toBeInTheDocument()
    expect(relaunchGuardAddon.pricePerLocationGbp).toBe(9.99)
    const guardText = guard.textContent?.replace(/\s+/g, " ")
    expect(guardText).toContain("£49 + £9.99 = £58.99/month")
    expect(guardText).toContain("£79 + £9.99 = £88.99/month")
    expect(guardText).toContain("£120 + £9.99 = £129.99/month")
    expect(pricingContent.guard.examples.map((example) => Number(example.combinedPrice.toFixed(2)))).toEqual([58.99, 88.99, 129.99])
  })

  it("exposes the existing comparison rows with column and row headings", () => {
    render(<PricingPage />)
    const region = screen.getByRole("region", { name: "Telloya plan comparison" })
    expect(region).toHaveAttribute("tabindex", "0")
    expect(region).not.toHaveAttribute("aria-describedby")
    const hint = screen.getByText("Scroll sideways to compare all plans.")
    expect(hint).toHaveAttribute("id", "comparison-scroll-hint")
    expect(hint).toHaveAttribute("hidden")

    const table = within(region).getByRole("table", { name: "Telloya plan features and allowances" })
    const columnHeaders = within(table).getAllByRole("columnheader")
    expect(columnHeaders.map((header) => header.textContent)).toEqual(["Feature", "Basic", "Growth", "Pro", "Custom"])
    expect(columnHeaders.every((header) => header.getAttribute("scope") === "col")).toBe(true)

    const rowHeaders = within(table).getAllByRole("rowheader")
    expect(rowHeaders.map((header) => header.textContent)).toEqual(pricingContent.comparison.table.rows.map((row) => row[0]))
    expect(rowHeaders.every((header) => header.getAttribute("scope") === "row")).toBe(true)
    expect(within(table).getAllByRole("cell", { name: "Planned" })).toHaveLength(4)
    expect(within(table).getAllByRole("cell", { name: "Request" })).toHaveLength(4)
    expect(within(table).getByRole("rowheader", { name: "Monthly price" }).closest("tr")?.textContent).toBe("Monthly price£49£79£120By quotation")
    expect(within(table).getByRole("rowheader", { name: "Included minutes/month" }).closest("tr")?.textContent).toBe("Included minutes/month120300500Custom")
    expect(within(table).getByRole("rowheader", { name: "Operating locations" }).closest("tr")?.textContent).toBe("Operating locations111Quotation")
    expect(within(table).getByRole("rowheader", { name: "Receptionist numbers" }).closest("tr")?.textContent).toBe("Receptionist numbers111Quotation")

    region.focus()
    expect(region).toHaveFocus()
    expect(region.querySelector("script")).toBeNull()

    const css = readFileSync(resolve(process.cwd(), "app/pricing/pricing.module.css"), "utf8")
    const pageSource = readFileSync(resolve(process.cwd(), "app/pricing/page.tsx"), "utf8")
    expect(pageSource).not.toContain("dangerouslySetInnerHTML")
    expect(pageSource).not.toContain("<script")
    expect(css).toContain("overflow-x: auto;")
    expect(css).toContain(".scrollHint {\n  display: none;")
    expect(css).toMatch(/\.scrollHint\[data-visible="true"\] \{\n  display: block;\n\}/)
    expect(css.slice(css.indexOf("@media (max-width: 900px)"))).not.toContain(".scrollHint")
    expect(css).toContain(".tableContainer:focus-visible")
    expect(css).toContain(".visuallyHidden")
  })

  it("shows the comparison hint only while the table overflows", () => {
    render(<PricingPage />)
    const region = screen.getByRole("region", { name: "Telloya plan comparison" })
    const hint = screen.getByText("Scroll sideways to compare all plans.")

    const setWidths = (scrollWidth: number, clientWidth: number) => {
      Object.defineProperty(region, "scrollWidth", { configurable: true, get: () => scrollWidth })
      Object.defineProperty(region, "clientWidth", { configurable: true, get: () => clientWidth })
    }

    setWidths(565, 324)
    act(() => window.dispatchEvent(new Event("resize")))
    expect(hint).not.toHaveAttribute("hidden")
    expect(hint).toHaveAttribute("data-visible", "true")
    expect(region).toHaveAttribute("aria-describedby", "comparison-scroll-hint")

    setWidths(702, 702)
    act(() => window.dispatchEvent(new Event("resize")))
    expect(hint).toHaveAttribute("hidden")
    expect(hint).toHaveAttribute("data-visible", "false")
    expect(region).not.toHaveAttribute("aria-describedby")

    setWidths(703, 702)
    act(() => window.dispatchEvent(new Event("resize")))
    expect(hint).toHaveAttribute("hidden")
  })

  it("leaves overage, enquiry submission and launch controls unchanged", () => {
    expect(overagePolicy).toEqual({ pricePerMinuteGbp: 0.25, requiresOptIn: true, requiresSpendingCap: true })
    expect(pricingContent.overage.points).toEqual([
      "Only available after a separate explicit opt-in",
      "Requires a customer-defined monthly spending cap",
      "Enquiry interest is not authorisation to charge for overage.",
      "No unapproved automatic billing",
    ])
    expect(getEnquiryCapabilities({})).toEqual({ submissionEnabled: false })
    expect(isSitePublic({ VERCEL_ENV: "production", TELLOYA_LAUNCHED: "false" })).toBe(false)
    expect(isSitePublic({})).toBe(false)
  })
})
