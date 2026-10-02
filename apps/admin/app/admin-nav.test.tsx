// @vitest-environment jsdom
import React from "react"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { AdminNav } from "./admin-nav"
import { activeNavGroup, adminNavigation, allNavLinks, linksIn, matchingNavLinks, type NavGroup, type NavSubgroup } from "./admin-nav-model"
import "@testing-library/jest-dom/vitest"

vi.mock("next/link", () => ({
  default({ href, children, ...props }: { href: string; children: React.ReactNode } & Record<string, unknown>) {
    return <a href={href} {...props}>{children}</a>
  },
}))

afterEach(() => cleanup())

const previousDestinations: Array<[string, string | null]> = [
  ["/", "Today"],
  ["/search", null],
  ["/enquiries", "Intake"],
  ["/records/client", "Clients & businesses"],
  ["/cases", "Cases"],
  ["/documents", "Documents"],
  ["/tasks", "Tasks"],
  ["/activity", "Activity"],
  ["/reports", "Reports"],
  ["/communications", "Communications"],
  ["/conversations", "Conversations"],
  ["/commercial", "Commercial"],
  ["/money", "Money"],
  ["/guard", "Overview"],
  ["/guard/checks", "Checks"],
  ["/guard/alerts", "Alerts"],
  ["/operations/jobs", "Jobs"],
  ["/settings", "Settings"],
  ["/privacy", "Privacy"],
  ["/complaints", "Complaints"],
  ["/incidents", "Incidents"],
  ["/security", "Security"],
]

/** path, the one current link, and the group that should open, if any. */
const coverage: Array<[string, string, string | null]> = [
  ["/", "Today", null],
  ["/enquiries", "Intake", null],
  ["/enquiries/new", "Intake", null],
  ["/cases", "Cases", null],
  ["/cases/case-1", "Cases", null],
  ["/cases/case-1/evidence", "Cases", null],
  ["/guard", "Overview", "Guard"],
  ["/guard/locations", "Overview", "Guard"],
  ["/guard/checks", "Checks", "Guard"],
  ["/guard/checks/obligation-1", "Checks", "Guard"],
  ["/guard/alerts", "Alerts", "Guard"],
  ["/guard/alerts/alert-1", "Alerts", "Guard"],
  ["/commercial", "Commercial", "Finance"],
  ["/commercial/quotes", "Commercial", "Finance"],
  ["/money", "Money", "Finance"],
  ["/reports", "Reports", null],
  ["/reports/open_cases", "Reports", null],
  ["/records/client", "Clients & businesses", "Operations"],
  ["/records/business/new", "Clients & businesses", "Operations"],
  ["/documents", "Documents", "Operations"],
  ["/tasks", "Tasks", "Operations"],
  ["/communications", "Communications", "Operations"],
  ["/conversations", "Conversations", "Operations"],
  ["/complaints", "Complaints", "Operations"],
  ["/complaints/complaint-1", "Complaints", "Operations"],
  ["/incidents", "Incidents", "Operations"],
  ["/activity", "Activity", "Operations"],
  ["/operations/jobs", "Jobs", "Operations"],
  ["/privacy", "Privacy", "Operations"],
  ["/security", "Security", "Operations"],
  ["/settings", "Settings", null],
  ["/settings/section", "Settings", null],
]

function currentLinks() {
  return screen.getAllByRole("link").filter(link => link.getAttribute("aria-current") === "page")
}

function disclosure(name: string) {
  const summary = screen.getByText(name, { selector: "summary" })
  expect(summary.tagName).toBe("SUMMARY")
  expect(summary).not.toHaveAttribute("aria-current")
  const details = summary.closest("details")
  if (!details) throw new Error(`${name} is not a disclosure`)
  return details
}

describe("the navigation model", () => {
  it("leads with the work, then the service areas, then support", () => {
    expect(adminNavigation.map(entry => entry.label)).toEqual([
      "Today",
      "Intake",
      "Cases",
      "Guard",
      "Finance",
      "Reports",
      "Operations",
      "Settings",
    ])
  })

  it("keeps every href and every peer label unique, and every group populated", () => {
    const hrefs = allNavLinks().map(item => item.href)
    expect(new Set(hrefs).size).toBe(hrefs.length)
    expect(new Set(adminNavigation.map(entry => entry.label)).size).toBe(adminNavigation.length)
    for (const entry of adminNavigation) {
      if (entry.kind !== "group") continue
      expect(entry.children.length).toBeGreaterThan(0)
      const peerLabels = entry.children.map(child => child.label)
      expect(new Set(peerLabels).size).toBe(peerLabels.length)
      for (const child of entry.children) {
        if (child.kind !== "subgroup") continue
        expect(child.children.length).toBeGreaterThan(0)
        expect(new Set(child.children.map(item => item.label)).size).toBe(child.children.length)
        for (const item of child.children) expect(typeof item.match).toBe("function")
      }
    }
  })

  it("gives Guard, Finance and Operations the children agreed for each", () => {
    const group = (id: string) => adminNavigation.find(entry => entry.kind === "group" && entry.id === id) as NavGroup
    expect(linksIn(group("guard")).map(item => [item.label, item.href])).toEqual([
      ["Overview", "/guard"],
      ["Checks", "/guard/checks"],
      ["Alerts", "/guard/alerts"],
    ])
    expect(linksIn(group("finance")).map(item => [item.label, item.href])).toEqual([
      ["Commercial", "/commercial"],
      ["Money", "/money"],
    ])
    const operations = group("operations").children as NavSubgroup[]
    expect(operations.map(subgroup => [subgroup.label, subgroup.children.map(item => item.label)])).toEqual([
      ["Records & support", ["Clients & businesses", "Documents", "Tasks", "Communications", "Conversations"]],
      ["Oversight", ["Complaints", "Incidents", "Activity", "Jobs"]],
      ["Governance", ["Privacy", "Security"]],
    ])
  })

  it("lets exactly one link own each destination, including a child of that destination", () => {
    for (const item of allNavLinks()) {
      expect(matchingNavLinks(item.href).map(match => match.href)).toEqual([item.href])
      if (item.href === "/") continue
      expect(matchingNavLinks(`${item.href}/child`).map(match => match.href)).toEqual([item.href])
    }
    expect(matchingNavLinks("/search")).toEqual([])
    expect(matchingNavLinks("/guard/checks").map(match => match.label)).toEqual(["Checks"])
    expect(matchingNavLinks("/records/business").map(match => match.label)).toEqual(["Clients & businesses"])
  })
})

describe("what the sidebar renders", () => {
  it("shows eight top-level entries and no second Search", () => {
    render(<AdminNav pathname="/" />)
    const nav = screen.getByRole("navigation", { name: "Admin workspace" })
    const top = [...nav.querySelectorAll(":scope > .admin-nav-list > li")].map(item =>
      item.querySelector(":scope > a, :scope > details > summary")?.textContent,
    )
    expect(top).toEqual(["Today", "Intake", "Cases", "Guard", "Finance", "Reports", "Operations", "Settings"])
    expect(nav.querySelector("a[href='/search']")).toBeNull()
    expect(nav.querySelector("a[href='/finance']")).toBeNull()
    expect(nav.querySelector("a[href='/operations']")).toBeNull()
    expect(nav.querySelectorAll("nav")).toHaveLength(0)
    expect(nav.textContent).not.toContain("admin@profilerelaunch.com")
  })

  it("still offers every destination the flat sidebar used to offer", () => {
    render(<AdminNav pathname="/" />)
    for (const [href, label] of previousDestinations) {
      if (!label) {
        expect(screen.queryByRole("link", { name: "Search" })).toBeNull()
        continue
      }
      expect(screen.getByRole("link", { name: label, hidden: true })).toHaveAttribute("href", href)
    }
  })

  it.each(coverage)("marks %s as %s and opens %s", (pathname, label, group) => {
    render(<AdminNav pathname={pathname} />)
    const current = currentLinks()
    expect(current).toHaveLength(1)
    expect(current[0]).toHaveAccessibleName(label)
    expect(current[0]).toHaveAttribute("aria-current", "page")
    for (const name of ["Guard", "Finance", "Operations"]) {
      const details = disclosure(name)
      expect(details.querySelector("summary")).not.toHaveAttribute("aria-current")
      expect(details.hasAttribute("open")).toBe(name === group)
    }
    if (group) {
      const details = disclosure(group)
      expect(details).toHaveAttribute("open")
      expect(details).toHaveClass("is-active")
      expect(activeNavGroup(pathname)?.label).toBe(group)
    } else {
      expect(activeNavGroup(pathname)).toBeUndefined()
    }
  })

  it("does not mark a sidebar link current on search", () => {
    render(<AdminNav pathname="/search" />)
    expect(currentLinks()).toHaveLength(0)
    expect(screen.getByRole("link", { name: "Today" })).not.toHaveAttribute("aria-current")
  })

  it("lets a closed group be opened, and does not snap it shut again", () => {
    const { rerender } = render(<AdminNav pathname="/" />)
    const guard = disclosure("Guard")
    expect(guard).not.toHaveAttribute("open")
    fireEvent.click(screen.getByText("Guard", { selector: "summary" }))
    expect(guard).toHaveAttribute("open")
    expect(screen.getByRole("link", { name: "Overview" })).not.toHaveAttribute("aria-current")
    rerender(<AdminNav pathname="/" />)
    expect(disclosure("Guard")).toHaveAttribute("open")
    expect(currentLinks().map(link => link.textContent)).toEqual(["Today"])
  })

  it("lets an open active group be closed on this page, then opens it again on the next route", () => {
    const { rerender } = render(<AdminNav pathname="/money" />)
    expect(disclosure("Finance")).toHaveAttribute("open")
    expect(screen.getByRole("link", { name: "Money" })).toHaveAttribute("aria-current", "page")
    fireEvent.click(screen.getByText("Finance", { selector: "summary" }))
    expect(disclosure("Finance")).not.toHaveAttribute("open")
    rerender(<AdminNav pathname="/money" />)
    expect(disclosure("Finance")).not.toHaveAttribute("open")
    rerender(<AdminNav pathname="/commercial" />)
    expect(disclosure("Finance")).toHaveAttribute("open")
    expect(currentLinks().map(link => link.textContent)).toEqual(["Commercial"])
  })
})
