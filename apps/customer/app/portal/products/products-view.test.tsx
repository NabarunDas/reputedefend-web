// @vitest-environment jsdom
import { readFileSync } from "node:fs"
import { join } from "node:path"
import React from "react"
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import "@testing-library/jest-dom/vitest"
import { presentProducts, type ProductCard } from "@/lib/portal/products/present"
import { ProductsLoading, ProductsView } from "./products-view"

const cards: ProductCard[] = presentProducts({
  recovery: { status: "unavailable" },
  guard: { status: "unavailable" },
})

afterEach(cleanup)

describe("My Products", () => {
  it("uses one heading, three cards, and one action only where a real route exists", () => {
    render(<ProductsView accountName="Ada Okonkwo" products={cards} />)
    const headings = screen.getAllByRole("heading", { level: 1 })
    expect(headings).toHaveLength(1)
    expect(headings[0]).toHaveTextContent("My Products")
    expect(screen.getByText("Welcome back, Ada Okonkwo")).toBeTruthy()
    expect(screen.getByText("Manage your services in one place.")).toBeTruthy()
    expect(screen.getByRole("heading", { level: 2, name: "Recovery & Reviews" })).toBeTruthy()
    expect(screen.getByRole("heading", { level: 2, name: "Relaunch Guard" })).toBeTruthy()
    expect(screen.getByRole("heading", { level: 2, name: "Telloya" })).toBeTruthy()
    expect(screen.getAllByText("Unavailable right now")).toHaveLength(2)
    expect(screen.getByText("Being explored")).toBeTruthy()
    expect(screen.queryByRole("link")).toBeNull()
    expect(screen.getByText("Telloya is not open in your portal yet.")).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/\b(Active|Paid|Trial|Subscribed)\b/)
    for (const control of document.querySelectorAll("a, button")) {
      expect((control.textContent || "").trim().length).toBeGreaterThan(0)
      expect(control.querySelector("a, button")).toBeNull()
    }
  })

  it("links Recovery and Guard only to their existing portal routes", () => {
    render(<ProductsView accountName={null} products={presentProducts({
      recovery: {
        status: "ready",
        dashboard: {
          summary: { activeCases: 1, attentionCases: 1, previousCases: 0 },
          attentionCases: [{
            reference: "PR-26-ABCDEF",
            caseType: "PROFILE_RECOVERY",
            serviceTrack: "MANAGED",
            businessName: "Harbour Bakery",
            locationName: null,
            status: "UNDER_REVIEW",
            workStage: "EVIDENCE_COLLECTION",
            submittedAt: "2026-10-08T12:00:00.000Z",
            closedAt: null,
            attentionItems: [],
          }],
          recentCases: [],
        },
      },
      guard: { status: "ready", locations: [{ businessName: "Harbour Bakery", monitoringActive: true }] },
    })} />)
    expect(screen.getByText("Welcome back")).toBeTruthy()
    expect(screen.getByRole("link", { name: "Open Recovery & Reviews" })).toHaveAttribute("href", "/portal/recovery")
    expect(screen.getByRole("link", { name: "Open Relaunch Guard" })).toHaveAttribute("href", "/portal/guard")
    expect(screen.getAllByRole("link")).toHaveLength(2)
    expect(screen.getByText("1 case needs your attention")).toBeTruthy()
    expect(screen.getByText("Harbour Bakery. Monitoring is recorded for 1 location.")).toBeTruthy()
    const telloya = screen.getByRole("heading", { name: "Telloya" }).closest("article")
    expect(telloya?.querySelector("a")).toBeNull()
  })

  it("has a loading state and comfortable touch, focus, and responsive rules", () => {
    render(<ProductsLoading />)
    expect(screen.getByRole("status")).toHaveTextContent("Loading your products")
    const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8")
    const hub = css.slice(css.indexOf("/* My Products."))
    expect(hub).toContain("min-height: 44px")
    expect(hub).toContain(".products-action:focus-visible")
    expect(hub).toContain("color: var(--paper)")
    expect(hub).toMatch(/@media \(min-width: 768px\)/)
    expect(hub).toMatch(/@media \(min-width: 1024px\)/)
    expect(hub).not.toContain("overflow-x")
    expect(hub).toContain("background: color-mix(in srgb, var(--lime) 24%, var(--surface))")
  })
})
