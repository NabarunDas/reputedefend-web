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

function tile(name: string) {
  const heading = screen.getByRole("heading", { name })
  const article = heading.closest("article")
  if (!article) throw new Error(name)
  return article
}

describe("My Products", () => {
  it("uses one heading and does not render the legacy dashboard navigation", () => {
    render(<ProductsView products={cards} />)
    const headings = screen.getAllByRole("heading", { level: 1 })
    expect(headings).toHaveLength(1)
    expect(headings[0]).toHaveTextContent("My Products")
    expect(screen.getByText("Customer portal")).toBeTruthy()
    expect(screen.getByText("Manage your services from ProfileRelaunch")).toBeTruthy()
    expect(screen.queryByText("Ada Okonkwo")).toBeNull()
    expect(screen.queryByText("My account")).toBeNull()
    expect(screen.getByRole("link", { name: "Account" })).toHaveAttribute("href", "/portal/account")
    expect(screen.getByRole("button", { name: "Sign out" })).toBeEnabled()
    expect(screen.getByRole("heading", { name: "Explore more services" })).toBeTruthy()
    expect(screen.getByRole("heading", { name: "Status unavailable" })).toBeTruthy()
    expect(screen.queryByRole("heading", { name: "Your services" })).toBeNull()
    expect(screen.getByText("Nothing is ready to open yet.")).toBeTruthy()
    expect(screen.queryByText("My ProfileRelaunch")).toBeNull()
    expect(screen.queryByRole("link", { name: "Dashboard" })).toBeNull()
    expect(screen.queryByRole("link", { name: "Cases" })).toBeNull()
    expect(screen.queryByRole("link", { name: "Documents" })).toBeNull()
    expect(screen.queryByRole("link", { name: "Messages" })).toBeNull()
    expect(screen.queryByRole("link", { name: "Payments" })).toBeNull()
    expect(document.body.textContent).not.toContain("A sign-in does not start a subscription")
    expect(screen.getByRole("heading", { level: 3, name: "Recovery & Review Support" })).toBeTruthy()
    expect(screen.getByRole("heading", { level: 3, name: "Relaunch Guard" })).toBeTruthy()
    expect(screen.getByRole("heading", { level: 3, name: "Telloya" })).toBeTruthy()
    expect(screen.getAllByText("Status temporarily unavailable").length).toBeGreaterThan(0)
    expect(screen.queryByText("Being explored")).toBeNull()
    expect(screen.queryByText("Unavailable right now")).toBeNull()
    expect(screen.queryByText("Not subscribed")).toBeNull()
    expect(screen.queryByRole("link", { name: "Open dashboard" })).toBeNull()
    expect(screen.getByText("Telloya is not open in your portal yet.")).toBeTruthy()
    expect(screen.getByRole("link", { name: "Email us about Telloya" })).toHaveAttribute("href", "mailto:contact@profilerelaunch.com")
    expect(document.body.textContent).not.toMatch(/\b(Active|Paid|Trial|Subscribed)\b/)
    for (const control of document.querySelectorAll("a, button")) {
      expect((control.textContent || "").trim().length).toBeGreaterThan(0)
      expect(control.querySelector("a, button")).toBeNull()
    }
  })

  it("links Recovery and Guard only where a real workspace is available", () => {
    render(<ProductsView products={presentProducts({
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
    expect(screen.getByRole("link", { name: "Account" })).toHaveAttribute("href", "/portal/account")
    expect(screen.queryByText("My account")).toBeNull()
    expect(screen.getByRole("heading", { name: "Your services" })).toBeTruthy()
    const recovery = tile("Recovery & Review Support")
    expect(recovery.querySelector("a")).toHaveAttribute("href", "/portal/recovery")
    expect(recovery.querySelector("a")).toHaveTextContent("Open dashboard")
    const guard = tile("Relaunch Guard")
    expect(guard.querySelector("a")).toHaveAttribute("href", "/portal/guard")
    expect(guard.querySelector("a")).toHaveTextContent("Open dashboard")
    expect(screen.getAllByRole("link", { name: "Open dashboard" })).toHaveLength(2)
    expect(screen.getByText("1 case needs your attention")).toBeTruthy()
    expect(document.body.textContent).not.toContain("A case is not a subscription")
    expect(screen.getByText(/Monitoring is recorded for 1 location\./)).toBeTruthy()
    const telloya = tile("Telloya")
    expect(telloya.querySelector("a")).toHaveAttribute("href", "mailto:contact@profilerelaunch.com")
    expect(telloya.querySelector("a")).toHaveTextContent("Email us about Telloya")
    expect(telloya.textContent).not.toContain("Open dashboard")
    expect(screen.queryByRole("navigation", { name: "Customer portal" })).toBeNull()
  })

  it("shows a projection status without a subscribe link or a Telloya route", () => {
    render(<ProductsView products={presentProducts({
      recovery: { status: "unavailable" },
      guard: { status: "ready", locations: [{ businessName: "Harbour Bakery", monitoringActive: true }] },
      commercial: {
        reads: { telloya: "ok", guard: "unavailable" },
        businesses: [{
          businessName: "Harbour Bakery",
          telloya: {
            status: "ready_for_provider",
            locations: [
              { locationName: "High Street", status: "active", nextStep: null },
              { locationName: "Dock", status: "ready_for_provider", nextStep: "This location is waiting for provider verification." },
            ],
          },
          guard: { status: "unavailable", locations: [] },
        }],
      },
    })} />)
    expect(screen.getByText("Partially active")).toBeTruthy()
    expect(screen.getAllByText(/Status temporarily unavailable/).length).toBeGreaterThan(0)
    expect(screen.getByText(/Monitoring is recorded for 1 location\./)).toBeTruthy()
    expect(screen.getByText(/Some extra details are temporarily unavailable. Monitoring already recorded is unchanged/)).toBeTruthy()
    expect(screen.queryByText("You can open this")).toBeNull()
    expect(screen.queryByText("Not subscribed")).toBeNull()
    expect(tile("Relaunch Guard").querySelector("a")).toHaveAttribute("href", "/portal/guard")
    expect(tile("Telloya").querySelector("a")).toBeNull()
    expect(tile("Recovery & Review Support").querySelector("a")).toBeNull()
    expect(document.body.textContent).not.toMatch(/stopped|no longer/)
    expect(screen.queryByRole("link", { name: /subscribe/i })).toBeNull()
    expect(document.body.innerHTML).not.toContain("/portal/telloya")
    expect(document.body.textContent).not.toMatch(/\bPaid\b/)
  })

  it("offers assessment and contact actions without opening a dashboard that does not exist", () => {
    render(<ProductsView products={presentProducts({
      recovery: {
        status: "ready",
        dashboard: {
          summary: { activeCases: 0, attentionCases: 0, previousCases: 0 },
          attentionCases: [],
          recentCases: [],
        },
      },
      guard: { status: "ready", locations: [] },
      commercial: {
        reads: { telloya: "ok", guard: "ok" },
        businesses: [],
      },
    })} />)
    expect(screen.getByText("Nothing is ready to open yet.")).toBeTruthy()
    expect(screen.queryByRole("heading", { name: "Your services" })).toBeNull()
    expect(screen.getByRole("link", { name: "Start an assessment" })).toHaveAttribute("href", "https://profilerelaunch.com/get-help")
    expect(screen.getByRole("link", { name: "Enquire about Relaunch Guard" })).toHaveAttribute("href", "https://profilerelaunch.com/get-help")
    expect(screen.getByRole("link", { name: "Email us about Telloya" })).toHaveAttribute("href", "mailto:contact@profilerelaunch.com")
    expect(screen.queryByRole("link", { name: "Open dashboard" })).toBeNull()
    expect(screen.getAllByText("Not subscribed")).toHaveLength(2)
  })

  it("shows a paid Guard package without naming an unassigned location", () => {
    const commercial = {
      reads: { telloya: "ok" as const, guard: "ok" as const },
      businesses: [{
        businessName: "Complete Kitchen",
        telloya: {
          status: "pending" as const,
          locations: [
            { locationName: "Oven", status: "pending" as const, nextStep: "Payment received. Your AI receptionist setup has not started." },
            { locationName: "Counter", status: "pending" as const, nextStep: "Payment received. Your AI receptionist setup has not started." },
            { locationName: "Pantry", status: "pending" as const, nextStep: "Payment received. Your AI receptionist setup has not started." },
          ],
        },
        guard: {
          status: "pending" as const,
          includedQuantity: 1,
          assignment: "pending_confirmation" as const,
          locations: [],
        },
      }],
    }
    const { unmount } = render(<ProductsView products={presentProducts({
      recovery: { status: "unavailable" },
      guard: { status: "unavailable" },
      commercial,
    })} />)
    const pending = tile("Relaunch Guard")
    expect(pending.textContent).toContain("Setup pending")
    expect(pending.textContent).toContain("1 location included.")
    expect(pending.textContent).toContain("Guard location assignment is pending confirmation.")
    expect(pending.textContent).toContain("Monitoring has not started.")
    expect(pending.textContent).not.toContain("Oven")
    expect(pending.textContent).not.toContain("Counter")
    expect(pending.textContent).not.toContain("Pantry")
    unmount()

    render(<ProductsView products={presentProducts({
      recovery: { status: "unavailable" },
      guard: { status: "unavailable" },
      commercial: {
        ...commercial,
        businesses: [{
          ...commercial.businesses[0],
          guard: {
            status: "pending" as const,
            includedQuantity: 1,
            assignment: "recorded" as const,
            locations: [{
              locationName: "Counter",
              status: "pending" as const,
              monitoringRecorded: false,
              allocation: "reserved" as const,
              nextStep: "Included in your package. Monitoring setup is pending.",
            }],
          },
        }],
      },
    })} />)
    const assigned = tile("Relaunch Guard")
    expect(assigned.textContent).toContain("Assigned: Counter.")
    expect(assigned.textContent).toContain("Monitoring has not started.")
    expect(assigned.textContent).not.toContain("Oven")
    expect(assigned.textContent).not.toContain("Pantry")
    expect(assigned.textContent).not.toMatch(/monitoring is active|Monitoring is recorded/i)
  })

  it("has a loading state and comfortable touch, focus, and responsive rules", () => {
    render(<ProductsLoading />)
    expect(screen.getByRole("status")).toHaveTextContent("Loading your products")
    expect(screen.getByRole("heading", { name: "My Products" })).toBeTruthy()
    expect(screen.getByRole("link", { name: "Account" })).toHaveAttribute("href", "/portal/account")
    expect(screen.queryByRole("navigation", { name: "Customer portal" })).toBeNull()
    expect(screen.queryByText("My ProfileRelaunch")).toBeNull()
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
